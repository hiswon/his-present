import { useState, useRef, useEffect } from 'react';
import {
  ref,
  onValue,
  set,
  update,
  get,
  runTransaction,
} from 'firebase/database';
import { db } from './firebase';
import './Page11.css';

type MarbleColor = 'BLACK' | 'WHITE';
type CellValue = MarbleColor | null;
type OrbitDirection = 'CCW' | 'CW';
type TurnPhase = 'PUSH_OR_PLACE' | 'PLACE_ONLY' | 'READY_ORBIT';

interface Coord {
  r: number;
  c: number;
}

interface OrbitoPlayer {
  id: string;
  name: string;
  color: MarbleColor;
  wins: number;
  movesCount: number;
}

interface WaitlistPlayer {
  id: string;
  name: string;
}

interface SpectatorPlayer {
  id: string;
  name: string;
}

interface NetOrbitoRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'PLAYING' | 'ROUND_OVER';
  players: OrbitoPlayer[];
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  targetWins: number;
  baseTimeout: number;
  orbitDirection: OrbitDirection;
  round: number;
  boardFlat: string;
  currentTurn: MarbleColor;
  turnPhase: TurnPhase;
  selectedPushFrom: Coord | null;
  lastPlaced: Coord | null;
  winningLine: Coord[];
  extraOrbitsLeft: number;
  turnDeadline: number | null;
  roundWinnerId: string | null;
  isDraw: boolean;
  lastActionNotice: string;
  consecutiveTimeouts: number;
  waitingSince: number | null;
}

interface HallOfFameRecord {
  id: string;
  name: string;
  recordDetail: string;
  date: string;
}

const BOARD_SIZE = 4;

// 바깥쪽 12칸 궤도 (반시계 방향 순서)
const OUTER_RING_CCW: Coord[] = [
  { r: 0, c: 0 },
  { r: 1, c: 0 },
  { r: 2, c: 0 },
  { r: 3, c: 0 },
  { r: 3, c: 1 },
  { r: 3, c: 2 },
  { r: 3, c: 3 },
  { r: 2, c: 3 },
  { r: 1, c: 3 },
  { r: 0, c: 3 },
  { r: 0, c: 2 },
  { r: 0, c: 1 },
];

// 안쪽 4칸 궤도 (반시계 방향 순서)
const INNER_RING_CCW: Coord[] = [
  { r: 1, c: 1 },
  { r: 2, c: 1 },
  { r: 2, c: 2 },
  { r: 1, c: 2 },
];

const TURN_BG_COLORS: Record<MarbleColor, string> = {
  BLACK: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #0f172a 100%)',
  WHITE: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
};

const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

/**
 * 궤도 회전 로직: 바깥 12칸과 안쪽 4칸이 각각 1칸씩 회전
 */
function rotateOrbitoBoard(board: CellValue[][], direction: OrbitDirection): CellValue[][] {
  const nextBoard = board.map((row) => [...row]);

  const shiftRing = (ring: Coord[]) => {
    const len = ring.length;
    for (let i = 0; i < len; i++) {
      const fromCoord = ring[i];
      const toIndex =
        direction === 'CCW' ? (i + 1) % len : (i - 1 + len) % len;
      const toCoord = ring[toIndex];
      nextBoard[toCoord.r][toCoord.c] = board[fromCoord.r][fromCoord.c];
    }
  };

  shiftRing(OUTER_RING_CCW);
  shiftRing(INNER_RING_CCW);

  return nextBoard;
}

/**
 * 상하좌우 인접 빈 칸 탐색 (상대 구슬 밀기용)
 */
function getValidPushTargets(board: CellValue[][], r: number, c: number): Coord[] {
  const dirs: [number, number][] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const targets: Coord[] = [];
  for (const [dr, dc] of dirs) {
    const nr = r + dr;
    const nc = c + dc;
    if (
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      board[nr][nc] === null
    ) {
      targets.push({ r: nr, c: nc });
    }
  }
  return targets;
}

/**
 * 회전 후 흑/백 양쪽의 4목 달성 여부 동시 판정
 */
function evaluateOrbitoBoard(board: CellValue[][]): {
  blackLines: Coord[][];
  whiteLines: Coord[][];
} {
  const allLines: Coord[][] = [];

  // 가로 4줄 & 세로 4줄
  for (let i = 0; i < BOARD_SIZE; i++) {
    allLines.push([
      { r: i, c: 0 },
      { r: i, c: 1 },
      { r: i, c: 2 },
      { r: i, c: 3 },
    ]);
    allLines.push([
      { r: 0, c: i },
      { r: 1, c: i },
      { r: 2, c: i },
      { r: 3, c: i },
    ]);
  }

  // 대각선 2줄
  allLines.push([
    { r: 0, c: 0 },
    { r: 1, c: 1 },
    { r: 2, c: 2 },
    { r: 3, c: 3 },
  ]);
  allLines.push([
    { r: 0, c: 3 },
    { r: 1, c: 2 },
    { r: 2, c: 1 },
    { r: 3, c: 0 },
  ]);

  const blackLines: Coord[][] = [];
  const whiteLines: Coord[][] = [];

  for (const line of allLines) {
    const first = board[line[0].r][line[0].c];
    if (first === null) continue;
    const isFour = line.every((coord) => board[coord.r][coord.c] === first);
    if (isFour) {
      if (first === 'BLACK') blackLines.push(line);
      else whiteLines.push(line);
    }
  }

  return { blackLines, whiteLines };
}

function isBoardFull(board: CellValue[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === null) return false;
    }
  }
  return true;
}

function createDefaultOrbitoRoom(roomId: number): NetOrbitoRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    waitlist: [],
    spectators: [],
    targetWins: 1,
    baseTimeout: 30,
    orbitDirection: 'CCW',
    round: 1,
    boardFlat: JSON.stringify(createEmptyBoard()),
    currentTurn: 'BLACK',
    turnPhase: 'PUSH_OR_PLACE',
    selectedPushFrom: null,
    lastPlaced: null,
    winningLine: [],
    extraOrbitsLeft: 5,
    turnDeadline: null,
    roundWinnerId: null,
    isDraw: false,
    lastActionNotice: '',
    consecutiveTimeouts: 0,
    waitingSince: null,
  };
}

