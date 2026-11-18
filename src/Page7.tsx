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
import './Page7.css';

type GoalSide = 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT';
type WallOrientation = 'H' | 'V';

interface PlacedWall {
  r: number; // 0..7 (교차로 행 인덱스)
  c: number; // 0..7 (교차로 열 인덱스)
  orientation: WallOrientation;
  ownerColor: string;
}

interface QuoridorPlayer {
  id: string;
  name: string;
  color: string;
  row: number;
  col: number;
  goalSide: GoalSide;
  wallsLeft: number;
  turnsTaken: number;
}

interface SpectatorPlayer {
  id: string;
  name: string;
}

interface NetQuoridorRoom {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'PLAYING' | 'GAME_OVER';
  players: QuoridorPlayer[];
  spectators: SpectatorPlayer[];
  wallsJson: string;
  baseTimeout: number;
  currentPlayerIdx: number;
  turnDeadline: number | null;
  winnerId: string | null;
  lastActionNotice: string;
  consecutiveTimeouts: number;
  waitingSince?: number | null;
}

interface HallOfFameRecord {
  id: string;
  name: string;
  detail: string;
  date: string;
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #fef3c7 0%, #fffbeb 50%, #f0f9ff 100%)',
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fff7ed 100%)',
];

const PIECE_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706'];
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const GOAL_LABELS: Record<GoalSide, string> = {
  TOP: '⬆️ 맨 위쪽 끝줄(1행) 도달',
  BOTTOM: '⬇️ 맨 아래쪽 끝줄(9행) 도달',
  LEFT: '⬅️ 맨 왼쪽 끝줄(1열) 도달',
  RIGHT: '➡️ 맨 오른쪽 끝줄(9열) 도달',
};

function getShortName(name: string): string {
  const trimmed = name ? name.trim() : '';
  return trimmed ? trimmed.slice(0, 2) : '?';
}

function createInitialPlayersForCount(rawPlayers: { id: string; name: string }[]): QuoridorPlayer[] {
  const count = rawPlayers.length;
  const wallsPerPlayer = count <= 2 ? 10 : 5;

  // 2인: 하단(8,4)->TOP, 상단(0,4)->BOTTOM
  // 3~4인: 하단(8,4)->TOP, 상단(0,4)->BOTTOM, 좌측(4,0)->RIGHT, 우측(4,8)->LEFT
  const configs: { row: number; col: number; goalSide: GoalSide }[] = [
    { row: 8, col: 4, goalSide: 'TOP' },
    { row: 0, col: 4, goalSide: 'BOTTOM' },
    { row: 4, col: 0, goalSide: 'RIGHT' },
    { row: 4, col: 8, goalSide: 'LEFT' },
  ];

  return rawPlayers.map((p, idx) => ({
    id: p.id,
    name: p.name,
    color: PIECE_COLORS[idx % PIECE_COLORS.length],
    row: configs[idx].row,
    col: configs[idx].col,
    goalSide: configs[idx].goalSide,
    wallsLeft: wallsPerPlayer,
    turnsTaken: 0,
  }));
}

/**
 * 인접한 두 칸 (r1, c1)과 (r2, c2) 사이에 설치된 벽이 있는지 확인
 */
function isBlockedByWall(r1: number, c1: number, r2: number, c2: number, walls: PlacedWall[]): boolean {
  if (r2 < 0 || r2 >= 9 || c2 < 0 || c2 >= 9) return true;

  // 수직 이동 (위/아래)
  if (c1 === c2) {
    const topRow = Math.min(r1, r2); // topRow와 topRow+1 사이의 가로 경계
    // 가로벽(H)이 (topRow, c1) 또는 (topRow, c1 - 1)에 있으면 막힘
    return walls.some(
      (w) => w.orientation === 'H' && w.r === topRow && (w.c === c1 || w.c === c1 - 1)
    );
  }

  // 수평 이동 (좌/우)
  if (r1 === r2) {
    const leftCol = Math.min(c1, c2); // leftCol과 leftCol+1 사이의 세로 경계
    // 세로벽(V)이 (r1, leftCol) 또는 (r1 - 1, leftCol)에 있으면 막힘
    return walls.some(
      (w) => w.orientation === 'V' && w.c === leftCol && (w.r === r1 || w.r === r1 - 1)
    );
  }

  return true;
}

/**
 * 쿼리도 정식 말 이동 가능 칸 계산 (상대 말 정면 점프 및 벽 막힘 시 대각선 우회 점프 포함)
 */
function getValidMoves(
  currentPlayer: QuoridorPlayer,
  allPlayers: QuoridorPlayer[],
  walls: PlacedWall[]
): Set<string> {
  const valid = new Set<string>();
  const { row, col } = currentPlayer;
  const occupied = new Set(
    allPlayers.filter((p) => p.id !== currentPlayer.id).map((p) => `${p.row},${p.col}`)
  );

  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  for (const { dr, dc } of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
    if (isBlockedByWall(row, col, nr, nc, walls)) continue;

    if (!occupied.has(`${nr},${nc}`)) {
      valid.add(`${nr},${nc}`);
    } else {
      // 상대 말이 인접한 칸에 있을 때 점프 판정
      const jr = nr + dr;
      const jc = nc + dc;
      if (
        jr >= 0 &&
        jr < 9 &&
        jc >= 0 &&
        jc < 9 &&
        !isBlockedByWall(nr, nc, jr, jc, walls) &&
        !occupied.has(`${jr},${jc}`)
      ) {
        // 정면 점프 가능
        valid.add(`${jr},${jc}`);
      } else {
        // 정면 점프가 벽/보드끝/다른말로 막혔다면 좌우 대각선 점프 허용
        const sideDirs =
          dr !== 0
            ? [
                { sdr: 0, sdc: -1 },
                { sdr: 0, sdc: 1 },
              ]
            : [
                { sdr: -1, sdc: 0 },
                { sdr: 1, sdc: 0 },
              ];

        for (const { sdr, sdc } of sideDirs) {
          const sr = nr + sdr;
          const sc = nc + sdc;
          if (
            sr >= 0 &&
            sr < 9 &&
            sc >= 0 &&
            sc < 9 &&
            !isBlockedByWall(nr, nc, sr, sc, walls) &&
            !occupied.has(`${sr},${sc}`)
          ) {
            valid.add(`${sr},${sc}`);
          }
        }
      }
    }
  }

  return valid;
}

