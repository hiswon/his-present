import { useState, useRef, useEffect } from 'react';
import {
  ref,
  onValue,
  set,
  update,
  get,
  runTransaction
} from 'firebase/database';
import { db } from './firebase';
import './Page8.css';

type StoneColor = 'BLACK' | 'WHITE';
type CellValue = StoneColor | null;

interface Coord {
  r: number;
  c: number;
}

interface OmokPlayer {
  id: string;
  name: string;
  stone: StoneColor;
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

interface NetOmokRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'PLAYING' | 'ROUND_OVER';
  players: OmokPlayer[];
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  targetWins: number;
  baseTimeout: number;
  round: number;
  boardFlat: string;
  currentTurn: StoneColor;
  lastMove: Coord | null;
  winningLine: Coord[];
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

const BOARD_SIZE = 15;

// 화점 좌표 (15x15 표준: 3, 7, 11 교차점)
const STAR_POINTS = new Set([
  '3,3', '3,7', '3,11',
  '7,3', '7,7', '7,11',
  '11,3', '11,7', '11,11',
]);

const TURN_BG_COLORS: Record<StoneColor, string> = {
  BLACK: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 50%, #ffedd5 100%)',
  WHITE: 'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #f8fafc 100%)',
};

const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

function createEmptyBoard(): CellValue[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => null)
  );
}

/**
 * 4방향(가로, 세로, 좌상->우하 대각선, 우상->좌하 대각선) 5목 달성 여부 검사
 */
function checkFiveInARow(
  board: CellValue[][],
  row: number,
  col: number,
  color: StoneColor
): Coord[] | null {
  const directions: [number, number][] = [
    [0, 1],  // 가로
    [1, 0],  // 세로
    [1, 1],  // 대각선 ↘
    [1, -1], // 대각선 ↙
  ];

  for (const [dr, dc] of directions) {
    const line: Coord[] = [{ r: row, c: col }];

    // 정방향 탐색
    let nr = row + dr;
    let nc = col + dc;
    while (
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      board[nr]?.[nc] === color
    ) {
      line.push({ r: nr, c: nc });
      nr += dr;
      nc += dc;
    }

    // 역방향 탐색
    nr = row - dr;
    nc = col - dc;
    while (
      nr >= 0 &&
      nr < BOARD_SIZE &&
      nc >= 0 &&
      nc < BOARD_SIZE &&
      board[nr]?.[nc] === color
    ) {
      line.unshift({ r: nr, c: nc });
      nr -= dr;
      nc -= dc;
    }

    if (line.length >= 5) {
      return line;
    }
  }

  return null;
}

function isBoardFull(board: CellValue[][]): boolean {
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (board[r]?.[c] === null) return false;
    }
  }
  return true;
}

function createDefaultOmokRoom(roomId: number): NetOmokRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    waitlist: [],
    spectators: [],
    targetWins: 1,
    baseTimeout: 30,
    round: 1,
    boardFlat: JSON.stringify(createEmptyBoard()),
    currentTurn: 'BLACK',
    lastMove: null,
    winningLine: [],
    turnDeadline: null,
    roundWinnerId: null,
    isDraw: false,
    lastActionNotice: '',
    consecutiveTimeouts: 0,
    waitingSince: null,
  };
}