export default function Page11() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('orbito_net_uid');
    if (saved) return saved;
    const generated = `orbito_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('orbito_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetOrbitoRoomData[]>([1, 2, 3, 4].map(createDefaultOrbitoRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetOrbitoRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);

  // 단독게임 상태
  const [soloState, setSoloState] = useState<'SETUP' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [blackName, setBlackName] = useState<string>('블랙 오비터');
  const [whiteName, setWhiteName] = useState<string>('화이트 오비터');
  const [soloTargetWins, setSoloTargetWins] = useState<number>(1);
  const [soloOrbitDir, setSoloOrbitDir] = useState<OrbitDirection>('CCW');
  const [soloPlayers, setSoloPlayers] = useState<OrbitoPlayer[]>([
    { id: 'black', name: '블랙 오비터', color: 'BLACK', wins: 0, movesCount: 0 },
    { id: 'white', name: '화이트 오비터', color: 'WHITE', wins: 0, movesCount: 0 },
  ]);
  const [soloBoard, setSoloBoard] = useState<CellValue[][]>(createEmptyBoard);
  const [soloTurn, setSoloTurn] = useState<MarbleColor>('BLACK');
  const [soloPhase, setSoloPhase] = useState<TurnPhase>('PUSH_OR_PLACE');
  const [soloSelectedPush, setSoloSelectedPush] = useState<Coord | null>(null);
  const [soloLastPlaced, setSoloLastPlaced] = useState<Coord | null>(null);
  const [soloWinningLine, setSoloWinningLine] = useState<Coord[]>([]);
  const [soloRoundWinner, setSoloRoundWinner] = useState<OrbitoPlayer | null>(null);
  const [soloIsDraw, setSoloIsDraw] = useState<boolean>(false);
  const [soloExtraOrbits, setSoloExtraOrbits] = useState<number>(5);
  const [isOrbitAnimating, setIsOrbitAnimating] = useState<boolean>(false);

  // 토스트 & 오디오
  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'celebrate';
  } | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = (text: string, type: 'info' | 'celebrate' = 'info') => {
    setToast({ id: Date.now(), text, type });
  };

  const speakKorean = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playSound = (kind: 'place' | 'push' | 'orbit' | 'win') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioCtx();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const notesMap: Record<typeof kind, number[]> = {
        place: [360, 220],
        push: [260, 310],
        orbit: [440, 554.37, 659.25],
        win: [523.25, 659.25, 783.99, 1046.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'orbit' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.055);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.055);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.055 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.055);
        osc.stop(ctx.currentTime + idx * 0.055 + 0.18);
      });
    } catch {
      // 오디오 권한 제한 무시
    }
  };

  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; recordDetail: string }) => {
    const key = type === 'SOLO' ? 'orbito_hof_solo' : 'orbito_hof_net';
    try {
      const existing: HallOfFameRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
      const newEntry: HallOfFameRecord = {
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: record.name,
        recordDetail: record.recordDetail,
        date: new Date().toLocaleDateString(),
      };
      const updated = [newEntry, ...existing].slice(0, 10);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const getHallOfFameRecords = (type: 'SOLO' | 'NET'): HallOfFameRecord[] => {
    const key = type === 'SOLO' ? 'orbito_hof_solo' : 'orbito_hof_net';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };

  // =========================================================
  // Firebase 실시간 방 구독
  // =========================================================
  useEffect(() => {
    if (appMode !== 'NET_LOBBY' && appMode !== 'NET_ROOM') return;

    const ensureRoomsExist = async () => {
      for (const id of [1, 2, 3, 4]) {
        const roomRef = ref(db, `orbito_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultOrbitoRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'orbito_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const loadedRooms: NetOrbitoRoomData[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultOrbitoRoom(id);
        if (!rData) return def;
        return {
          ...def,
          ...rData,
          players: rData.players || [],
          waitlist: rData.waitlist || [],
          spectators: rData.spectators || [],
          winningLine: rData.winningLine || [],
        };
      });
      setRooms(loadedRooms);
    });

    return () => unsubscribe();
  }, [appMode]);

  const activeNetRoom =
    appMode === 'NET_ROOM' && selectedRoomId
      ? rooms.find((r) => r.roomId === selectedRoomId) || null
      : null;

  // 대기실 7분 타임아웃 및 대국 턴 제한시간 감지
  useEffect(() => {
    if (appMode !== 'NET_ROOM' || !activeNetRoom) {
      setRemainingSeconds(0);
      setWaitingCountdownSec(420);
      return;
    }

    const timer = window.setInterval(async () => {
      const now = Date.now();

      if (activeNetRoom.status === 'WAITING' && activeNetRoom.waitingSince) {
        const elapsedSec = (now - activeNetRoom.waitingSince) / 1000;
        const leftSec = Math.max(0, 420 - Math.floor(elapsedSec));
        setWaitingCountdownSec(leftSec);

        if (elapsedSec >= 425) {
          const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);
          await set(roomRef, createDefaultOrbitoRoom(activeNetRoom.roomId));
          showToast('⏳ 대기 시간이 7분을 초과하여 방이 자동으로 비워졌습니다.', 'info');
          setSelectedRoomId(null);
          setAppMode('NET_LOBBY');
          return;
        }
      }

      if (activeNetRoom.status === 'PLAYING' && activeNetRoom.turnDeadline) {
        const diff = Math.max(0, Math.ceil((activeNetRoom.turnDeadline - now) / 1000));
        setRemainingSeconds(diff);

        if (diff === 0 && timeoutHandledRef.current !== activeNetRoom.turnDeadline) {
          timeoutHandledRef.current = activeNetRoom.turnDeadline;
          handleNetTurnTimeout(activeNetRoom);
        }
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [appMode, activeNetRoom]);

  // =========================================================
  // 넷게임 핸들러
  // =========================================================
  const handleEnterRoomSubmit = async (asSpectator = false) => {
    if (!joinModalRoom) return;
    const trimmedName = joinPlayerName.trim();
    if (!trimmedName) {
      alert('참가할 이름을 입력해주세요!');
      return;
    }

    const roomRef = ref(db, `orbito_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetOrbitoRoomData = roomData || createDefaultOrbitoRoom(joinModalRoom.roomId);
        if (!room.players) room.players = [];
        if (!room.waitlist) room.waitlist = [];
        if (!room.spectators) room.spectators = [];

        if (asSpectator) {
          room.spectators.push({ id: mySessionId, name: trimmedName });
          joinResultType = 'SPECTATOR';
          return room;
        }

        if (
          room.players.some((p) => p.id === mySessionId) ||
          room.waitlist.some((w) => w.id === mySessionId) ||
          room.spectators.some((s) => s.id === mySessionId)
        ) {
          joinResultType = 'REJOIN';
          return room;
        }

        if ((room.status === 'EMPTY' || room.status === 'WAITING') && room.players.length < 2) {
          const color: MarbleColor = room.players.length === 0 ? 'BLACK' : 'WHITE';
          const newPlayer: OrbitoPlayer = {
            id: mySessionId,
            name: trimmedName,
            color,
            wins: 0,
            movesCount: 0,
          };

          room.status = 'WAITING';
          room.players.push(newPlayer);
          if (!room.waitingSince) {
            room.waitingSince = Date.now();
          }
          joinResultType = 'PLAYER';
        } else {
          room.waitlist.push({ id: mySessionId, name: trimmedName });
          joinResultType = 'WAITLIST';
        }
        return room;
      });

      setSelectedRoomId(joinModalRoom.roomId);
      setJoinModalRoom(null);
      setJoinPlayerName('');
      setAppMode('NET_ROOM');

      if (joinResultType === 'SPECTATOR') {
        showToast('👀 관망모드로 입장했습니다!', 'info');
      } else if (joinResultType === 'WAITLIST') {
        showToast('⏳ 현재 대국 중이어서 다음 판 도전자로 예약되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateNetRoomSettings = async (
    newTargetWins: number,
    newTimeout: number,
    newOrbitDir: OrbitDirection
  ) => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      targetWins: newTargetWins,
      baseTimeout: newTimeout,
      orbitDirection: newOrbitDir,
      waitingSince: Date.now(),
    });
  };

  const handleStartNetGame = async () => {
    if (!activeNetRoom) return;
    const roomPlayers = activeNetRoom.players || [];
    if (roomPlayers.length < 2) {
      showToast('흑과 백 2명이 모여야 대국을 시작할 수 있습니다!', 'info');
      return;
    }

    const initializedPlayers: OrbitoPlayer[] = roomPlayers.slice(0, 2).map((p, idx) => ({
      ...p,
      color: idx === 0 ? 'BLACK' : 'WHITE',
      wins: 0,
      movesCount: 0,
    }));

    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      status: 'PLAYING',
      round: 1,
      players: initializedPlayers,
      boardFlat: JSON.stringify(createEmptyBoard()),
      currentTurn: 'BLACK',
      turnPhase: 'PUSH_OR_PLACE',
      selectedPushFrom: null,
      lastPlaced: null,
      winningLine: [],
      extraOrbitsLeft: 5,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      roundWinnerId: null,
      isDraw: false,
      lastActionNotice: `⚫ 제 1국 시작! ${initializedPlayers[0].name}(흑)님 차례입니다.`,
      consecutiveTimeouts: 0,
      waitingSince: null,
    });
  };

  const handleNetCellClick = async (r: number, c: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;

    const roomPlayers = activeNetRoom.players || [];
    const currentPlayer = roomPlayers.find((p) => p.color === activeNetRoom.currentTurn);
    if (!currentPlayer || currentPlayer.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    if (activeNetRoom.turnPhase === 'READY_ORBIT') {
      showToast('🌀 중앙의 ORBITO 회전 버튼을 눌러 턴을 완료하세요!', 'info');
      return;
    }

    const board: CellValue[][] = JSON.parse(activeNetRoom.boardFlat || '[]');
    if (!board[r]) return;

    const cell = board[r][c];
    const opponentColor: MarbleColor = activeNetRoom.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);

    // 1) 상대 구슬 선택 (밀기 시작/변경)
    if (activeNetRoom.turnPhase === 'PUSH_OR_PLACE' && cell === opponentColor) {
      const validTargets = getValidPushTargets(board, r, c);
      if (validTargets.length === 0) {
        showToast('해당 구슬은 인접한 빈 칸이 없어 밀 수 없습니다!', 'info');
        return;
      }
      playSound('push');
      await update(roomRef, {
        selectedPushFrom: { r, c },
      });
      return;
    }

    // 2) 선택된 상대 구슬을 인접한 빈 칸으로 밀기 실행
    if (
      activeNetRoom.turnPhase === 'PUSH_OR_PLACE' &&
      activeNetRoom.selectedPushFrom &&
      cell === null
    ) {
      const from = activeNetRoom.selectedPushFrom;
      const validTargets = getValidPushTargets(board, from.r, from.c);
      const isValidTarget = validTargets.some((t) => t.r === r && t.c === c);

      if (isValidTarget) {
        playSound('push');
        const nextBoard = board.map((rowArr) => [...rowArr]);
        nextBoard[r][c] = nextBoard[from.r][from.c];
        nextBoard[from.r][from.c] = null;

        await update(roomRef, {
          boardFlat: JSON.stringify(nextBoard),
          turnPhase: 'PLACE_ONLY',
          selectedPushFrom: null,
          lastActionNotice: `👉 ${currentPlayer.name}님이 상대 구슬을 밀었습니다! 이제 내 구슬을 착수하세요.`,
        });
        return;
      }
    }

    // 3) 빈 칸에 내 구슬 착수
    if (cell === null) {
      playSound('place');
      const nextBoard = board.map((rowArr) => [...rowArr]);
      nextBoard[r][c] = activeNetRoom.currentTurn;

      const updatedPlayers = roomPlayers.map((p) =>
        p.id === currentPlayer.id ? { ...p, movesCount: (p.movesCount || 0) + 1 } : p
      );

      await update(roomRef, {
        boardFlat: JSON.stringify(nextBoard),
        players: updatedPlayers,
        turnPhase: 'READY_ORBIT',
        selectedPushFrom: null,
        lastPlaced: { r, c },
        lastActionNotice: `🌀 ${currentPlayer.name}님 착수 완료! 중앙 [ORBITO 회전] 버튼을 누르세요!`,
      });
    }
  };

  const handleNetTriggerOrbit = async () => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;

    const roomPlayers = activeNetRoom.players || [];
    const currentPlayer = roomPlayers.find((p) => p.color === activeNetRoom.currentTurn);
    if (!currentPlayer || currentPlayer.id !== mySessionId) {
      showToast('내 차례에만 궤도를 회전시킬 수 있습니다!', 'info');
      return;
    }

    const board: CellValue[][] = JSON.parse(activeNetRoom.boardFlat || '[]');
    const fullBefore = isBoardFull(board);

    if (activeNetRoom.turnPhase !== 'READY_ORBIT' && !fullBefore) {
      showToast('먼저 빈 칸에 내 구슬을 착수해야 합니다!', 'info');
      return;
    }

    playSound('orbit');
    setIsOrbitAnimating(true);
    window.setTimeout(() => setIsOrbitAnimating(false), 450);

    const rotatedBoard = rotateOrbitoBoard(board, activeNetRoom.orbitDirection);
    const { blackLines, whiteLines } = evaluateOrbitoBoard(rotatedBoard);
    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);

    // 양쪽 동시 4목 달성 시 무승부
    if (blackLines.length > 0 && whiteLines.length > 0) {
      await update(roomRef, {
        boardFlat: JSON.stringify(rotatedBoard),
        winningLine: [...blackLines[0], ...whiteLines[0]],
        status: 'ROUND_OVER',
        roundWinnerId: null,
        isDraw: true,
        turnDeadline: null,
        lastActionNotice: '🤝 궤도 회전 후 양쪽 모두 4목이 완성되어 무승부입니다!',
        consecutiveTimeouts: 0,
      });
      return;
    }

    // 어느 한쪽 4목 달성 시 승리
    if (blackLines.length > 0 || whiteLines.length > 0) {
      playSound('win');
      const winColor: MarbleColor = blackLines.length > 0 ? 'BLACK' : 'WHITE';
      const winCoords = blackLines.length > 0 ? blackLines[0] : whiteLines[0];

      const updatedPlayers = roomPlayers.map((p) =>
        p.color === winColor ? { ...p, wins: (p.wins || 0) + 1 } : p
      );
      const winnerObj = updatedPlayers.find((p) => p.color === winColor)!;
      const isMatchChampion = winnerObj.wins >= activeNetRoom.targetWins;

      if (isMatchChampion) {
        speakKorean(`축하합니다! ${winnerObj.name}님이 오비토 최종 우승을 차지했습니다!`);
        saveHallOfFameRecord('NET', {
          name: winnerObj.name,
          recordDetail: `${activeNetRoom.targetWins}선승제 최종 우승`,
        });
      } else {
        speakKorean(`${winnerObj.name}님 제 ${activeNetRoom.round}국 승리!`);
      }

      await update(roomRef, {
        boardFlat: JSON.stringify(rotatedBoard),
        players: updatedPlayers,
        winningLine: winCoords,
        status: 'ROUND_OVER',
        roundWinnerId: winnerObj.id,
        isDraw: false,
        turnDeadline: null,
        lastActionNotice: `🏆 궤도 회전으로 ${winnerObj.name}님이 4목을 완성했습니다!`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    // 보드가 16칸 모두 찼을 때 연장 회전(최대 5회) 처리
    const fullAfter = isBoardFull(rotatedBoard);
    if (fullAfter) {
      const nextExtra = (activeNetRoom.extraOrbitsLeft ?? 5) - 1;
      if (nextExtra <= 0) {
        await update(roomRef, {
          boardFlat: JSON.stringify(rotatedBoard),
          winningLine: [],
          status: 'ROUND_OVER',
          roundWinnerId: null,
          isDraw: true,
          turnDeadline: null,
          lastActionNotice: '🤝 5회 추가 회전 후에도 4목이 완성되지 않아 무승부입니다!',
          consecutiveTimeouts: 0,
        });
        return;
      }

      const nextTurn: MarbleColor = activeNetRoom.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
      const nextPlayer = roomPlayers.find((p) => p.color === nextTurn);
      await update(roomRef, {
        boardFlat: JSON.stringify(rotatedBoard),
        currentTurn: nextTurn,
        turnPhase: 'READY_ORBIT',
        selectedPushFrom: null,
        lastPlaced: null,
        extraOrbitsLeft: nextExtra,
        turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
        lastActionNotice: `🌀 만석 연장전! 남은 추가 회전 ${nextExtra}회 · ${nextPlayer?.name || ''}님 버튼을 누르세요!`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    // 일반 턴 교대
    const nextTurn: MarbleColor = activeNetRoom.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
    const nextPlayer = roomPlayers.find((p) => p.color === nextTurn);

    await update(roomRef, {
      boardFlat: JSON.stringify(rotatedBoard),
      currentTurn: nextTurn,
      turnPhase: 'PUSH_OR_PLACE',
      selectedPushFrom: null,
      lastPlaced: null,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      lastActionNotice: `👉 궤도 회전 완료! 다음은 ${nextPlayer?.name || ''}(${nextTurn === 'BLACK' ? '흑' : '백'})님 차례입니다.`,
      consecutiveTimeouts: 0,
    });
  };

  const handleNetTurnTimeout = async (room: NetOrbitoRoomData) => {
    const roomRef = ref(db, `orbito_rooms/room_${room.roomId}`);
    const playersArr = room.players || [];
    if (playersArr.length < 2) return;

    const timedOutPlayer = playersArr.find((p) => p.color === room.currentTurn);
    const newConsecutive = (room.consecutiveTimeouts || 0) + 1;

    if (newConsecutive >= 3 && timedOutPlayer) {
      await set(roomRef, createDefaultOrbitoRoom(room.roomId));
      showToast(`⏰ ${timedOutPlayer.name}님 장기 미응답으로 대국이 종료되었습니다.`, 'info');
      return;
    }

    const nextTurn: MarbleColor = room.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
    const nextPlayer = playersArr.find((p) => p.color === nextTurn);

    await update(roomRef, {
      currentTurn: nextTurn,
      turnPhase: 'PUSH_OR_PLACE',
      selectedPushFrom: null,
      turnDeadline: Date.now() + room.baseTimeout * 1000,
      lastActionNotice: `⏰ ${timedOutPlayer?.name || '상대'}님 시간 초과! ${nextPlayer?.name || ''}님에게 턴이 넘어갑니다.`,
      consecutiveTimeouts: newConsecutive,
    });
  };

  const handleNextNetRound = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetOrbitoRoomData;
      const playersArr = room.players || [];
      const waitlistArr = room.waitlist || [];

      const matchWinner = playersArr.find((p) => p.wins >= room.targetWins);

      if (matchWinner) {
        if (waitlistArr.length > 0) {
          const challenger = waitlistArr[0];
          const remainingWaitlist = waitlistArr.slice(1);
          const nextPlayers: OrbitoPlayer[] = [
            { ...matchWinner, color: 'BLACK', wins: 0, movesCount: 0 },
            { id: challenger.id, name: challenger.name, color: 'WHITE', wins: 0, movesCount: 0 },
          ];
          room.players = nextPlayers;
          room.waitlist = remainingWaitlist;
          room.status = 'PLAYING';
          room.round = 1;
          room.boardFlat = JSON.stringify(createEmptyBoard());
          room.currentTurn = 'BLACK';
          room.turnPhase = 'PUSH_OR_PLACE';
          room.selectedPushFrom = null;
          room.lastPlaced = null;
          room.winningLine = [];
          room.extraOrbitsLeft = 5;
          room.roundWinnerId = null;
          room.isDraw = false;
          room.turnDeadline = Date.now() + room.baseTimeout * 1000;
          room.lastActionNotice = `🔥 새로운 도전자 ${challenger.name}님과 대국을 시작합니다!`;
          room.consecutiveTimeouts = 0;
          return room;
        }

        const swappedPlayers: OrbitoPlayer[] = playersArr.map((p) => ({
          ...p,
          color: p.color === 'BLACK' ? 'WHITE' : 'BLACK',
          wins: 0,
          movesCount: 0,
        }));
        room.players = swappedPlayers;
        room.status = 'PLAYING';
        room.round = 1;
        room.boardFlat = JSON.stringify(createEmptyBoard());
        room.currentTurn = 'BLACK';
        room.turnPhase = 'PUSH_OR_PLACE';
        room.selectedPushFrom = null;
        room.lastPlaced = null;
        room.winningLine = [];
        room.extraOrbitsLeft = 5;
        room.roundWinnerId = null;
        room.isDraw = false;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        room.lastActionNotice = '🔄 흑/백을 교대하여 새 대국을 시작합니다!';
        room.consecutiveTimeouts = 0;
        return room;
      }

      const nextRound = room.round + 1;
      const swappedPlayers: OrbitoPlayer[] = playersArr.map((p) => ({
        ...p,
        color: p.color === 'BLACK' ? 'WHITE' : 'BLACK',
        movesCount: 0,
      }));

      room.players = swappedPlayers;
      room.status = 'PLAYING';
      room.round = nextRound;
      room.boardFlat = JSON.stringify(createEmptyBoard());
      room.currentTurn = 'BLACK';
      room.turnPhase = 'PUSH_OR_PLACE';
      room.selectedPushFrom = null;
      room.lastPlaced = null;
      room.winningLine = [];
      room.extraOrbitsLeft = 5;
      room.roundWinnerId = null;
      room.isDraw = false;
      room.turnDeadline = Date.now() + room.baseTimeout * 1000;
      room.lastActionNotice = `⚔️ 제 ${nextRound}국 시작! 흑/백이 교대되었습니다.`;
      room.consecutiveTimeouts = 0;
      return room;
    });
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }

    const roomRef = ref(db, `orbito_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetOrbitoRoomData;
      const filteredPlayers = (room.players || []).filter((p) => p.id !== mySessionId);
      const filteredWaitlist = (room.waitlist || []).filter((w) => w.id !== mySessionId);
      const filteredSpectators = (room.spectators || []).filter((s) => s.id !== mySessionId);

      if (filteredPlayers.length === 0 && filteredSpectators.length === 0) {
        return createDefaultOrbitoRoom(room.roomId);
      }

      if (room.status === 'PLAYING' && filteredPlayers.length < 2) {
        return createDefaultOrbitoRoom(room.roomId);
      }

      room.players = filteredPlayers;
      room.waitlist = filteredWaitlist;
      room.spectators = filteredSpectators;
      if (filteredPlayers.length < 2) {
        room.status = filteredPlayers.length === 0 ? 'EMPTY' : 'WAITING';
        room.turnDeadline = null;
      }
      return room;
    });

    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  // =========================================================
  // 단독게임 핸들러
  // =========================================================
  const startSoloGame = () => {
    const bName = blackName.trim() || '블랙 오비터';
    const wName = whiteName.trim() || '화이트 오비터';

    setSoloPlayers([
      { id: 'black', name: bName, color: 'BLACK', wins: 0, movesCount: 0 },
      { id: 'white', name: wName, color: 'WHITE', wins: 0, movesCount: 0 },
    ]);
    setSoloBoard(createEmptyBoard());
    setSoloTurn('BLACK');
    setSoloPhase('PUSH_OR_PLACE');
    setSoloSelectedPush(null);
    setSoloLastPlaced(null);
    setSoloWinningLine([]);
    setSoloRoundWinner(null);
    setSoloIsDraw(false);
    setSoloExtraOrbits(5);
    setSoloState('PLAYING');
    showToast(`⚫ ${bName}(흑)님 차례! 구슬을 놓은 뒤 ORBITO 버튼을 누르세요.`, 'info');
  };

  const startNextSoloRound = () => {
    const isSeriesOver = soloPlayers.some((p) => p.wins >= soloTargetWins);
    setSoloPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        color: p.color === 'BLACK' ? 'WHITE' : 'BLACK',
        wins: isSeriesOver ? 0 : p.wins,
        movesCount: 0,
      }))
    );
    setSoloBoard(createEmptyBoard());
    setSoloTurn('BLACK');
    setSoloPhase('PUSH_OR_PLACE');
    setSoloSelectedPush(null);
    setSoloLastPlaced(null);
    setSoloWinningLine([]);
    setSoloRoundWinner(null);
    setSoloIsDraw(false);
    setSoloExtraOrbits(5);
    setSoloState('PLAYING');
    showToast('🔄 흑과 백을 교대하여 새 대국을 시작합니다!', 'info');
  };

  const handleSoloCellClick = (r: number, c: number) => {
    if (soloState !== 'PLAYING') return;

    if (soloPhase === 'READY_ORBIT') {
      showToast('🌀 중앙의 [ORBITO 회전] 버튼을 눌러 턴을 마무리하세요!', 'info');
      return;
    }

    const cell = soloBoard[r][c];
    const opponentColor: MarbleColor = soloTurn === 'BLACK' ? 'WHITE' : 'BLACK';

    // 1) 상대 구슬 선택 (밀기 준비 또는 선택 해제)
    if (soloPhase === 'PUSH_OR_PLACE' && cell === opponentColor) {
      if (soloSelectedPush?.r === r && soloSelectedPush?.c === c) {
        setSoloSelectedPush(null);
        return;
      }
      const validTargets = getValidPushTargets(soloBoard, r, c);
      if (validTargets.length === 0) {
        showToast('주변에 빈 칸이 없어 밀 수 없는 구슬입니다!', 'info');
        return;
      }
      playSound('push');
      setSoloSelectedPush({ r, c });
      showToast('👉 빛나는 인접 빈 칸을 클릭해 상대 구슬을 밀어내세요!', 'info');
      return;
    }

    // 2) 선택된 상대 구슬을 인접 빈 칸으로 밀어내기
    if (soloPhase === 'PUSH_OR_PLACE' && soloSelectedPush && cell === null) {
      const validTargets = getValidPushTargets(
        soloBoard,
        soloSelectedPush.r,
        soloSelectedPush.c
      );
      const isValidTarget = validTargets.some((t) => t.r === r && t.c === c);

      if (isValidTarget) {
        playSound('push');
        const nextBoard = soloBoard.map((rowArr) => [...rowArr]);
        nextBoard[r][c] = nextBoard[soloSelectedPush.r][soloSelectedPush.c];
        nextBoard[soloSelectedPush.r][soloSelectedPush.c] = null;

        setSoloBoard(nextBoard);
        setSoloSelectedPush(null);
        setSoloPhase('PLACE_ONLY');
        showToast('✅ 밀기 완료! 이제 빈 칸에 내 구슬을 착수하세요.', 'info');
        return;
      }
    }

    // 3) 빈 칸에 내 구슬 착수
    if (cell === null) {
      playSound('place');
      const nextBoard = soloBoard.map((rowArr) => [...rowArr]);
      nextBoard[r][c] = soloTurn;

      setSoloBoard(nextBoard);
      setSoloSelectedPush(null);
      setSoloLastPlaced({ r, c });
      setSoloPhase('READY_ORBIT');
      setSoloPlayers((prev) =>
        prev.map((p) => (p.color === soloTurn ? { ...p, movesCount: p.movesCount + 1 } : p))
      );
      showToast('🌀 중앙의 ORBITO 회전 버튼을 눌러주세요!', 'info');
    }
  };

  const handleSoloTriggerOrbit = () => {
    if (soloState !== 'PLAYING') return;
    const fullBefore = isBoardFull(soloBoard);

    if (soloPhase !== 'READY_ORBIT' && !fullBefore) {
      showToast('먼저 빈 칸에 내 구슬을 놓아야 회전할 수 있습니다!', 'info');
      return;
    }

    playSound('orbit');
    setIsOrbitAnimating(true);
    window.setTimeout(() => setIsOrbitAnimating(false), 450);

    const rotatedBoard = rotateOrbitoBoard(soloBoard, soloOrbitDir);
    const { blackLines, whiteLines } = evaluateOrbitoBoard(rotatedBoard);
    setSoloBoard(rotatedBoard);

    // 양쪽 동시 4목 달성 시 무승부
    if (blackLines.length > 0 && whiteLines.length > 0) {
      setSoloWinningLine([...blackLines[0], ...whiteLines[0]]);
      setSoloIsDraw(true);
      setSoloState('GAME_OVER');
      showToast('🤝 양쪽 동시에 4목이 완성되어 무승부입니다!', 'info');
      return;
    }

    // 한쪽 4목 달성 시 승리
    if (blackLines.length > 0 || whiteLines.length > 0) {
      playSound('win');
      const winColor: MarbleColor = blackLines.length > 0 ? 'BLACK' : 'WHITE';
      const winCoords = blackLines.length > 0 ? blackLines[0] : whiteLines[0];

      const updatedPlayers = soloPlayers.map((p) =>
        p.color === winColor ? { ...p, wins: p.wins + 1 } : p
      );
      const champ = updatedPlayers.find((p) => p.color === winColor)!;

      setSoloPlayers(updatedPlayers);
      setSoloWinningLine(winCoords);
      setSoloRoundWinner(champ);
      setSoloState('GAME_OVER');
      speakKorean(`축하합니다! ${champ.name}님이 4목을 완성해 승리했습니다!`);

      if (champ.wins >= soloTargetWins) {
        saveHallOfFameRecord('SOLO', {
          name: champ.name,
          recordDetail: `${soloTargetWins}선승제 우승 (${champ.movesCount}수)`,
        });
      }
      return;
    }

    // 16칸 만석 시 연장 회전 처리
    if (isBoardFull(rotatedBoard)) {
      const nextExtra = soloExtraOrbits - 1;
      if (nextExtra <= 0) {
        setSoloIsDraw(true);
        setSoloState('GAME_OVER');
        showToast('🤝 추가 회전 5회 종료! 무승부입니다.', 'info');
        return;
      }
      setSoloExtraOrbits(nextExtra);
      setSoloTurn((prev) => (prev === 'BLACK' ? 'WHITE' : 'BLACK'));
      setSoloPhase('READY_ORBIT');
      setSoloSelectedPush(null);
      setSoloLastPlaced(null);
      showToast(`🌀 만석 연장전! 남은 추가 회전: ${nextExtra}회`, 'info');
      return;
    }

    // 다음 턴 전환
    setSoloTurn((prev) => (prev === 'BLACK' ? 'WHITE' : 'BLACK'));
    setSoloPhase('PUSH_OR_PLACE');
    setSoloSelectedPush(null);
    setSoloLastPlaced(null);
  };

  // =========================================================
  // 공통 4×4 오비토 궤도 보드 렌더링 헬퍼
  // =========================================================
  const renderOrbitoBoard = (
    boardData: CellValue[][],
    currentTurnColor: MarbleColor,
    turnPhase: TurnPhase,
    selectedPushFrom: Coord | null,
    lastPlacedCoord: Coord | null,
    winCoords: Coord[],
    orbitDir: OrbitDirection,
    canInteract: boolean,
    onCellClick: (r: number, c: number) => void,
    onOrbitClick: () => void
  ) => {
    const winSet = new Set(winCoords.map((coord) => `${coord.r},${coord.c}`));
    const pushTargets =
      selectedPushFrom && canInteract
        ? getValidPushTargets(boardData, selectedPushFrom.r, selectedPushFrom.c)
        : [];
    const pushTargetSet = new Set(pushTargets.map((t) => `${t.r},${t.c}`));
    const opponentColor: MarbleColor = currentTurnColor === 'BLACK' ? 'WHITE' : 'BLACK';

    const fullBoard = isBoardFull(boardData);
    const isOrbitButtonReady =
      canInteract && (turnPhase === 'READY_ORBIT' || fullBoard);

    return (
      <div className={`orbito-board-shell ${isOrbitAnimating ? 'orbit-pulse' : ''}`}>
        <div className="orbito-grid-4x4">
          {boardData.map((rowArr, r) =>
            rowArr.map((cell, c) => {
              const key = `${r},${c}`;
              const isInner = (r === 1 || r === 2) && (c === 1 || c === 2);
              const isWinMarble = winSet.has(key);
              const isLastPlaced =
                lastPlacedCoord?.r === r && lastPlacedCoord?.c === c;
              const isSelectedPush =
                selectedPushFrom?.r === r && selectedPushFrom?.c === c;
              const isPushDestination = pushTargetSet.has(key);

              const canPushThisOpponent =
                canInteract &&
                turnPhase === 'PUSH_OR_PLACE' &&
                cell === opponentColor &&
                getValidPushTargets(boardData, r, c).length > 0;

              const canPlaceHere =
                canInteract &&
                (turnPhase === 'PUSH_OR_PLACE' || turnPhase === 'PLACE_ONLY') &&
                cell === null;

              const isClickable =
                canPushThisOpponent || isPushDestination || canPlaceHere;

              return (
                <div
                  key={key}
                  className={`orbito-cell ${isInner ? 'inner-track' : 'outer-track'} ${
                    isClickable ? 'clickable' : ''
                  } ${isPushDestination ? 'push-target' : ''}`}
                  onClick={() => isClickable && onCellClick(r, c)}
                >
                  {/* 궤도 홈 디테일 */}
                  <div className="orbito-socket-ring" />

                  {/* 밀기 목적지 화살표 힌트 */}
                  {isPushDestination && <span className="push-target-dot">⇄</span>}

                  {/* 착수 미리보기 고스트 */}
                  {canPlaceHere && !isPushDestination && (
                    <div
                      className={`orbito-hover-ghost ${
                        currentTurnColor === 'BLACK' ? 'black' : 'white'
                      }`}
                    />
                  )}

                  {/* 오비토 구슬 */}
                  {cell !== null && (
                    <div
                      className={`orbito-marble ${
                        cell === 'BLACK' ? 'black' : 'white'
                      } ${isSelectedPush ? 'selected-push' : ''} ${
                        isLastPlaced ? 'last-placed' : ''
                      } ${isWinMarble ? 'winning-marble' : ''} ${
                        canPushThisOpponent ? 'pushable-hint' : ''
                      }`}
                    />
                  )}
                </div>
              );
            })
          )}

          {/* 중앙 오비토 회전 버튼 */}
          <button
            type="button"
            disabled={!isOrbitButtonReady}
            className={`orbito-center-btn ${isOrbitButtonReady ? 'ready' : ''} ${
              isOrbitAnimating ? 'spinning' : ''
            }`}
            onClick={onOrbitClick}
            title="모든 구슬을 궤도 방향으로 1칸 회전시킵니다"
          >
            <span className="orbito-btn-arrow">{orbitDir === 'CCW' ? '↺' : '↻'}</span>
            <span className="orbito-btn-label">ORBITO</span>
          </button>
        </div>
      </div>
    );
  };

  // =========================================================
  // 1. 홈 화면
  // =========================================================
  if (appMode === 'HOME') {
    return (
      <div className="orbito-container" style={{ background: TURN_BG_COLORS.BLACK }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🪐⚫⚪</div>
          <h1 className="setup-title">오비토 보드게임 (ORBITO 4×4)</h1>
          <p className="home-subtitle">
            매 턴 보드 전체가 궤도를 따라 회전합니다! 움직이는 판 위에서 4목을 완성하세요.
          </p>

          <div className="mode-select-grid">
            <button
              type="button"
              className="mode-select-btn solo"
              onClick={() => {
                setSoloState('SETUP');
                setAppMode('SOLO');
              }}
            >
              <span className="mode-icon">🎮</span>
              <strong>단독게임</strong>
              <span className="mode-desc">한 기기에서 흑과 백 2인 대국 (회전 방향 선택)</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 대국실 실시간 대전 & 관망모드</span>
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ marginTop: '14px', width: '100%' }}
            onClick={() => setAppMode('HALL_OF_FAME')}
          >
            🏅 명예의 전당 보기
          </button>
        </div>
      </div>
    );
  }

  // =========================================================
  // 2. 명예의 전당
  // =========================================================
  if (appMode === 'HALL_OF_FAME') {
    const soloRecords = getHallOfFameRecords('SOLO');
    const netRecords = getHallOfFameRecords('NET');

    return (
      <div className="orbito-container" style={{ background: TURN_BG_COLORS.BLACK, padding: '16px' }}>
        <div className="setup-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAppMode('HOME')}
            >
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, color: '#0f172a' }}>🏅 오비토 명예의 전당</h2>
            <div style={{ width: '60px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#1e3a8a', textAlign: 'center' }}>
                🎮 단독 대국 TOP 10
              </h3>
              {soloRecords.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>기록이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {soloRecords.map((rec, i) => (
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <span><strong>{i + 1}. {rec.name}</strong></span>
                      <span style={{ color: '#059669' }}>{rec.recordDetail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#4f46e5', textAlign: 'center' }}>
                🌐 넷대국 TOP 10
              </h3>
              {netRecords.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>기록이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {netRecords.map((rec, i) => (
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <span><strong>{i + 1}. {rec.name}</strong></span>
                      <span style={{ color: '#4f46e5' }}>{rec.recordDetail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================
  // 3. 넷게임 로비 (방 4개)
  // =========================================================
  if (appMode === 'NET_LOBBY') {
    return (
      <div className="orbito-container" style={{ background: TURN_BG_COLORS.BLACK }}>
        <div className="net-lobby-container">
          <div className="net-lobby-header">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAppMode('HOME')}
            >
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
              🌐 온라인 오비토 대국실
            </h2>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ fontSize: '12px' }}
              onClick={() => setAppMode('HALL_OF_FAME')}
            >
              🏅 명예의전당
            </button>
          </div>

          <div className="net-rooms-grid">
            {rooms.map((room) => {
              const roomPlayers = room.players || [];
              const roomWaitlist = room.waitlist || [];
              const roomSpectators = room.spectators || [];
              const isEmpty = room.status === 'EMPTY' || roomPlayers.length === 0;
              const isWaiting = room.status === 'WAITING' && roomPlayers.length > 0;
              const isPlaying = room.status === 'PLAYING' || room.status === 'ROUND_OVER';
              const isFull = roomPlayers.length >= 2;

              let statusBadgeText = '🟢 빈 대국실';
              let statusClass = 'empty';
              if (isPlaying) {
                statusBadgeText = `🔥 대국중 (제 ${room.round}국)`;
                statusClass = 'playing';
              } else if (isWaiting) {
                statusBadgeText = isFull
                  ? '🟠 대국 준비 완료 (2/2)'
                  : `🟡 도전자 대기중 (${roomPlayers.length}/2명)`;
                statusClass = 'waiting';
              }

              return (
                <div
                  key={room.roomId}
                  className={`net-room-card ${statusClass}`}
                  onClick={() => {
                    if (
                      roomPlayers.some((p) => p.id === mySessionId) ||
                      roomWaitlist.some((w) => w.id === mySessionId) ||
                      roomSpectators.some((s) => s.id === mySessionId)
                    ) {
                      setSelectedRoomId(room.roomId);
                      setAppMode('NET_ROOM');
                    } else {
                      setJoinModalRoom(room);
                      setJoinPlayerName('');
                    }
                  }}
                >
                  <div className="room-card-top">
                    <span className="room-number-title">🪐 제 {room.roomId} 궤도실</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>🏆 {room.targetWins}선승제</span>
                    <span>🌀 {room.orbitDirection === 'CCW' ? '반시계(↺)' : '시계(↻)'}</span>
                    <span>⏱️ {room.baseTimeout}초</span>
                  </div>

                  <div className="room-members-box">
                    <div className="room-members-label">대국자 ({roomPlayers.length}/2):</div>
                    <div className="room-members-chips">
                      {roomPlayers.length === 0 ? (
                        <span className="empty-member-text">첫 번째 대국자를 기다리고 있습니다</span>
                      ) : (
                        roomPlayers.map((p, idx) => (
                          <span key={p.id} className="member-chip">
                            <span
                              className={`marble-badge-icon mini ${
                                idx === 0 ? 'black' : 'white'
                              }`}
                            />
                            {p.name} ({p.wins}승)
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {roomSpectators.length > 0 && (
                    <div className="room-waitlist-box" style={{ color: '#0369a1', background: '#f0f9ff' }}>
                      👀 관망 중 ({roomSpectators.length}명): {roomSpectators.map((s) => s.name).join(', ')}
                    </div>
                  )}

                  {roomWaitlist.length > 0 && (
                    <div className="room-waitlist-box">
                      ⏳ 다음 판 도전 예약 ({roomWaitlist.length}명):{' '}
                      {roomWaitlist.map((w) => w.name).join(', ')}
                    </div>
                  )}

                  <div className="room-enter-cta">
                    {isEmpty
                      ? '👉 클릭하여 방 만들기 또는 관망하기'
                      : isPlaying || isFull
                      ? '👉 클릭하여 도전자 예약 또는 관망하기'
                      : '👉 클릭하여 대국 참가 또는 관망하기'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {joinModalRoom && (
          <div className="modal-overlay" onClick={() => setJoinModalRoom(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 8px' }}>🪐 제 {joinModalRoom.roomId} 궤도실 입장</h2>
              <p className="modal-subtext">
                이름을 입력하고 대국에 참가하거나, 대국을 구경하는 <strong>관망모드</strong>를 선택하세요!
              </p>

              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력 (예: 코스모스)"
                value={joinPlayerName}
                autoFocus
                onChange={(e) => setJoinPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnterRoomSubmit(false)}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, background: '#0284c7', color: '#fff' }}
                  onClick={() => handleEnterRoomSubmit(true)}
                >
                  👀 관망하기
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 2 }}
                  onClick={() => handleEnterRoomSubmit(false)}
                >
                  🚀 대국 참가 / 예약
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // 4. 넷게임 대국실
  // =========================================================
  if (appMode === 'NET_ROOM') {
    if (!activeNetRoom) {
      return (
        <div className="orbito-container" style={{ background: TURN_BG_COLORS.BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="setup-card" style={{ textAlign: 'center' }}>
            <h2>⏳ 대국실 정보를 불러오는 중입니다...</h2>
            <button type="button" className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={() => setAppMode('NET_LOBBY')}>
              ⬅️ 로비로 돌아가기
            </button>
          </div>
        </div>
      );
    }

    const roomPlayers = activeNetRoom.players || [];
    const roomWaitlist = activeNetRoom.waitlist || [];
    const roomSpectators = activeNetRoom.spectators || [];
    const isHost = roomPlayers[0]?.id === mySessionId;
    const amIWaitlisted = roomWaitlist.some((w) => w.id === mySessionId);
    const amISpectator = roomSpectators.some((s) => s.id === mySessionId);

    if (activeNetRoom.status === 'WAITING' || activeNetRoom.status === 'EMPTY') {
      const minutes = Math.floor(waitingCountdownSec / 60);
      const seconds = waitingCountdownSec % 60;
      const countdownStr = `${minutes}분 ${seconds < 10 ? '0' : ''}${seconds}초`;

      return (
        <div className="orbito-container" style={{ background: TURN_BG_COLORS.BLACK }}>
          <div className="setup-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '6px 12px', fontSize: '13px' }}
                onClick={handleLeaveNetRoom}
              >
                🚪 방 나가기
              </button>
              <span className="room-status-pill waiting">
                제 {activeNetRoom.roomId}실 · 대기 중 (⏱️ {countdownStr})
              </span>
            </div>

            <h1 className="setup-title" style={{ marginTop: '14px' }}>
              🪐 오비토 대국 대기실 {amISpectator ? '👀 [관망모드]' : ''}
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                🏆 승리 조건 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector">
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={!isHost}
                    className={`count-btn ${activeNetRoom.targetWins === num ? 'active' : ''}`}
                    onClick={() =>
                      updateNetRoomSettings(
                        num,
                        activeNetRoom.baseTimeout,
                        activeNetRoom.orbitDirection
                      )
                    }
                  >
                    {num === 1 ? '단판 승부' : `${num * 2 - 1}판 ${num}선승`}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🌀 궤도 회전 방향</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  disabled={!isHost}
                  className={`count-btn ${activeNetRoom.orbitDirection === 'CCW' ? 'active' : ''}`}
                  onClick={() =>
                    updateNetRoomSettings(
                      activeNetRoom.targetWins,
                      activeNetRoom.baseTimeout,
                      'CCW'
                    )
                  }
                >
                  ↺ 반시계 방향 (정식 룰)
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  className={`count-btn ${activeNetRoom.orbitDirection === 'CW' ? 'active' : ''}`}
                  onClick={() =>
                    updateNetRoomSettings(
                      activeNetRoom.targetWins,
                      activeNetRoom.baseTimeout,
                      'CW'
                    )
                  }
                >
                  ↻ 시계 방향
                </button>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 한 턴 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>15초</span>
                <input
                  type="range"
                  min={15}
                  max={60}
                  step={5}
                  disabled={!isHost}
                  value={activeNetRoom.baseTimeout}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    updateNetRoomSettings(
                      activeNetRoom.targetWins,
                      Number(e.target.value),
                      activeNetRoom.orbitDirection
                    )
                  }
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>60초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">⚔️ 대국자 명단 (2명)</label>
              <div className="player-list">
                {roomPlayers.map((p, idx) => (
                  <div key={p.id} className="player-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className={`marble-badge-icon ${idx === 0 ? 'black' : 'white'}`} />
                      {p.name} ({idx === 0 ? '흑·선공' : '백·후공'}) {p.id === mySessionId && '(나)'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#059669' }}>준비완료</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-success"
              disabled={roomPlayers.length < 2}
              onClick={handleStartNetGame}
            >
              🚀 대국 시작하기 ({roomPlayers.length}/2명)
            </button>
          </div>
        </div>
      );
    }

    let netBoard: CellValue[][] = createEmptyBoard();
    try {
      netBoard = JSON.parse(activeNetRoom.boardFlat);
    } catch {
      netBoard = createEmptyBoard();
    }

    const currentTurnPlayer = roomPlayers.find((p) => p.color === activeNetRoom.currentTurn);
    const isMyTurn =
      activeNetRoom.status === 'PLAYING' &&
      currentTurnPlayer?.id === mySessionId &&
      !amISpectator;

    const roundWinner = roomPlayers.find((p) => p.id === activeNetRoom.roundWinnerId);
    const matchChampion = roomPlayers.find((p) => p.wins >= activeNetRoom.targetWins);

    const getPhaseGuideText = () => {
      if (!isMyTurn) return `${currentTurnPlayer?.name || ''}님의 행동을 기다리는 중...`;
      if (activeNetRoom.turnPhase === 'READY_ORBIT' || isBoardFull(netBoard)) {
        return '🌀 중앙 [ORBITO] 회전 버튼을 눌러 턴을 완료하세요!';
      }
      if (activeNetRoom.turnPhase === 'PLACE_ONLY') {
        return '⚪ 빈 칸에 내 구슬을 착수하세요!';
      }
      return '① 상대 구슬 밀기(선택) 또는 ② 빈 칸에 바로 착수';
    };

    return (
      <div
        className="orbito-container"
        style={{ background: TURN_BG_COLORS[activeNetRoom.currentTurn] }}
      >
        {toast && (
          <div key={toast.id} className={`orbito-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">
                제{activeNetRoom.round}국 ({activeNetRoom.targetWins}선승)
              </span>
              <span className={`net-timer-badge ${remainingSeconds <= 7 ? 'urgent' : ''}`}>
                ⏱️ {remainingSeconds}초
              </span>
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p) => {
                const isActive =
                  activeNetRoom.status === 'PLAYING' && p.color === activeNetRoom.currentTurn;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? '#6366f1' : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span
                        className={`marble-badge-icon mini ${
                          p.color === 'BLACK' ? 'black' : 'white'
                        }`}
                      />
                      <strong>
                        {p.name}
                        {p.id === mySessionId ? '(나)' : ''}
                      </strong>
                      <span className="badge-score">{p.wins}승</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-compact-setup"
              onClick={handleLeaveNetRoom}
              title="대국실 나가기"
            >
              🚪
            </button>
          </div>

          {amISpectator && (
            <div className="net-waitlist-strip" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              👀 현재 관망모드 중입니다. 실시간 오비토 대국을 관전하고 있습니다!
            </div>
          )}

          {(amIWaitlisted || roomWaitlist.length > 0) && !amISpectator && (
            <div className="net-waitlist-strip">
              {amIWaitlisted
                ? '⏳ 다음 판 도전자로 예약되어 있습니다! 현재 매치가 끝나면 자동 출전합니다.'
                : `⏳ 다음 판 대기 도전자 (${roomWaitlist.length}명): ${roomWaitlist
                    .map((w) => w.name)
                    .join(', ')}`}
            </div>
          )}

          <div className="orbito-board-outer">
            <div className="orbito-board-crest">
              {activeNetRoom.lastActionNotice ||
                `🪐 제 ${activeNetRoom.roomId} 궤도실 · ${
                  activeNetRoom.orbitDirection === 'CCW' ? '반시계(↺)' : '시계(↻)'
                } 회전 🪐`}
            </div>

            {renderOrbitoBoard(
              netBoard,
              activeNetRoom.currentTurn,
              activeNetRoom.turnPhase,
              activeNetRoom.selectedPushFrom || null,
              activeNetRoom.lastPlaced || null,
              activeNetRoom.winningLine || [],
              activeNetRoom.orbitDirection,
              isMyTurn,
              handleNetCellClick,
              handleNetTriggerOrbit
            )}
          </div>

          <div className="orbito-bottom-dock">
            <div className="turn-status-group">
              <span
                className={`marble-badge-icon ${
                  activeNetRoom.currentTurn === 'BLACK' ? 'black' : 'white'
                }`}
              />
              <span>{getPhaseGuideText()}</span>
            </div>

            <span className="move-count-pill">
              {activeNetRoom.orbitDirection === 'CCW' ? '↺ 반시계' : '↻ 시계'}
            </span>
          </div>
        </div>

        {activeNetRoom.status === 'ROUND_OVER' && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-trophy">{activeNetRoom.isDraw ? '🤝' : '👑🏆👑'}</div>
              <div className="congrats-banner">
                {matchChampion ? 'FINAL CHAMPION!' : `제 ${activeNetRoom.round}국 종료!`}
              </div>
              <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
                {activeNetRoom.isDraw
                  ? '무승부입니다!'
                  : matchChampion
                  ? `${matchChampion.name}님 최종 우승! 🌟`
                  : `${roundWinner?.name || ''}님 1승 획득!`}
              </h2>

              <div className="rank-list">
                {roomPlayers.map((p) => {
                  const isChamp = p.id === activeNetRoom.roundWinnerId;
                  return (
                    <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span
                          className={`marble-badge-icon mini ${
                            p.color === 'BLACK' ? 'black' : 'white'
                          }`}
                        />
                        {isChamp ? '🥇 ' : ''}
                        {p.name}
                      </span>
                      <span>
                        누적 {p.wins}승 / {activeNetRoom.targetWins}승
                      </span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={handleLeaveNetRoom}
                >
                  🚪 나가기
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 2 }}
                  onClick={handleNextNetRound}
                >
                  {matchChampion
                    ? roomWaitlist.length > 0
                      ? '⚔️ 다음 도전자와 대국 시작'
                      : '🔄 흑/백 교대 재대결'
                    : `🔥 제 ${activeNetRoom.round + 1}국 시작하기`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================
  // 5. 단독게임 (설정 / 대국 / 결과)
  // =========================================================
  const currentSoloPlayer = soloPlayers.find((p) => p.color === soloTurn)!;
  const isSoloSeriesOver = soloPlayers.some((p) => p.wins >= soloTargetWins);

  const getSoloPhaseInstruction = () => {
    if (soloPhase === 'READY_ORBIT' || isBoardFull(soloBoard)) {
      return `🌀 ${currentSoloPlayer.name}님, 중앙 [ORBITO] 버튼을 눌러 회전시키세요!`;
    }
    if (soloPhase === 'PLACE_ONLY') {
      return `⚪ ${currentSoloPlayer.name}님, 빈 칸에 내 구슬을 착수하세요!`;
    }
    return `${currentSoloPlayer.name}님: ① 상대 구슬 밀기(선택) → ② 내 구슬 착수`;
  };

  return (
    <div
      className="orbito-container"
      style={{
        background: soloState === 'PLAYING' ? TURN_BG_COLORS[soloTurn] : TURN_BG_COLORS.BLACK,
      }}
    >
      {toast && soloState === 'PLAYING' && (
        <div key={toast.id} className={`orbito-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {soloState === 'SETUP' && (
        <div className="setup-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setAppMode('HOME')}
            >
              ⬅️ 홈으로
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '6px 12px', fontSize: '12px' }}
              onClick={() => setAppMode('HALL_OF_FAME')}
            >
              🏅 명예의 전당
            </button>
          </div>
          <h1 className="setup-title">🪐 오비토 대국 설정 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">🏆 목표 승수 설정</label>
            <div className="piece-count-selector">
              {[1, 2, 3].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`count-btn ${soloTargetWins === num ? 'active' : ''}`}
                  onClick={() => setSoloTargetWins(num)}
                >
                  {num === 1 ? '단판 승부' : `${num * 2 - 1}판 ${num}선승`}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">🌀 궤도 회전 방향</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                type="button"
                className={`count-btn ${soloOrbitDir === 'CCW' ? 'active' : ''}`}
                onClick={() => setSoloOrbitDir('CCW')}
              >
                ↺ 반시계 방향 (정식 룰)
              </button>
              <button
                type="button"
                className={`count-btn ${soloOrbitDir === 'CW' ? 'active' : ''}`}
                onClick={() => setSoloOrbitDir('CW')}
              >
                ↻ 시계 방향
              </button>
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">⚔️ 대국자 이름 입력</label>
            <div className="player-list">
              <div className="player-item">
                <span className="marble-badge-icon black" />
                <span style={{ minWidth: '64px', fontSize: '13px' }}>흑(선공)</span>
                <input
                  type="text"
                  className="player-input"
                  value={blackName}
                  placeholder="흑 플레이어 이름"
                  onChange={(e) => setBlackName(e.target.value)}
                />
              </div>

              <div className="player-item">
                <span className="marble-badge-icon white" />
                <span style={{ minWidth: '64px', fontSize: '13px' }}>백(후공)</span>
                <input
                  type="text"
                  className="player-input"
                  value={whiteName}
                  placeholder="백 플레이어 이름"
                  onChange={(e) => setWhiteName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rule-summary-box">
            <strong>📜 오비토(ORBITO) 진행 순서:</strong>
            <ul>
              <li>
                <strong>1단계 (선택):</strong> 상대 구슬 1개를 상하좌우 인접한 빈 칸으로 1칸 밀어낼 수 있습니다.
              </li>
              <li>
                <strong>2단계 (필수):</strong> 빈 칸 1곳에 내 구슬을 착수합니다.
              </li>
              <li>
                <strong>3단계 (회전):</strong> 중앙의 <strong>[ORBITO]</strong> 버튼을 누르면 바깥 12칸과 안쪽 4칸 구슬이 1칸씩 회전한 뒤 <strong>4목</strong> 여부를 판정합니다!
              </li>
            </ul>
          </div>

          <button type="button" className="btn btn-success" onClick={startSoloGame}>
            🚀 대국 시작하기!
          </button>
        </div>
      )}

      {soloState === 'PLAYING' && (
        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="player-status-bar">
              {soloPlayers.map((p) => {
                const isActive = p.color === soloTurn;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? '#6366f1' : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span
                        className={`marble-badge-icon mini ${
                          p.color === 'BLACK' ? 'black' : 'white'
                        }`}
                      />
                      <strong>{p.name}</strong>
                      <span className="badge-score">
                        {p.wins}/{soloTargetWins}승
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-compact-setup"
              onClick={() => setSoloState('SETUP')}
              title="설정으로 돌아가기"
            >
              🚪
            </button>
          </div>

          <div className="orbito-board-outer">
            <div className="orbito-board-crest">
              🪐 ORBITO 4×4 · 착수 후 중앙 버튼을 눌러 궤도를 회전시키세요 🪐
            </div>

            {renderOrbitoBoard(
              soloBoard,
              soloTurn,
              soloPhase,
              soloSelectedPush,
              soloLastPlaced,
              soloWinningLine,
              soloOrbitDir,
              true,
              handleSoloCellClick,
              handleSoloTriggerOrbit
            )}
          </div>

          <div className="orbito-bottom-dock">
            <div className="turn-status-group">
              <span
                className={`marble-badge-icon ${soloTurn === 'BLACK' ? 'black' : 'white'}`}
              />
              <span>{getSoloPhaseInstruction()}</span>
            </div>

            <span className="move-count-pill">
              {soloOrbitDir === 'CCW' ? '↺ 반시계' : '↻ 시계'}
            </span>
          </div>
        </div>
      )}

      {soloState === 'GAME_OVER' && (
        <div className="modal-overlay">
          {!soloIsDraw && (
            <div className="confetti-layer">
              {Array.from({ length: 45 }).map((_, i) => (
                <div
                  key={i}
                  className="confetti-piece"
                  style={{
                    left: `${(i * 2.3) % 100}%`,
                    backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                    animationDuration: `${2.2 + (i % 5) * 0.45}s`,
                    animationDelay: `${(i % 7) * 0.15}s`,
                  }}
                />
              ))}
            </div>
          )}

          <div className="modal-content">
            <div className="modal-trophy">{soloIsDraw ? '🤝' : '👑🏆👑'}</div>
            <div className="congrats-banner">
              {soloIsDraw
                ? 'DRAW GAME'
                : isSoloSeriesOver
                ? '✨ CHAMPION VICTORY! ✨'
                : 'ROUND VICTORY!'}
            </div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {soloIsDraw
                ? '무승부입니다!'
                : isSoloSeriesOver
                ? `${soloRoundWinner?.name}님 최종 우승! 🌟`
                : `${soloRoundWinner?.name}님 승리!`}
            </h2>
            <p className="modal-subtext">
              {soloIsDraw
                ? '4목이 완성되지 않았거나 양쪽 동시에 완성되었습니다.'
                : '궤도 회전 후 4목을 완성하여 승리했습니다!'}
            </p>

            <div className="rank-list">
              {soloPlayers.map((p) => {
                const isChamp = soloRoundWinner?.id === p.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={`marble-badge-icon mini ${
                          p.color === 'BLACK' ? 'black' : 'white'
                        }`}
                      />
                      {isChamp ? '🥇 ' : ''}
                      {p.name}
                    </span>
                    <span>
                      {p.wins} / {soloTargetWins}승 ({p.movesCount}수)
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setSoloState('SETUP')}
              >
                ⚙️ 설정 변경
              </button>
              <button
                type="button"
                className="btn btn-success"
                onClick={startNextSoloRound}
              >
                {isSoloSeriesOver ? '🔄 새 매치 시작' : '🔥 다음 국 (흑/백 교대)'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}