/**
 * BFS 경로 존재 검증: 해당 플레이어가 자신의 목표 끝줄에 도달할 수 있는지 검사
 */
function hasPathToGoal(player: QuoridorPlayer, walls: PlacedWall[]): boolean {
  const visited = new Set<string>([`${player.row},${player.col}`]);
  const queue: { r: number; c: number }[] = [{ r: player.row, c: player.col }];
  const dirs = [
    { dr: -1, dc: 0 },
    { dr: 1, dc: 0 },
    { dr: 0, dc: -1 },
    { dr: 0, dc: 1 },
  ];

  while (queue.length > 0) {
    const { r, c } = queue.shift()!;
    if (player.goalSide === 'TOP' && r === 0) return true;
    if (player.goalSide === 'BOTTOM' && r === 8) return true;
    if (player.goalSide === 'LEFT' && c === 0) return true;
    if (player.goalSide === 'RIGHT' && c === 8) return true;

    for (const { dr, dc } of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nr >= 9 || nc < 0 || nc >= 9) continue;
      const key = `${nr},${nc}`;
      if (visited.has(key)) continue;
      if (!isBlockedByWall(r, c, nr, nc, walls)) {
        visited.add(key);
        queue.push({ r: nr, c: nc });
      }
    }
  }

  return false;
}

/**
 * 새 벽 설치 유효성 검사 (기존 벽과 겹침/십자 교차 금지 + 모든 플레이어 경로 보장)
 */
function validateWallPlacement(
  newWall: PlacedWall,
  existingWalls: PlacedWall[],
  allPlayers: QuoridorPlayer[]
): { valid: boolean; reason?: string } {
  for (const w of existingWalls) {
    // 완전히 같은 교차로
    if (w.r === newWall.r && w.c === newWall.c) {
      return { valid: false, reason: '이미 벽이 설치된 교차로입니다!' };
    }
    // 같은 방향으로 절반이 겹치는 경우
    if (w.orientation === newWall.orientation) {
      if (newWall.orientation === 'H' && w.r === newWall.r && Math.abs(w.c - newWall.c) === 1) {
        return { valid: false, reason: '기존 가로벽과 겹쳐서 설치할 수 없습니다!' };
      }
      if (newWall.orientation === 'V' && w.c === newWall.c && Math.abs(w.r - newWall.r) === 1) {
        return { valid: false, reason: '기존 세로벽과 겹쳐서 설치할 수 없습니다!' };
      }
    }
  }

  const simulatedWalls = [...existingWalls, newWall];
  for (const p of allPlayers) {
    if (!hasPathToGoal(p, simulatedWalls)) {
      return {
        valid: false,
        reason: `🚫 ${p.name}님의 목표 길을 완전히 막을 수 없습니다!`,
      };
    }
  }

  return { valid: true };
}

function checkWinner(player: QuoridorPlayer): boolean {
  if (player.goalSide === 'TOP' && player.row === 0) return true;
  if (player.goalSide === 'BOTTOM' && player.row === 8) return true;
  if (player.goalSide === 'LEFT' && player.col === 0) return true;
  if (player.goalSide === 'RIGHT' && player.col === 8) return true;
  return false;
}

function createDefaultNetRoom(roomId: number): NetQuoridorRoom {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    spectators: [],
    wallsJson: '[]',
    baseTimeout: 45,
    currentPlayerIdx: 0,
    turnDeadline: null,
    winnerId: null,
    lastActionNotice: '',
    consecutiveTimeouts: 0,
    waitingSince: null,
  };
}