export default function Page8() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('omok_net_uid');
    if (saved) return saved;
    const generated = `omok_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('omok_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetOmokRoomData[]>([1, 2, 3, 4].map(createDefaultOmokRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetOmokRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);

  // 단독게임 상태
  const [soloState, setSoloState] = useState<'SETUP' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [blackName, setBlackName] = useState<string>('흑기사');
  const [whiteName, setWhiteName] = useState<string>('백기사');
  const [soloTargetWins, setSoloTargetWins] = useState<number>(1);
  const [soloPlayers, setSoloPlayers] = useState<OmokPlayer[]>([
    { id: 'black', name: '흑기사', stone: 'BLACK', wins: 0, movesCount: 0 },
    { id: 'white', name: '백기사', stone: 'WHITE', wins: 0, movesCount: 0 },
  ]);
  const [soloBoard, setSoloBoard] = useState<CellValue[][]>(createEmptyBoard);
  const [soloTurn, setSoloTurn] = useState<StoneColor>('BLACK');
  const [soloHistory, setSoloHistory] = useState<Coord[]>([]);
  const [soloWinningLine, setSoloWinningLine] = useState<Coord[]>([]);
  const [soloRoundWinner, setSoloRoundWinner] = useState<OmokPlayer | null>(null);
  const [soloIsDraw, setSoloIsDraw] = useState<boolean>(false);

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

  const playSound = (kind: 'stone' | 'undo' | 'win') => {
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
        stone: [320, 180],
        undo: [392, 330],
        win: [523.25, 659.25, 783.99, 1046.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'stone' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.05);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.05 + 0.16);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.05);
        osc.stop(ctx.currentTime + idx * 0.05 + 0.16);
      });
    } catch {}
  };

  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; recordDetail: string }) => {
    const key = type === 'SOLO' ? 'omok_hof_solo' : 'omok_hof_net';
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
    const key = type === 'SOLO' ? 'omok_hof_solo' : 'omok_hof_net';
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
        const roomRef = ref(db, `omok_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultOmokRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'omok_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const loadedRooms: NetOmokRoomData[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultOmokRoom(id);
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
          const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);
          await set(roomRef, createDefaultOmokRoom(activeNetRoom.roomId));
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

    const roomRef = ref(db, `omok_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetOmokRoomData = roomData || createDefaultOmokRoom(joinModalRoom.roomId);
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
          const stone: StoneColor = room.players.length === 0 ? 'BLACK' : 'WHITE';
          const newPlayer: OmokPlayer = {
            id: mySessionId,
            name: trimmedName,
            stone,
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

  const updateNetRoomSettings = async (newTargetWins: number, newTimeout: number) => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      targetWins: newTargetWins,
      baseTimeout: newTimeout,
      waitingSince: Date.now(),
    });
  };

  const handleStartNetGame = async () => {
    if (!activeNetRoom) return;
    const roomPlayers = activeNetRoom.players || [];
    if (roomPlayers.length < 2) {
      showToast('흑돌과 백돌 2명이 모여야 대국을 시작할 수 있습니다!', 'info');
      return;
    }

    const initializedPlayers: OmokPlayer[] = roomPlayers.slice(0, 2).map((p, idx) => ({
      ...p,
      stone: idx === 0 ? 'BLACK' : 'WHITE',
      wins: 0,
      movesCount: 0,
    }));

    const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      status: 'PLAYING',
      round: 1,
      players: initializedPlayers,
      boardFlat: JSON.stringify(createEmptyBoard()),
      currentTurn: 'BLACK',
      lastMove: null,
      winningLine: [],
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      roundWinnerId: null,
      isDraw: false,
      lastActionNotice: `⚫ 제 1국 시작! ${initializedPlayers[0].name}(흑돌)님부터 착수하세요.`,
      consecutiveTimeouts: 0,
      waitingSince: null,
    });
  };

  const handleNetPlaceStone = async (r: number, c: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;

    const roomPlayers = activeNetRoom.players || [];
    const currentPlayer = roomPlayers.find((p) => p.stone === activeNetRoom.currentTurn);
    if (!currentPlayer || currentPlayer.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    const board: CellValue[][] = JSON.parse(activeNetRoom.boardFlat || '[]');
    if (!board[r] || board[r][c] !== null) return;

    playSound('stone');
    const nextBoard = board.map((rowArr) => [...rowArr]);
    nextBoard[r][c] = activeNetRoom.currentTurn;

    const winLine = checkFiveInARow(nextBoard, r, c, activeNetRoom.currentTurn);
    const draw = !winLine && isBoardFull(nextBoard);

    const updatedPlayers = roomPlayers.map((p) => {
      if (p.id !== currentPlayer.id) return p;
      return {
        ...p,
        movesCount: (p.movesCount || 0) + 1,
        wins: winLine ? (p.wins || 0) + 1 : p.wins || 0,
      };
    });

    const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);

    if (winLine) {
      playSound('win');
      const winnerObj = updatedPlayers.find((p) => p.id === currentPlayer.id)!;
      const isMatchChampion = winnerObj.wins >= activeNetRoom.targetWins;

      if (isMatchChampion) {
        speakKorean(`축하합니다! ${winnerObj.name}님이 최종 승리했습니다!`);
        saveHallOfFameRecord('NET', {
          name: winnerObj.name,
          recordDetail: `${activeNetRoom.targetWins}선승제 최종 우승 (${winnerObj.movesCount}수)`,
        });
      } else {
        speakKorean(`${winnerObj.name}님 제 ${activeNetRoom.round}국 승리!`);
      }

      await update(roomRef, {
        boardFlat: JSON.stringify(nextBoard),
        players: updatedPlayers,
        lastMove: { r, c },
        winningLine: winLine,
        status: 'ROUND_OVER',
        roundWinnerId: currentPlayer.id,
        isDraw: false,
        turnDeadline: null,
        lastActionNotice: `🏆 ${currentPlayer.name}님이 5목을 완성했습니다!`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    if (draw) {
      await update(roomRef, {
        boardFlat: JSON.stringify(nextBoard),
        players: updatedPlayers,
        lastMove: { r, c },
        winningLine: [],
        status: 'ROUND_OVER',
        roundWinnerId: null,
        isDraw: true,
        turnDeadline: null,
        lastActionNotice: '🤝 바둑판이 가득 차 무승부가 되었습니다!',
        consecutiveTimeouts: 0,
      });
      return;
    }

    const nextTurn: StoneColor = activeNetRoom.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
    const nextPlayer = updatedPlayers.find((p) => p.stone === nextTurn);

    await update(roomRef, {
      boardFlat: JSON.stringify(nextBoard),
      players: updatedPlayers,
      currentTurn: nextTurn,
      lastMove: { r, c },
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      lastActionNotice: `👉 다음은 ${nextPlayer?.name || ''}(${nextTurn === 'BLACK' ? '흑돌' : '백돌'})님 차례입니다.`,
      consecutiveTimeouts: 0,
    });
  };

  const handleNetTurnTimeout = async (room: NetOmokRoomData) => {
    const roomRef = ref(db, `omok_rooms/room_${room.roomId}`);
    const playersArr = room.players || [];
    if (playersArr.length < 2) return;

    const timedOutPlayer = playersArr.find((p) => p.stone === room.currentTurn);
    const newConsecutive = (room.consecutiveTimeouts || 0) + 1;

    // 연속 3회 타임아웃 시 자동 퇴장 및 방 초기화
    if (newConsecutive >= 3 && timedOutPlayer) {
      await set(roomRef, createDefaultOmokRoom(room.roomId));
      showToast(`⏰ ${timedOutPlayer.name}님 장기 미응답으로 대국이 종료되었습니다.`, 'info');
      return;
    }

    const nextTurn: StoneColor = room.currentTurn === 'BLACK' ? 'WHITE' : 'BLACK';
    const nextPlayer = playersArr.find((p) => p.stone === nextTurn);

    await update(roomRef, {
      currentTurn: nextTurn,
      turnDeadline: Date.now() + room.baseTimeout * 1000,
      lastActionNotice: `⏰ ${timedOutPlayer?.name || '상대'}님 시간 초과! ${nextPlayer?.name || ''}님에게 턴이 넘어갑니다.`,
      consecutiveTimeouts: newConsecutive,
    });
  };

  const handleNextNetRound = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetOmokRoomData;
      const playersArr = room.players || [];
      const waitlistArr = room.waitlist || [];

      const matchWinner = playersArr.find((p) => p.wins >= room.targetWins);

      // 시리즈(목표 승수)가 끝났고 대기자가 있다면 승자 잔류 + 대기자 교체
      if (matchWinner) {
        if (waitlistArr.length > 0) {
          const challenger = waitlistArr[0];
          const remainingWaitlist = waitlistArr.slice(1);
          const nextPlayers: OmokPlayer[] = [
            { ...matchWinner, stone: 'BLACK', wins: 0, movesCount: 0 },
            { id: challenger.id, name: challenger.name, stone: 'WHITE', wins: 0, movesCount: 0 },
          ];
          room.players = nextPlayers;
          room.waitlist = remainingWaitlist;
          room.status = 'PLAYING';
          room.round = 1;
          room.boardFlat = JSON.stringify(createEmptyBoard());
          room.currentTurn = 'BLACK';
          room.lastMove = null;
          room.winningLine = [];
          room.roundWinnerId = null;
          room.isDraw = false;
          room.turnDeadline = Date.now() + room.baseTimeout * 1000;
          room.lastActionNotice = `🔥 새로운 도전자 ${challenger.name}님과 대국을 시작합니다!`;
          room.consecutiveTimeouts = 0;
          return room;
        }

        // 대기자가 없으면 승수 초기화 후 재대결(흑/백 교대)
        const swappedPlayers: OmokPlayer[] = playersArr.map((p) => ({
          ...p,
          stone: p.stone === 'BLACK' ? 'WHITE' : 'BLACK',
          wins: 0,
          movesCount: 0,
        }));
        room.players = swappedPlayers;
        room.status = 'PLAYING';
        room.round = 1;
        room.boardFlat = JSON.stringify(createEmptyBoard());
        room.currentTurn = 'BLACK';
        room.lastMove = null;
        room.winningLine = [];
        room.roundWinnerId = null;
        room.isDraw = false;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        room.lastActionNotice = '🔄 흑/백을 교대하여 새 대국을 시작합니다!';
        room.consecutiveTimeouts = 0;
        return room;
      }

      // 시리즈 진행 중 다음 라운드 (흑/백 교대)
      const nextRound = room.round + 1;
      const swappedPlayers: OmokPlayer[] = playersArr.map((p) => ({
        ...p,
        stone: p.stone === 'BLACK' ? 'WHITE' : 'BLACK',
        movesCount: 0,
      }));

      room.players = swappedPlayers;
      room.status = 'PLAYING';
      room.round = nextRound;
      room.boardFlat = JSON.stringify(createEmptyBoard());
      room.currentTurn = 'BLACK';
      room.lastMove = null;
      room.winningLine = [];
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

    const roomRef = ref(db, `omok_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetOmokRoomData;
      const filteredPlayers = (room.players || []).filter((p) => p.id !== mySessionId);
      const filteredWaitlist = (room.waitlist || []).filter((w) => w.id !== mySessionId);
      const filteredSpectators = (room.spectators || []).filter((s) => s.id !== mySessionId);

      if (filteredPlayers.length === 0 && filteredSpectators.length === 0) {
        return createDefaultOmokRoom(room.roomId);
      }

      if (room.status === 'PLAYING' && filteredPlayers.length < 2) {
        return createDefaultOmokRoom(room.roomId);
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
    const bName = blackName.trim() || '흑기사';
    const wName = whiteName.trim() || '백기사';

    setSoloPlayers([
      { id: 'black', name: bName, stone: 'BLACK', wins: 0, movesCount: 0 },
      { id: 'white', name: wName, stone: 'WHITE', wins: 0, movesCount: 0 },
    ]);
    setSoloBoard(createEmptyBoard());
    setSoloTurn('BLACK');
    setSoloHistory([]);
    setSoloWinningLine([]);
    setSoloRoundWinner(null);
    setSoloIsDraw(false);
    setSoloState('PLAYING');
    showToast(`⚫ ${bName}(흑돌)님부터 착수해주세요!`, 'info');
  };

  const startNextSoloRound = () => {
    const isSeriesOver = soloPlayers.some((p) => p.wins >= soloTargetWins);
    setSoloPlayers((prev) =>
      prev.map((p) => ({
        ...p,
        stone: p.stone === 'BLACK' ? 'WHITE' : 'BLACK',
        wins: isSeriesOver ? 0 : p.wins,
        movesCount: 0,
      }))
    );
    setSoloBoard(createEmptyBoard());
    setSoloTurn('BLACK');
    setSoloHistory([]);
    setSoloWinningLine([]);
    setSoloRoundWinner(null);
    setSoloIsDraw(false);
    setSoloState('PLAYING');
    showToast('🔄 흑과 백을 교대하여 새 대국을 시작합니다!', 'info');
  };

  const handleSoloPlaceStone = (r: number, c: number) => {
    if (soloState !== 'PLAYING' || soloBoard[r][c] !== null) return;

    playSound('stone');
    const nextBoard = soloBoard.map((rowArr) => [...rowArr]);
    nextBoard[r][c] = soloTurn;

    const updatedPlayers = soloPlayers.map((p) =>
      p.stone === soloTurn ? { ...p, movesCount: p.movesCount + 1 } : p
    );

    const winLine = checkFiveInARow(nextBoard, r, c, soloTurn);
    const draw = !winLine && isBoardFull(nextBoard);

    setSoloBoard(nextBoard);
    setSoloHistory((prev) => [...prev, { r, c }]);

    if (winLine) {
      playSound('win');
      const finalPlayers = updatedPlayers.map((p) =>
        p.stone === soloTurn ? { ...p, wins: p.wins + 1 } : p
      );
      const champ = finalPlayers.find((p) => p.stone === soloTurn)!;
      setSoloPlayers(finalPlayers);
      setSoloWinningLine(winLine);
      setSoloRoundWinner(champ);
      setSoloState('GAME_OVER');
      speakKorean(`축하합니다! ${champ.name}님이 5목을 완성해 승리했습니다!`);

      if (champ.wins >= soloTargetWins) {
        saveHallOfFameRecord('SOLO', {
          name: champ.name,
          recordDetail: `${soloTargetWins}선승제 우승 (${champ.movesCount}수)`,
        });
      }
      return;
    }

    if (draw) {
      setSoloPlayers(updatedPlayers);
      setSoloIsDraw(true);
      setSoloState('GAME_OVER');
      showToast('🤝 무승부입니다!', 'info');
      return;
    }

    setSoloPlayers(updatedPlayers);
    setSoloTurn((prev) => (prev === 'BLACK' ? 'WHITE' : 'BLACK'));
  };

  const handleSoloUndo = () => {
    if (soloState !== 'PLAYING' || soloHistory.length === 0) return;
    playSound('undo');

    const lastCoord = soloHistory[soloHistory.length - 1];
    const prevTurn: StoneColor = soloTurn === 'BLACK' ? 'WHITE' : 'BLACK';

    const nextBoard = soloBoard.map((rowArr) => [...rowArr]);
    nextBoard[lastCoord.r][lastCoord.c] = null;

    setSoloBoard(nextBoard);
    setSoloHistory((prev) => prev.slice(0, -1));
    setSoloPlayers((prev) =>
      prev.map((p) =>
        p.stone === prevTurn ? { ...p, movesCount: Math.max(0, p.movesCount - 1) } : p
      )
    );
    setSoloTurn(prevTurn);
    showToast('↩️ 한 수 무르기를 했습니다.', 'info');
  };

  // =========================================================
  // 공통 바둑판 렌더링 헬퍼
  // =========================================================
  const renderOmokBoard = (
    boardData: CellValue[][],
    currentTurnColor: StoneColor,
    lastMoveCoord: Coord | null,
    winCoords: Coord[],
    canInteract: boolean,
    onCellClick: (r: number, c: number) => void
  ) => {
    const winSet = new Set(winCoords.map((coord) => `${coord.r},${coord.c}`));

    return (
      <div className="omok-grid-15x15">
        {boardData.map((rowArr, r) =>
          rowArr.map((cell, c) => {
            const key = `${r},${c}`;
            const isStar = STAR_POINTS.has(key);
            const isLast = lastMoveCoord?.r === r && lastMoveCoord?.c === c;
            const isWinStone = winSet.has(key);
            const isPlayable = canInteract && cell === null;

            const edgeClasses = [
              r === 0 ? 'edge-top' : '',
              r === BOARD_SIZE - 1 ? 'edge-bottom' : '',
              c === 0 ? 'edge-left' : '',
              c === BOARD_SIZE - 1 ? 'edge-right' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div
                key={key}
                className={`omok-cell ${edgeClasses} ${isPlayable ? 'playable' : 'disabled'}`}
                onClick={() => isPlayable && onCellClick(r, c)}
              >
                {isStar && cell === null && <span className="omok-star-point" />}

                {isPlayable && (
                  <div
                    className={`omok-hover-ghost ${
                      currentTurnColor === 'BLACK' ? 'black' : 'white'
                    }`}
                  />
                )}

                {cell !== null && (
                  <div
                    className={`omok-stone ${cell === 'BLACK' ? 'black' : 'white'} ${
                      isLast ? 'last-move' : ''
                    } ${isWinStone ? 'winning-stone' : ''}`}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    );
  };

  // =========================================================
  // 1. 홈 화면
  // =========================================================
  if (appMode === 'HOME') {
    return (
      <div className="omok-container" style={{ background: TURN_BG_COLORS.BLACK }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">⚫⚪</div>
          <h1 className="setup-title">전통 오목 대전 (15×15)</h1>
          <p className="home-subtitle">가로 · 세로 · 대각선 5목을 먼저 완성하여 승리하세요!</p>

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
              <span className="mode-desc">한 기기에서 흑과 백 2인 대국 (무르기 지원)</span>
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
      <div className="omok-container" style={{ background: TURN_BG_COLORS.BLACK, padding: '16px' }}>
        <div className="setup-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAppMode('HOME')}
            >
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, color: '#0f172a' }}>🏅 오목 명예의 전당</h2>
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
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#b45309', textAlign: 'center' }}>
                🌐 넷대국 TOP 10
              </h3>
              {netRecords.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>기록이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {netRecords.map((rec, i) => (
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <span><strong>{i + 1}. {rec.name}</strong></span>
                      <span style={{ color: '#d97706' }}>{rec.recordDetail}</span>
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
      <div className="omok-container" style={{ background: TURN_BG_COLORS.BLACK }}>
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
              🌐 온라인 오목 대국실
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
                    <span className="room-number-title">⚫ 제 {room.roomId} 대국실</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>🏆 승리 조건: {room.targetWins}선승제</span>
                    <span>⏱️ 수당 제한시간: {room.baseTimeout}초</span>
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
                              className={`stone-badge-icon mini ${
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
              <h2 style={{ margin: '0 0 8px' }}>⚫ 제 {joinModalRoom.roomId} 대국실 입장</h2>
              <p className="modal-subtext">
                이름을 입력하고 대국에 참가하거나, 대국을 구경하는 <strong>관망모드</strong>를 선택하세요!
              </p>

              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력 (예: 이세돌)"
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
        <div className="omok-container" style={{ background: TURN_BG_COLORS.BLACK, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <div className="omok-container" style={{ background: TURN_BG_COLORS.BLACK }}>
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
              ⚫⚪ 오목 대국 대기실 {amISpectator ? '👀 [관망모드]' : ''}
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
                    onClick={() => updateNetRoomSettings(num, activeNetRoom.baseTimeout)}
                  >
                    {num === 1 ? '단판 승부' : `${num * 2 - 1}판 ${num}선승`}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 한 수 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong>
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
                    updateNetRoomSettings(activeNetRoom.targetWins, Number(e.target.value))
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
                      <span className={`stone-badge-icon ${idx === 0 ? 'black' : 'white'}`} />
                      {p.name} ({idx === 0 ? '흑돌·선공' : '백돌·후공'}) {p.id === mySessionId && '(나)'}
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

    const currentTurnPlayer = roomPlayers.find((p) => p.stone === activeNetRoom.currentTurn);
    const isMyTurn =
      activeNetRoom.status === 'PLAYING' &&
      currentTurnPlayer?.id === mySessionId &&
      !amISpectator;

    const roundWinner = roomPlayers.find((p) => p.id === activeNetRoom.roundWinnerId);
    const matchChampion = roomPlayers.find((p) => p.wins >= activeNetRoom.targetWins);

    return (
      <div
        className="omok-container"
        style={{ background: TURN_BG_COLORS[activeNetRoom.currentTurn] }}
      >
        {toast && (
          <div key={toast.id} className={`omok-toast ${toast.type}`}>
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
                  activeNetRoom.status === 'PLAYING' && p.stone === activeNetRoom.currentTurn;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? '#d97706' : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span
                        className={`stone-badge-icon mini ${
                          p.stone === 'BLACK' ? 'black' : 'white'
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
              👀 현재 관망모드 중입니다. 실시간 대국을 관전하고 있습니다!
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

          <div className="omok-board-outer">
            <div className="omok-board-crest">
              {activeNetRoom.lastActionNotice ||
                `⚜️ 제 ${activeNetRoom.roomId} 대국실 · 제 ${activeNetRoom.round}국 ⚜️`}
            </div>

            {renderOmokBoard(
              netBoard,
              activeNetRoom.currentTurn,
              activeNetRoom.lastMove,
              activeNetRoom.winningLine || [],
              isMyTurn,
              handleNetPlaceStone
            )}
          </div>

          <div className="omok-bottom-dock">
            <div className="turn-status-group">
              <span
                className={`stone-badge-icon ${
                  activeNetRoom.currentTurn === 'BLACK' ? 'black' : 'white'
                }`}
              />
              <span>
                {currentTurnPlayer?.name || ''}
                {isMyTurn ? ' (내 차례 · 착수하세요!)' : ' (착수 대기 중)'}
              </span>
            </div>

            <span className="move-count-pill">
              총 {(roomPlayers[0]?.movesCount || 0) + (roomPlayers[1]?.movesCount || 0)}수 진행
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
                          className={`stone-badge-icon mini ${
                            p.stone === 'BLACK' ? 'black' : 'white'
                          }`}
                        />
                        {isChamp ? '🥇 ' : ''}
                        {p.name}
                      </span>
                      <span>
                        누적 {p.wins}승 / {activeNetRoom.targetWins}승 ({p.movesCount}수)
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
  const currentSoloPlayer = soloPlayers.find((p) => p.stone === soloTurn)!;
  const lastSoloMove = soloHistory.length > 0 ? soloHistory[soloHistory.length - 1] : null;
  const isSoloSeriesOver = soloPlayers.some((p) => p.wins >= soloTargetWins);

  return (
    <div
      className="omok-container"
      style={{ background: soloState === 'PLAYING' ? TURN_BG_COLORS[soloTurn] : TURN_BG_COLORS.BLACK }}
    >
      {toast && soloState === 'PLAYING' && (
        <div key={toast.id} className={`omok-toast ${toast.type}`}>
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
          <h1 className="setup-title">⚫⚪ 오목 대국 설정 (단독게임)</h1>

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
            <label className="setting-label">⚔️ 대국자 이름 입력</label>
            <div className="player-list">
              <div className="player-item">
                <span className="stone-badge-icon black" />
                <span style={{ minWidth: '64px', fontSize: '13px' }}>흑돌(선공)</span>
                <input
                  type="text"
                  className="player-input"
                  value={blackName}
                  placeholder="흑돌 플레이어 이름"
                  onChange={(e) => setBlackName(e.target.value)}
                />
              </div>

              <div className="player-item">
                <span className="stone-badge-icon white" />
                <span style={{ minWidth: '64px', fontSize: '13px' }}>백돌(후공)</span>
                <input
                  type="text"
                  className="player-input"
                  value={whiteName}
                  placeholder="백돌 플레이어 이름"
                  onChange={(e) => setWhiteName(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="rule-summary-box">
            <strong>📜 대국 안내:</strong>
            <ul>
              <li>15×15 오목판에서 흑돌이 먼저 착수합니다.</li>
              <li>가로, 세로, 대각선 방향으로 같은 색 돌 5개를 먼저 연결하면 승리합니다.</li>
              <li>실수했을 경우 하단의 <strong>[↩️ 한 수 무르기]</strong> 버튼을 사용할 수 있습니다.</li>
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
                const isActive = p.stone === soloTurn;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? '#d97706' : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span
                        className={`stone-badge-icon mini ${
                          p.stone === 'BLACK' ? 'black' : 'white'
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

          <div className="omok-board-outer">
            <div className="omok-board-crest">
              ⚜️ 전통 15×15 오목판 · 5목을 먼저 완성하세요 ⚜️
            </div>

            {renderOmokBoard(
              soloBoard,
              soloTurn,
              lastSoloMove,
              soloWinningLine,
              true,
              handleSoloPlaceStone
            )}
          </div>

          <div className="omok-bottom-dock">
            <div className="turn-status-group">
              <span
                className={`stone-badge-icon ${soloTurn === 'BLACK' ? 'black' : 'white'}`}
              />
              <span>
                {currentSoloPlayer.name} ({soloTurn === 'BLACK' ? '흑돌' : '백돌'}) 차례
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="move-count-pill">총 {soloHistory.length}수</span>
              <button
                type="button"
                className="btn btn-primary"
                style={{ padding: '6px 12px', fontSize: '12px' }}
                disabled={soloHistory.length === 0}
                onClick={handleSoloUndo}
              >
                ↩️ 한 수 무르기
              </button>
            </div>
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
                ? '모든 칸이 가득 찼습니다.'
                : `총 ${soloHistory.length}수 만에 5목을 완성했습니다!`}
            </p>

            <div className="rank-list">
              {soloPlayers.map((p) => {
                const isChamp = soloRoundWinner?.id === p.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className={`stone-badge-icon mini ${
                          p.stone === 'BLACK' ? 'black' : 'white'
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