export default function Page7() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('quoridor_net_uid');
    if (saved) return saved;
    const generated = `quser_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('quoridor_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetQuoridorRoom[]>([1, 2, 3, 4].map(createDefaultNetRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetQuoridorRoom | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);

  // 단독게임 상태
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<QuoridorPlayer[]>(
    createInitialPlayersForCount([
      { id: '1', name: '다윗' },
      { id: '2', name: '솔로몬' },
    ])
  );
  const [inputName, setInputName] = useState('');
  const [walls, setWalls] = useState<PlacedWall[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [winner, setWinner] = useState<QuoridorPlayer | null>(null);

  // 턴 행동 모드 (이동 vs 벽 설치)
  const [actionMode, setActionMode] = useState<'MOVE' | 'WALL'>('MOVE');
  const [wallOrientation, setWallOrientation] = useState<WallOrientation>('H');
  const [selectedIntersection, setSelectedIntersection] = useState<{ r: number; c: number } | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'bonus' | 'celebrate';
  } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = (text: string, type: 'info' | 'bonus' | 'celebrate' = 'info') => {
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

  const playSound = (kind: 'step' | 'wall' | 'error' | 'win') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current) audioCtxRef.current = new AudioCtx();
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const notesMap: Record<typeof kind, number[]> = {
        step: [523.25],
        wall: [329.63, 261.63],
        error: [196.0],
        win: [523.25, 659.25, 783.99, 1046.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.18);
      });
    } catch {}
  };

  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; detail: string }) => {
    const key = type === 'SOLO' ? 'quoridor_hof_solo' : 'quoridor_hof_net';
    try {
      const existing: HallOfFameRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
      const newEntry: HallOfFameRecord = {
        id: `qrec_${Date.now()}`,
        name: record.name,
        detail: record.detail,
        date: new Date().toLocaleDateString(),
      };
      localStorage.setItem(key, JSON.stringify([newEntry, ...existing].slice(0, 10)));
    } catch {}
  };

  const getHallOfFameRecords = (type: 'SOLO' | 'NET'): HallOfFameRecord[] => {
    const key = type === 'SOLO' ? 'quoridor_hof_solo' : 'quoridor_hof_net';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };

  // Firebase 실시간 방 구독
  useEffect(() => {
    if (appMode !== 'NET_LOBBY' && appMode !== 'NET_ROOM') return;

    const ensureRoomsExist = async () => {
      for (const id of [1, 2, 3, 4]) {
        const roomRef = ref(db, `quoridor_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultNetRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'quoridor_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;
      const loadedRooms: NetQuoridorRoom[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultNetRoom(id);
        if (!rData) return def;
        return {
          ...def,
          ...rData,
          players: rData.players || [],
          spectators: rData.spectators || [],
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

  // 턴 타이머 & 7분 대기실 자동 초기화
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
        setWaitingCountdownSec(Math.max(0, 420 - Math.floor(elapsedSec)));
        if (elapsedSec >= 425) {
          await set(ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`), createDefaultNetRoom(activeNetRoom.roomId));
          showToast('⏳ 대기 시간이 7분을 초과하여 방이 초기화되었습니다.', 'info');
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
          const playersArr = activeNetRoom.players || [];
          if (playersArr.length > 0) {
            const nextIdx = (activeNetRoom.currentPlayerIdx + 1) % playersArr.length;
            await update(ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`), {
              currentPlayerIdx: nextIdx,
              turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
              lastActionNotice: `⏰ 시간 초과로 다음 차례(${playersArr[nextIdx].name})로 넘어갔습니다!`,
            });
          }
        }
      }
    }, 500);

    return () => window.clearInterval(timer);
  }, [appMode, activeNetRoom]);

  // 단독게임 플레이어 관리
  const addPlayer = () => {
    const trimmed = inputName.trim();
    if (!trimmed) return;
    if (players.length >= 4) {
      showToast('최대 4명까지 참가할 수 있습니다.', 'info');
      return;
    }
    const nextRaw = [...players.map((p) => ({ id: p.id, name: p.name })), { id: String(Date.now()), name: trimmed }];
    setPlayers(createInitialPlayersForCount(nextRaw));
    setInputName('');
  };

  const removePlayer = (id: string) => {
    const nextRaw = players.filter((p) => p.id !== id).map((p) => ({ id: p.id, name: p.name }));
    setPlayers(createInitialPlayersForCount(nextRaw));
  };

  const shufflePlayersOrder = () => {
    const shuffled = [...players].sort(() => Math.random() - 0.5).map((p) => ({ id: p.id, name: p.name }));
    setPlayers(createInitialPlayersForCount(shuffled));
  };

  const startSoloGame = () => {
    if (players.length !== 2 && players.length !== 4) {
      showToast('쿼리도는 2인 또는 4인 대전을 권장합니다! (3명일 경우 1명 추가/삭제)', 'info');
      return;
    }
    const freshPlayers = createInitialPlayersForCount(players.map((p) => ({ id: p.id, name: p.name })));
    setPlayers(freshPlayers);
    setWalls([]);
    setCurrentPlayerIdx(0);
    setActionMode('MOVE');
    setSelectedIntersection(null);
    setWinner(null);
    setGameState('PLAYING');
    showToast(`🧭 ${freshPlayers[0].name}님 차례! 초록색 칸으로 이동하거나 벽을 설치하세요.`, 'info');
  };

  // 단독게임 말 이동 실행
  const handleSoloMoveCell = (r: number, c: number) => {
    if (gameState !== 'PLAYING' || actionMode !== 'MOVE') return;
    const currP = players[currentPlayerIdx];
    const validMoves = getValidMoves(currP, players, walls);

    if (!validMoves.has(`${r},${c}`)) {
      playSound('error');
      showToast('🚧 이동할 수 없는 칸입니다! 초록색으로 빛나는 칸을 터치하세요.', 'info');
      return;
    }

    playSound('step');
    const updatedPlayers = players.map((p, idx) =>
      idx === currentPlayerIdx
        ? { ...p, row: r, col: c, turnsTaken: p.turnsTaken + 1 }
        : p
    );
    setPlayers(updatedPlayers);

    const movedPlayer = updatedPlayers[currentPlayerIdx];
    if (checkWinner(movedPlayer)) {
      setWinner(movedPlayer);
      setGameState('GAME_OVER');
      playSound('win');
      speakKorean(`축하합니다! ${movedPlayer.name}님이 반대편 끝줄에 도달하여 우승했습니다!`);
      saveHallOfFameRecord('SOLO', {
        name: movedPlayer.name,
        detail: `${players.length}인 대전 · 총 ${movedPlayer.turnsTaken}턴 우승`,
      });
      return;
    }

    const nextIdx = (currentPlayerIdx + 1) % updatedPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    setSelectedIntersection(null);
    showToast(`👉 ${updatedPlayers[nextIdx].name}님 차례입니다!`, 'celebrate');
  };

  // 단독게임 벽 설치 확정
  const handleSoloConfirmWall = () => {
    if (!selectedIntersection) return;
    const currP = players[currentPlayerIdx];
    if (currP.wallsLeft <= 0) {
      playSound('error');
      showToast('🚫 남은 울타리(벽)가 없습니다!', 'info');
      return;
    }

    const candidateWall: PlacedWall = {
      r: selectedIntersection.r,
      c: selectedIntersection.c,
      orientation: wallOrientation,
      ownerColor: currP.color,
    };

    const validation = validateWallPlacement(candidateWall, walls, players);
    if (!validation.valid) {
      playSound('error');
      showToast(validation.reason || '설치할 수 없는 위치입니다.', 'info');
      return;
    }

    playSound('wall');
    const nextWalls = [...walls, candidateWall];
    const updatedPlayers = players.map((p, idx) =>
      idx === currentPlayerIdx
        ? { ...p, wallsLeft: p.wallsLeft - 1, turnsTaken: p.turnsTaken + 1 }
        : p
    );

    setWalls(nextWalls);
    setPlayers(updatedPlayers);
    setSelectedIntersection(null);
    setActionMode('MOVE');

    const nextIdx = (currentPlayerIdx + 1) % updatedPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    showToast(`🧱 벽 설치 완료! 다음은 ${updatedPlayers[nextIdx].name}님 차례입니다.`, 'bonus');
  };

  // 넷게임 방 입장
  const handleEnterNetRoom = async (asSpectator = false) => {
    if (!joinModalRoom) return;
    const trimmedName = joinPlayerName.trim();
    if (!trimmedName) {
      alert('이름을 입력해주세요!');
      return;
    }
    const roomRef = ref(db, `quoridor_rooms/room_${joinModalRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      const room: NetQuoridorRoom = roomData || createDefaultNetRoom(joinModalRoom.roomId);
      if (!room.players) room.players = [];
      if (!room.spectators) room.spectators = [];

      if (asSpectator || room.status === 'PLAYING' || room.players.length >= 4) {
        if (!room.spectators.some((s) => s.id === mySessionId)) {
          room.spectators.push({ id: mySessionId, name: trimmedName });
        }
        return room;
      }

      if (!room.players.some((p) => p.id === mySessionId)) {
        const rawList = [...room.players.map((p) => ({ id: p.id, name: p.name })), { id: mySessionId, name: trimmedName }];
        room.players = createInitialPlayersForCount(rawList);
        room.status = 'WAITING';
        if (!room.waitingSince) room.waitingSince = Date.now();
      }
      return room;
    });

    setSelectedRoomId(joinModalRoom.roomId);
    setJoinModalRoom(null);
    setJoinPlayerName('');
    setAppMode('NET_ROOM');
  };

  const handleStartNetGame = async () => {
    if (!activeNetRoom) return;
    const pCount = activeNetRoom.players.length;
    if (pCount !== 2 && pCount !== 4) {
      showToast('쿼리도는 2명 또는 4명일 때 시작할 수 있습니다!', 'info');
      return;
    }
    const initialized = createInitialPlayersForCount(activeNetRoom.players.map((p) => ({ id: p.id, name: p.name })));
    await update(ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`), {
      status: 'PLAYING',
      players: initialized,
      wallsJson: '[]',
      currentPlayerIdx: 0,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      winnerId: null,
      lastActionNotice: `🚀 쿼리도 대전 시작! (${initialized[0].name}님 선공)`,
      waitingSince: null,
    });
  };

  const handleNetMoveCell = async (r: number, c: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING' || actionMode !== 'MOVE') return;
    const netPlayers = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % netPlayers.length;
    const currP = netPlayers[currIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    const netWalls: PlacedWall[] = JSON.parse(activeNetRoom.wallsJson || '[]');
    const validMoves = getValidMoves(currP, netPlayers, netWalls);
    if (!validMoves.has(`${r},${c}`)) {
      playSound('error');
      showToast('🚧 이동할 수 없는 칸입니다!', 'info');
      return;
    }

    playSound('step');
    const updatedPlayers = netPlayers.map((p, idx) =>
      idx === currIdx ? { ...p, row: r, col: c, turnsTaken: p.turnsTaken + 1 } : p
    );
    const movedPlayer = updatedPlayers[currIdx];
    const roomRef = ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`);

    if (checkWinner(movedPlayer)) {
      playSound('win');
      saveHallOfFameRecord('NET', {
        name: movedPlayer.name,
        detail: `넷대전 ${netPlayers.length}인 · ${movedPlayer.turnsTaken}턴 우승`,
      });
      await update(roomRef, {
        players: updatedPlayers,
        status: 'GAME_OVER',
        winnerId: movedPlayer.id,
        turnDeadline: null,
        lastActionNotice: `🏆 ${movedPlayer.name}님이 최종 우승했습니다!`,
      });
      return;
    }

    const nextIdx = (currIdx + 1) % updatedPlayers.length;
    await update(roomRef, {
      players: updatedPlayers,
      currentPlayerIdx: nextIdx,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      lastActionNotice: `👣 ${movedPlayer.name}님 이동 완료! 다음은 ${updatedPlayers[nextIdx].name}님 차례`,
    });
  };

  const handleNetConfirmWall = async () => {
    if (!activeNetRoom || !selectedIntersection) return;
    const netPlayers = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % netPlayers.length;
    const currP = netPlayers[currIdx];
    if (!currP || currP.id !== mySessionId) return;

    if (currP.wallsLeft <= 0) {
      playSound('error');
      showToast('🚫 남은 벽이 없습니다!', 'info');
      return;
    }

    const netWalls: PlacedWall[] = JSON.parse(activeNetRoom.wallsJson || '[]');
    const candidate: PlacedWall = {
      r: selectedIntersection.r,
      c: selectedIntersection.c,
      orientation: wallOrientation,
      ownerColor: currP.color,
    };

    const validation = validateWallPlacement(candidate, netWalls, netPlayers);
    if (!validation.valid) {
      playSound('error');
      showToast(validation.reason || '설치 불가 위치', 'info');
      return;
    }

    playSound('wall');
    const updatedPlayers = netPlayers.map((p, idx) =>
      idx === currIdx ? { ...p, wallsLeft: p.wallsLeft - 1, turnsTaken: p.turnsTaken + 1 } : p
    );
    const nextIdx = (currIdx + 1) % updatedPlayers.length;

    await update(ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`), {
      players: updatedPlayers,
      wallsJson: JSON.stringify([...netWalls, candidate]),
      currentPlayerIdx: nextIdx,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      lastActionNotice: `🧱 ${currP.name}님이 벽을 설치했습니다! 다음은 ${updatedPlayers[nextIdx].name}님 차례`,
    });

    setSelectedIntersection(null);
    setActionMode('MOVE');
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }
    const roomRef = ref(db, `quoridor_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetQuoridorRoom;
      const filteredPlayers = (room.players || []).filter((p) => p.id !== mySessionId);
      const filteredSpecs = (room.spectators || []).filter((s) => s.id !== mySessionId);
      if (filteredPlayers.length === 0 && filteredSpecs.length === 0) {
        return createDefaultNetRoom(room.roomId);
      }
      room.players = filteredPlayers;
      room.spectators = filteredSpecs;
      if (filteredPlayers.length < 2 && room.status === 'PLAYING') {
        room.status = 'WAITING';
      }
      return room;
    });
    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  // 보드 렌더링 헬퍼 (단독/넷 공용)
  const renderQuoridorBoard = (
    boardPlayers: QuoridorPlayer[],
    boardWalls: PlacedWall[],
    activePlayer: QuoridorPlayer | undefined,
    canInteract: boolean,
    onCellClick: (r: number, c: number) => void
  ) => {
    const validMoves =
      canInteract && actionMode === 'MOVE' && activePlayer
        ? getValidMoves(activePlayer, boardPlayers, boardWalls)
        : new Set<string>();

    // 9x9 그리드 내 각 칸 비율: 칸 9.5%, 간격 1.8125% (총 9*9.5 + 8*1.8125 = 85.5 + 14.5 = 100%)
    const stepPct = 11.3125;
    const cellPct = 9.5;
    const groovePct = 1.8125;

    const getWallRectStyle = (w: PlacedWall): React.CSSProperties => {
      if (w.orientation === 'H') {
        return {
          left: `${w.c * stepPct}%`,
          top: `${w.r * stepPct + cellPct}%`,
          width: `${cellPct * 2 + groovePct}%`,
          height: `${groovePct}%`,
        };
      } else {
        return {
          left: `${w.c * stepPct + cellPct}%`,
          top: `${w.r * stepPct}%`,
          width: `${groovePct}%`,
          height: `${cellPct * 2 + groovePct}%`,
        };
      }
    };

    return (
      <div className="quoridor-grid-wrapper">
        {/* 9x9 칸 레이어 */}
        <div className="quoridor-cells-layer">
          {Array.from({ length: 9 }).map((_, r) =>
            Array.from({ length: 9 }).map((__, c) => {
              const isReachable = validMoves.has(`${r},${c}`);
              const pawnHere = boardPlayers.find((p) => p.row === r && p.col === c);
              const goalClass =
                r === 0 ? 'goal-top' : r === 8 ? 'goal-bottom' : c === 0 ? 'goal-left' : c === 8 ? 'goal-right' : '';

              return (
                <div
                  key={`${r}-${c}`}
                  className={`q-cell ${goalClass} ${isReachable ? 'reachable' : ''}`}
                  onClick={() => {
                    if (isReachable) onCellClick(r, c);
                  }}
                >
                  {pawnHere && (
                    <div
                      className={`q-pawn ${pawnHere.id === activePlayer?.id ? 'active-pawn' : ''}`}
                      style={{ backgroundColor: pawnHere.color }}
                    >
                      {getShortName(pawnHere.name)}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 설치된 벽 및 미리보기 벽 레이어 */}
        <div className="quoridor-walls-layer">
          {boardWalls.map((w, idx) => (
            <div
              key={`wall-${idx}`}
              className="q-placed-wall"
              style={getWallRectStyle(w)}
            />
          ))}

          {canInteract && actionMode === 'WALL' && selectedIntersection && (
            <div
              className="q-placed-wall preview"
              style={getWallRectStyle({
                r: selectedIntersection.r,
                c: selectedIntersection.c,
                orientation: wallOrientation,
                ownerColor: '#38bdf8',
              })}
            />
          )}
        </div>

        {/* 벽 설치 모드일 때 8x8 교차로 클릭 버튼 */}
        {canInteract && actionMode === 'WALL' && (
          <div className="quoridor-intersections-layer">
            {Array.from({ length: 8 }).map((_, r) =>
              Array.from({ length: 8 }).map((__, c) => {
                const isSelected =
                  selectedIntersection?.r === r && selectedIntersection?.c === c;
                return (
                  <button
                    key={`int-${r}-${c}`}
                    type="button"
                    className={`q-intersection-btn ${isSelected ? 'selected' : ''}`}
                    style={{
                      left: `${c * stepPct + cellPct + groovePct / 2}%`,
                      top: `${r * stepPct + cellPct + groovePct / 2}%`,
                    }}
                    onClick={() => setSelectedIntersection({ r, c })}
                  />
                );
              })
            )}
          </div>
        )}
      </div>
    );
  };

  // 1. 홈 화면
  if (appMode === 'HOME') {
    return (
      <div className="quoridor-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🧱</div>
          <h1 className="setup-title">쿼리도 (QUORIDOR)</h1>
          <p className="home-subtitle">상대의 길을 벽으로 가로막고 반대편 끝줄에 먼저 도달하라!</p>

          <div className="mode-select-grid">
            <button
              type="button"
              className="mode-select-btn solo"
              onClick={() => {
                setGameState('SETUP');
                setAppMode('SOLO');
              }}
            >
              <span className="mode-icon">🎮</span>
              <strong>단독게임</strong>
              <span className="mode-desc">한 기기에서 2인 또는 4인 대전</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 방 실시간 대전 & 관망</span>
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

  // 2. 명예의 전당
  if (appMode === 'HALL_OF_FAME') {
    const soloRecords = getHallOfFameRecords('SOLO');
    const netRecords = getHallOfFameRecords('NET');
    return (
      <div className="quoridor-container" style={{ background: PLAYER_BG_COLORS[0], padding: '16px' }}>
        <div className="setup-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0 }}>🏅 쿼리도 명예의 전당</h2>
            <div style={{ width: '60px' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="setting-section">
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', textAlign: 'center' }}>🎮 단독 플레이</h3>
              {soloRecords.length === 0 ? (
                <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>기록이 없습니다.</p>
              ) : (
                soloRecords.map((rec, i) => (
                  <div key={rec.id} className="player-item" style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <span>{i + 1}. {rec.name}</span>
                    <span style={{ color: '#059669' }}>{rec.detail}</span>
                  </div>
                ))
              )}
            </div>
            <div className="setting-section">
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', textAlign: 'center' }}>🌐 넷플레이</h3>
              {netRecords.length === 0 ? (
                <p style={{ textAlign: 'center', fontSize: '13px', color: '#64748b' }}>기록이 없습니다.</p>
              ) : (
                netRecords.map((rec, i) => (
                  <div key={rec.id} className="player-item" style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <span>{i + 1}. {rec.name}</span>
                    <span style={{ color: '#d97706' }}>{rec.detail}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. 넷게임 로비
  if (appMode === 'NET_LOBBY') {
    return (
      <div className="quoridor-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="net-lobby-container">
          <div className="net-lobby-header">
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, fontSize: '20px' }}>🌐 쿼리도 온라인 대기실</h2>
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HALL_OF_FAME')}>
              🏅 전당
            </button>
          </div>

          <div className="net-rooms-grid">
            {rooms.map((room) => {
              const pList = room.players || [];
              const isPlaying = room.status === 'PLAYING' || room.status === 'GAME_OVER';
              const isEmpty = pList.length === 0;
              const statusClass = isPlaying ? 'playing' : isEmpty ? 'empty' : 'waiting';
              const statusText = isPlaying ? '🔥 대전중' : isEmpty ? '🟢 빈방' : `🟡 대기중 (${pList.length}/4)`;

              return (
                <div
                  key={room.roomId}
                  className={`net-room-card ${statusClass}`}
                  onClick={() => {
                    if (
                      pList.some((p) => p.id === mySessionId) ||
                      (room.spectators || []).some((s) => s.id === mySessionId)
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
                    <span className="room-number-title">🧱 제 {room.roomId} 대국실</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusText}</span>
                  </div>
                  <div className="room-members-chips">
                    {pList.length === 0 ? (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>도전자를 기다리고 있습니다</span>
                    ) : (
                      pList.map((p, idx) => (
                        <span key={p.id} className="member-chip" style={{ borderColor: PIECE_COLORS[idx] }}>
                          <i style={{ backgroundColor: PIECE_COLORS[idx] }} />
                          {p.name}
                        </span>
                      ))
                    )}
                  </div>
                  <div className="room-enter-cta">👉 클릭하여 대국 참가 또는 관망하기</div>
                </div>
              );
            })}
          </div>
        </div>

        {joinModalRoom && (
          <div className="modal-overlay" onClick={() => setJoinModalRoom(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 8px' }}>🧱 제 {joinModalRoom.roomId} 대국실 입장</h2>
              <p className="modal-subtext">이름을 입력하고 대국에 참가하거나 관망모드로 입장하세요.</p>
              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력"
                value={joinPlayerName}
                autoFocus
                onChange={(e) => setJoinPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnterNetRoom(false)}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1, background: '#0284c7' }}
                  onClick={() => handleEnterNetRoom(true)}
                >
                  👀 관망하기
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 2 }}
                  onClick={() => handleEnterNetRoom(false)}
                >
                  🚀 대국 참가하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 4. 넷게임 방 내부
  if (appMode === 'NET_ROOM' && activeNetRoom) {
    const netPlayers = activeNetRoom.players || [];
    const amISpectator = (activeNetRoom.spectators || []).some((s) => s.id === mySessionId);

    if (activeNetRoom.status === 'WAITING' || activeNetRoom.status === 'EMPTY') {
      const min = Math.floor(waitingCountdownSec / 60);
      const sec = waitingCountdownSec % 60;
      return (
        <div className="quoridor-container" style={{ background: PLAYER_BG_COLORS[0] }}>
          <div className="setup-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button type="button" className="btn btn-secondary" onClick={handleLeaveNetRoom}>
                🚪 방 나가기
              </button>
              <span className="room-status-pill waiting">
                자동 비워짐까지 ⏱️ {min}분 {sec < 10 ? '0' : ''}{sec}초
              </span>
            </div>
            <h1 className="setup-title" style={{ marginTop: '14px' }}>
              🧱 제 {activeNetRoom.roomId} 대국실 대기 중
            </h1>
            <div className="setting-section">
              <label className="setting-label">참가자 ({netPlayers.length}/4명 · 2명 또는 4명 시작 가능)</label>
              <div className="player-list">
                {netPlayers.map((p, idx) => (
                  <div key={p.id} className="player-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="squircle-dot" style={{ backgroundColor: PIECE_COLORS[idx] }}>
                        {getShortName(p.name)}
                      </span>
                      {p.name} {p.id === mySessionId && '(나)'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#059669' }}>준비완료</span>
                  </div>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-success"
              disabled={netPlayers.length !== 2 && netPlayers.length !== 4}
              onClick={handleStartNetGame}
            >
              🚀 쿼리도 대국 시작하기 ({netPlayers.length}명)
            </button>
          </div>
        </div>
      );
    }

    const netWalls: PlacedWall[] = JSON.parse(activeNetRoom.wallsJson || '[]');
    const netCurrIdx = activeNetRoom.currentPlayerIdx % netPlayers.length;
    const netCurrPlayer = netPlayers[netCurrIdx];
    const isMyTurn = netCurrPlayer?.id === mySessionId && !amISpectator;
    const netWinner = netPlayers.find((p) => p.id === activeNetRoom.winnerId);

    return (
      <div
        className="quoridor-container"
        style={{ background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length] }}
      >
        {toast && <div key={toast.id} className={`lab-toast ${toast.type}`}>{toast.text}</div>}

        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">{amISpectator ? '👀관망' : 'ONLINE'}</span>
              <span className={`net-timer-badge ${remainingSeconds <= 7 ? 'urgent' : ''}`}>
                ⏱️ {remainingSeconds}초
              </span>
            </div>

            <div className="player-status-bar">
              {netPlayers.map((p, idx) => (
                <div
                  key={p.id}
                  className={`player-badge-card ${idx === netCurrIdx ? 'active' : ''}`}
                  style={{ borderColor: idx === netCurrIdx ? p.color : 'transparent' }}
                >
                  <div className="player-badge-top">
                    <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                      {getShortName(p.name)}
                    </span>
                    <strong>{p.name}</strong>
                    <span className="badge-score">🧱{p.wallsLeft}</span>
                  </div>
                </div>
              ))}
            </div>

            <button type="button" className="btn btn-secondary btn-compact-setup" onClick={handleLeaveNetRoom}>
              🚪
            </button>
          </div>

          <div className="quoridor-board-outer">
            <div className="quoridor-board-crest">
              {activeNetRoom.lastActionNotice || '⚜️ QUORIDOR ONLINE MATCH ⚜️'}
            </div>
            {renderQuoridorBoard(netPlayers, netWalls, netCurrPlayer, isMyTurn, handleNetMoveCell)}
          </div>

          {netCurrPlayer && (
            <div className="bottom-compact-dock" style={{ borderTop: `4px solid ${netCurrPlayer.color}` }}>
              <div className="dock-mode-box">
                <div className="mode-toggle-row">
                  <button
                    type="button"
                    disabled={!isMyTurn}
                    className={`btn-action-mode ${actionMode === 'MOVE' ? 'active-move' : ''}`}
                    onClick={() => {
                      setActionMode('MOVE');
                      setSelectedIntersection(null);
                    }}
                  >
                    👣 말 이동
                  </button>
                  <button
                    type="button"
                    disabled={!isMyTurn || netCurrPlayer.wallsLeft <= 0}
                    className={`btn-action-mode ${actionMode === 'WALL' ? 'active-wall' : ''}`}
                    onClick={() => setActionMode('WALL')}
                  >
                    🧱 벽 ({netCurrPlayer.wallsLeft})
                  </button>
                </div>

                {actionMode === 'WALL' && isMyTurn && (
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      className="btn-wall-orient"
                      onClick={() => setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))}
                    >
                      {wallOrientation === 'H' ? '➖ 가로벽' : '│ 세로벽'}
                    </button>
                    {selectedIntersection && (
                      <button type="button" className="btn-wall-confirm" onClick={handleNetConfirmWall}>
                        설치!
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="dock-right-info-card">
                <div className="dock-info-top-row">
                  <span className="turn-owner-pill" style={{ backgroundColor: netCurrPlayer.color }}>
                    {netCurrPlayer.name} {isMyTurn ? '(내 차례!)' : '(진행 중)'}
                  </span>
                  <span className="step-status-badge">
                    {!isMyTurn
                      ? '상대방의 수를 기다리는 중...'
                      : actionMode === 'MOVE'
                      ? '초록색 칸을 터치해 이동'
                      : '교차로(점) 터치 후 설치 확정'}
                  </span>
                </div>
                <div className="dock-goal-box">
                  <span style={{ fontSize: '20px' }}>🎯</span>
                  <div>
                    <span className="dock-goal-caption">승리 목표 라인</span>
                    <strong className="dock-goal-name">{GOAL_LABELS[netCurrPlayer.goalSide]}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {activeNetRoom.status === 'GAME_OVER' && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-trophy">👑🏆👑</div>
              <div className="congrats-banner">QUORIDOR CHAMPION!</div>
              <h2 style={{ margin: '6px 0 12px' }}>
                {netWinner ? `${netWinner.name}님 최종 우승!` : '대국 종료!'}
              </h2>
              <button type="button" className="btn btn-success" onClick={handleLeaveNetRoom}>
                🚪 로비로 돌아가기
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // 5. 단독게임 (설정 / 순서 / 플레이 / 우승)
  const currentPlayer = players[currentPlayerIdx];
  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  return (
    <div className="quoridor-container" style={{ background: currentBackground }}>
      {toast && gameState === 'PLAYING' && (
        <div key={toast.id} className={`lab-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {gameState === 'SETUP' && (
        <div className="setup-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HALL_OF_FAME')}>
              🏅 명예의 전당
            </button>
          </div>
          <h1 className="setup-title">🧱 쿼리도 보드게임 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">
              🧭 대국자 등록 (2명 또는 4명 · 2인은 벽 10개씩, 4인은 벽 5개씩 지급)
            </label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="플레이어 이름 입력 후 추가"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              />
              <button type="button" className="btn btn-primary" onClick={addPlayer}>
                ➕ 추가
              </button>
            </div>

            <div className="player-list">
              {players.map((player, idx) => (
                <div key={player.id} className="player-item">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className="squircle-dot"
                      style={{ backgroundColor: PIECE_COLORS[idx % PIECE_COLORS.length] }}
                    >
                      {getShortName(player.name)}
                    </span>
                    {player.name} ({GOAL_LABELS[player.goalSide]})
                  </span>
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() => removePlayer(player.id)}
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rule-summary-box">
            <strong>📜 쿼리도 핵심 규칙:</strong>
            <ul>
              <li>매 턴 **[말 1칸 이동]** 또는 **[울타리(벽) 1개 설치]** 중 한 가지를 선택합니다.</li>
              <li>상대 말과 마주치면 뛰어넘을 수 있으며, 뒤가 막혀 있으면 대각선으로 우회 점프합니다.</li>
              <li>상대의 목표 길을 100% 완전히 막아버리는 벽 설치는 허용되지 않습니다.</li>
            </ul>
          </div>

          <button
            type="button"
            className="btn btn-success"
            disabled={players.length !== 2 && players.length !== 4}
            onClick={() => setGameState('READY')}
          >
            ➡️ 순서 확인 및 시작 ({players.length}명)
          </button>
        </div>
      )}

      {gameState === 'READY' && (
        <div className="order-panel">
          <div className="order-header">
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 대국 순서 및 진영 확인</h2>
            <button type="button" className="btn btn-secondary" onClick={shufflePlayersOrder}>
              🎲 순서 섞기
            </button>
          </div>

          <div className="order-list">
            {players.map((player, idx) => (
              <div key={player.id} className="order-item">
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong style={{ color: '#d97706' }}>{idx + 1}번</strong>
                  <span className="squircle-dot" style={{ backgroundColor: player.color }}>
                    {getShortName(player.name)}
                  </span>
                  {player.name}
                </span>
                <span style={{ fontSize: '12px', color: '#475569' }}>
                  {GOAL_LABELS[player.goalSide]} · 벽 {player.wallsLeft}개
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
              ⬅️ 설정으로
            </button>
            <button type="button" className="btn btn-success" onClick={startSoloGame}>
              🚀 쿼리도 대국 시작!
            </button>
          </div>
        </div>
      )}

      {gameState === 'PLAYING' && currentPlayer && (
        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="player-status-bar">
              {players.map((p, idx) => {
                const isActive = idx === currentPlayerIdx;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''}`}
                    style={{ borderColor: isActive ? p.color : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong>{p.name}</strong>
                      <span className="badge-score">🧱 {p.wallsLeft}개</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-compact-setup"
              onClick={() => setGameState('SETUP')}
              title="설정/나가기"
            >
              🚪
            </button>
          </div>

          <div className="quoridor-board-outer">
            <div className="quoridor-board-crest">
              ⚜️ QUORIDOR · {currentPlayer.name}님의 차례 ({GOAL_LABELS[currentPlayer.goalSide]}) ⚜️
            </div>

            {renderQuoridorBoard(players, walls, currentPlayer, true, handleSoloMoveCell)}
          </div>

          <div
            className="bottom-compact-dock"
            style={{ borderTop: `4px solid ${currentPlayer.color}` }}
          >
            <div className="dock-mode-box">
              <div className="mode-toggle-row">
                <button
                  type="button"
                  className={`btn-action-mode ${actionMode === 'MOVE' ? 'active-move' : ''}`}
                  onClick={() => {
                    setActionMode('MOVE');
                    setSelectedIntersection(null);
                  }}
                >
                  👣 말 이동
                </button>
                <button
                  type="button"
                  disabled={currentPlayer.wallsLeft <= 0}
                  className={`btn-action-mode ${actionMode === 'WALL' ? 'active-wall' : ''}`}
                  onClick={() => setActionMode('WALL')}
                >
                  🧱 벽 ({currentPlayer.wallsLeft})
                </button>
              </div>

              {actionMode === 'WALL' && (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    type="button"
                    className="btn-wall-orient"
                    onClick={() => setWallOrientation((prev) => (prev === 'H' ? 'V' : 'H'))}
                  >
                    {wallOrientation === 'H' ? '➖ 가로벽' : '│ 세로벽'}
                  </button>
                  {selectedIntersection && (
                    <button
                      type="button"
                      className="btn-wall-confirm"
                      onClick={handleSoloConfirmWall}
                    >
                      설치 확정!
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="dock-right-info-card">
              <div className="dock-info-top-row">
                <span
                  className="turn-owner-pill"
                  style={{ backgroundColor: currentPlayer.color }}
                >
                  {currentPlayer.name} ({getShortName(currentPlayer.name)})
                </span>
                <span className="step-status-badge">
                  {actionMode === 'MOVE'
                    ? '초록색으로 빛나는 칸을 터치하여 이동'
                    : '교차로 동그라미를 누른 뒤 [설치 확정!] 클릭'}
                </span>
              </div>

              <div className="dock-goal-and-walls">
                <div className="dock-goal-box">
                  <span style={{ fontSize: '20px' }}>🎯</span>
                  <div>
                    <span className="dock-goal-caption">목표 지점</span>
                    <strong className="dock-goal-name">{GOAL_LABELS[currentPlayer.goalSide]}</strong>
                  </div>
                </div>

                <div className="dock-walls-box">
                  <span className="dock-walls-title">
                    남은 울타리 ({currentPlayer.wallsLeft}개)
                  </span>
                  <div className="walls-visual-bars">
                    {Array.from({ length: players.length <= 2 ? 10 : 5 }).map((_, i) => (
                      <span
                        key={i}
                        className={`wall-mini-stick ${i >= currentPlayer.wallsLeft ? 'used' : ''}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {gameState === 'GAME_OVER' && winner && (
        <div className="modal-overlay">
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

          <div className="modal-content">
            <div className="modal-trophy">👑🏆👑</div>
            <div className="congrats-banner">✨ WONDERFUL! VICTORY! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟
            </h2>
            <p className="modal-subtext">
              목표 끝줄에 가장 먼저 도달했습니다! (총 {winner.turnsTaken}턴 소요 · 남은 벽 {winner.wallsLeft}개)
            </p>

            <div className="rank-list">
              {players.map((p) => {
                const isChamp = p.id === winner.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      {isChamp ? '🥇 ' : ''}
                      {p.name}
                    </span>
                    <span>
                      소요 턴: {p.turnsTaken}턴 · 남은 벽: {p.wallsLeft}개
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setAppMode('HALL_OF_FAME')}
              >
                🏅 명예의 전당
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setGameState('SETUP')}
              >
                ⚙️ 설정 변경
              </button>
              <button type="button" className="btn btn-success" onClick={startSoloGame}>
                🔄 바로 다시 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}