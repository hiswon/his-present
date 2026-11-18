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
import './Page10.css';

type Directions = [boolean, boolean, boolean, boolean];
type TileShape = 'I' | 'L' | 'T';

interface TreasureItem {
  id: string;
  name: string;
  emoji: string;
}

interface BoardTile {
  uid: string;
  shape: TileShape;
  rotation: number;
  fixed: boolean;
  stoneVariant: number;
  treasure?: TreasureItem;
  startCornerOf?: number;
}

interface LabyrinthPlayer {
  id: string;
  name: string;
  color: string;
  row: number;
  col: number;
  startRow: number;
  startCol: number;
  targetStack: TreasureItem[];
  collected: TreasureItem[];
  turnsTaken?: number;
}

interface WaitlistPlayer {
  id: string;
  name: string;
}

interface PushArrow {
  id: string;
  dir: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
  index: number;
  oppositeId: string;
}

interface ShiftingState {
  arrow: PushArrow;
  enteringTile: BoardTile;
  active: boolean;
}

interface NetRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'PLAYING' | 'LEVEL_CLEAR';
  players: LabyrinthPlayer[];
  waitlist: WaitlistPlayer[];
  baseCards: number;
  baseTimeout: number;
  level: number;
  boardFlat: string;
  spareTile: BoardTile | null;
  currentPlayerIdx: number;
  turnPhase: 'SHIFT' | 'MOVE';
  forbiddenArrowId: string | null;
  lastPushedArrowId: string | null;
  turnDeadline: number | null;
  levelWinnerId: string | null;
  lastActionNotice: string;
  consecutiveTimeouts: number;
}

interface HallOfFameRecord {
  id: string;
  name: string;
  scoreOrLevel: string;
  date: string;
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
];

const PIECE_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706'];
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const TREASURE_ITEMS: TreasureItem[] = [
  { id: 't1', name: '의의 면류관', emoji: '👑' },
  { id: 't2', name: '천국 보석', emoji: '💎' },
  { id: 't3', name: '성경 말씀', emoji: '📖' },
  { id: 't4', name: '십자가 사랑', emoji: '❤️' },
  { id: 't5', name: '천국 열쇠', emoji: '🔑' },
  { id: 't6', name: '성령의 비둘기', emoji: '🕊️' },
  { id: 't7', name: '무지개 언약', emoji: '🌈' },
  { id: 't8', name: '승리의 면류관', emoji: '🏆' },
  { id: 't9', name: '성령의 검', emoji: '🗡️' },
  { id: 't10', name: '노아의 방주', emoji: '🚢' },
  { id: 't11', name: '예루살렘 성전', emoji: '⛪' },
  { id: 't12', name: '소망의 닻', emoji: '⚓' },
  { id: 't13', name: '어린 양', emoji: '🐑' },
  { id: 't14', name: '왕의 인장 반지', emoji: '💍' },
  { id: 't15', name: '오병이어 물고기', emoji: '🐟' },
  { id: 't16', name: '율법 두루마리', emoji: '📜' },
  { id: 't17', name: '믿음의 방패', emoji: '🛡️' },
  { id: 't18', name: '동방박사의 별', emoji: '⭐' },
  { id: 't19', name: '등불과 기름', emoji: '🪔' },
  { id: 't20', name: '감람나무 잎사귀', emoji: '🌿' },
  { id: 't21', name: '달란트 주머니', emoji: '💰' },
  { id: 't22', name: '생명의 떡', emoji: '🍞' },
  { id: 't23', name: '찬양의 나팔', emoji: '🎺' },
  { id: 't24', name: '성전 촛대', emoji: '🕯️' },
];

const SHIFT_CHEERS = [
  '와! 길이 완전 열렸어요!',
  '오케이! 탁월한 선택이에요!',
  '조아! 길이 보이기 시작해요!',
  '나이스! 진짜 잘해요!',
];

const MOVE_CHEERS = [
  '좋아! 한 걸음 더 나아갔어요!',
  '오케이! 훌륭한 이동이에요!',
  '멋져요! 보물에 가까워졌어요!',
  '원더풀! 탐험 실력이 대단해요!',
];

const START_CORNERS = [
  { row: 0, col: 0, rotation: 1 },
  { row: 0, col: 6, rotation: 2 },
  { row: 6, col: 6, rotation: 3 },
  { row: 6, col: 0, rotation: 0 },
];

function getShortName(name: string): string {
  const trimmed = name ? name.trim() : '';
  return trimmed ? trimmed.slice(0, 2) : '?';
}

function getOpenDirections(shape: TileShape, rotation: number): Directions {
  let base: Directions;
  if (shape === 'I') {
    base = [true, false, true, false];
  } else if (shape === 'L') {
    base = [true, true, false, false];
  } else {
    base = [false, true, true, true];
  }
  const r = ((rotation % 4) + 4) % 4;
  const rotated: Directions = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    rotated[(i + r) % 4] = base[i];
  }
  return rotated;
}

function findReachablePaths(
  board: BoardTile[][],
  startRow: number,
  startCol: number
): Map<string, { r: number; c: number }[]> {
  const paths = new Map<string, { r: number; c: number }[]>();
  paths.set(`${startRow},${startCol}`, [{ r: startRow, c: startCol }]);

  const queue: { r: number; c: number }[] = [{ r: startRow, c: startCol }];
  const deltas = [
    { dr: -1, dc: 0, dirIdx: 0, oppIdx: 2 },
    { dr: 0, dc: 1, dirIdx: 1, oppIdx: 3 },
    { dr: 1, dc: 0, dirIdx: 2, oppIdx: 0 },
    { dr: 0, dc: -1, dirIdx: 3, oppIdx: 1 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currTile = board[curr.r]?.[curr.c];
    if (!currTile) continue;
    const currDirs = getOpenDirections(currTile.shape, currTile.rotation);
    const currPath = paths.get(`${curr.r},${curr.c}`)!;

    for (const { dr, dc, dirIdx, oppIdx } of deltas) {
      if (!currDirs[dirIdx]) continue;
      const nr = curr.r + dr;
      const nc = curr.c + dc;
      if (nr < 0 || nr >= 7 || nc < 0 || nc >= 7) continue;

      const nextKey = `${nr},${nc}`;
      if (paths.has(nextKey)) continue;

      const nextTile = board[nr]?.[nc];
      if (!nextTile) continue;
      const nextDirs = getOpenDirections(nextTile.shape, nextTile.rotation);
      if (nextDirs[oppIdx]) {
        paths.set(nextKey, [...currPath, { r: nr, c: nc }]);
        queue.push({ r: nr, c: nc });
      }
    }
  }

  return paths;
}

function createInitialBoard(
  treasurePool: TreasureItem[],
  level = 1
): {
  board: BoardTile[][];
  spare: BoardTile;
} {
  const fixedTConfigs: { r: number; c: number; rot: number }[] = [
    { r: 0, c: 2, rot: 0 },
    { r: 0, c: 4, rot: 0 },
    { r: 2, c: 0, rot: 3 },
    { r: 2, c: 2, rot: 3 },
    { r: 2, c: 4, rot: 0 },
    { r: 2, c: 6, rot: 1 },
    { r: 4, c: 0, rot: 3 },
    { r: 4, c: 2, rot: 2 },
    { r: 4, c: 4, rot: 1 },
    { r: 4, c: 6, rot: 1 },
    { r: 6, c: 2, rot: 2 },
    { r: 6, c: 4, rot: 2 },
  ];

  const tCount = Math.max(2, 7 - level);
  const iCount = Math.max(8, 13 - level);
  const lCount = 34 - tCount - iCount;

  const movableShapes: TileShape[] = [
    ...Array(iCount).fill('I'),
    ...Array(lCount).fill('L'),
    ...Array(tCount).fill('T'),
  ];

  const candidateCoords: { r: number; c: number }[] = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const isCorner = (r === 0 || r === 6) && (c === 0 || c === 6);
      if (!isCorner) candidateCoords.push({ r, c });
    }
  }

  const shuffledCoords = [...candidateCoords].sort(() => Math.random() - 0.5);
  const treasureMap = new Map<string, TreasureItem>();
  treasurePool.forEach((item, idx) => {
    if (shuffledCoords[idx]) {
      treasureMap.set(`${shuffledCoords[idx].r},${shuffledCoords[idx].c}`, item);
    }
  });

  const shuffledShapes = movableShapes.sort(() => Math.random() - 0.5);
  let shapeCursor = 0;

  const board: BoardTile[][] = Array.from({ length: 7 }, (_, r) =>
    Array.from({ length: 7 }, (_, c) => {
      const stoneVariant = (r * 3 + c) % 3;
      const cornerIdx = START_CORNERS.findIndex((sc) => sc.row === r && sc.col === c);
      if (cornerIdx !== -1) {
        return {
          uid: `tile-${r}-${c}`,
          shape: 'L',
          rotation: START_CORNERS[cornerIdx].rotation,
          fixed: true,
          stoneVariant,
          startCornerOf: cornerIdx,
        };
      }

      const fixedT = fixedTConfigs.find((ft) => ft.r === r && ft.c === c);
      if (fixedT) {
        return {
          uid: `tile-${r}-${c}`,
          shape: 'T',
          rotation: fixedT.rot,
          fixed: true,
          stoneVariant,
          treasure: treasureMap.get(`${r},${c}`),
        };
      }

      const shape = shuffledShapes[shapeCursor++];
      return {
        uid: `tile-${r}-${c}`,
        shape,
        rotation: Math.floor(Math.random() * 4),
        fixed: false,
        stoneVariant,
        treasure: treasureMap.get(`${r},${c}`),
      };
    })
  );

  const spare: BoardTile = {
    uid: 'tile-spare',
    shape: shuffledShapes[shapeCursor] || 'L',
    rotation: 0,
    fixed: false,
    stoneVariant: 1,
  };

  return { board, spare };
}

function createDefaultRoom(roomId: number): NetRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    waitlist: [],
    baseCards: 3,
    baseTimeout: 45,
    level: 1,
    boardFlat: '[]',
    spareTile: null,
    currentPlayerIdx: 0,
    turnPhase: 'SHIFT',
    forbiddenArrowId: null,
    lastPushedArrowId: null,
    turnDeadline: null,
    levelWinnerId: null,
    lastActionNotice: '',
    consecutiveTimeouts: 0,
  };
}

function getLevelCardCount(baseCards: number, level: number): number {
  return Math.min(6, baseCards + (level - 1));
}

function getLevelTimeoutSeconds(baseTimeout: number, level: number): number {
  return Math.max(15, baseTimeout - (level - 1) * 10);
}

export default function Page10() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('labyrinth_net_uid');
    if (saved) return saved;
    const generated = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('labyrinth_net_uid', generated);
    return generated;
  });

  const [rooms, setRooms] = useState<NetRoomData[]>([1, 2, 3, 4].map(createDefaultRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const timeoutHandledRef = useRef<number | null>(null);

  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<LabyrinthPlayer[]>([
    {
      id: '1',
      name: '사랑',
      color: PIECE_COLORS[0],
      row: 0,
      col: 0,
      startRow: 0,
      startCol: 0,
      targetStack: [],
      collected: [],
      turnsTaken: 0,
    },
    {
      id: '2',
      name: '믿음',
      color: PIECE_COLORS[1],
      row: 0,
      col: 6,
      startRow: 0,
      startCol: 6,
      targetStack: [],
      collected: [],
      turnsTaken: 0,
    },
  ]);

  const [inputName, setInputName] = useState('');
  const [cardsPerPlayer, setCardsPerPlayer] = useState<number>(4);

  const [board, setBoard] = useState<BoardTile[][]>([[]]);
  const [spareTile, setSpareTile] = useState<BoardTile | null>(null);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<'SHIFT' | 'MOVE'>('SHIFT');
  const [forbiddenArrowId, setForbiddenArrowId] = useState<string | null>(null);
  const [lastPushedArrowId, setLastPushedArrowId] = useState<string | null>(null);
  const [shiftingState, setShiftingState] = useState<ShiftingState | null>(null);
  const [winner, setWinner] = useState<LabyrinthPlayer | null>(null);

  const [isPeekingRoad, setIsPeekingRoad] = useState<boolean>(false);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef<boolean>(false);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'treasure' | 'bonus' | 'celebrate';
  } | null>(null);

  const isAnimatingRef = useRef(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = (
    text: string,
    type: 'info' | 'treasure' | 'bonus' | 'celebrate' = 'info'
  ) => {
    setToast({ id: Date.now(), text, type });
  };

  const speakKorean = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      utterance.pitch = 1.08;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playSound = (kind: 'rotate' | 'shift' | 'step' | 'treasure' | 'win') => {
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
        rotate: [440],
        shift: [261.63, 329.63, 392.0],
        step: [523.25],
        treasure: [523.25, 659.25, 783.99, 1046.5],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.06);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.06 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.06);
        osc.stop(ctx.currentTime + idx * 0.06 + 0.2);
      });
    } catch {}
  };

  // 🏆 명예의 전당 저장 함수 (각각 최대 10명)
  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; scoreOrLevel: string }) => {
    const key = type === 'SOLO' ? 'labyrinth_hof_solo' : 'labyrinth_hof_net';
    try {
      const existing: HallOfFameRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
      const newEntry: HallOfFameRecord = {
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: record.name,
        scoreOrLevel: record.scoreOrLevel,
        date: new Date().toLocaleDateString(),
      };
      const updated = [newEntry, ...existing].slice(0, 10); // 최대 10명 유지
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const getHallOfFameRecords = (type: 'SOLO' | 'NET'): HallOfFameRecord[] => {
    const key = type === 'SOLO' ? 'labyrinth_hof_solo' : 'labyrinth_hof_net';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };

  useEffect(() => {
    if (appMode !== 'NET_LOBBY' && appMode !== 'NET_ROOM') return;

    const ensureRoomsExist = async () => {
      for (const id of [1, 2, 3, 4]) {
        const roomRef = ref(db, `labyrinth_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'labyrinth_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const loadedRooms: NetRoomData[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultRoom(id);
        if (!rData) return def;
        return {
          ...def,
          ...rData,
          players: rData.players || [],
          waitlist: rData.waitlist || [],
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

  // 넷게임 턴 제한시간 및 2회 연속 타임아웃 감지 로직
  useEffect(() => {
    if (appMode !== 'NET_ROOM' || !activeNetRoom || activeNetRoom.status !== 'PLAYING') {
      setRemainingSeconds(0);
      return;
    }

    const timer = window.setInterval(() => {
      if (!activeNetRoom.turnDeadline) return;
      const diff = Math.max(0, Math.ceil((activeNetRoom.turnDeadline - Date.now()) / 1000));
      setRemainingSeconds(diff);

      if (diff === 0 && timeoutHandledRef.current !== activeNetRoom.turnDeadline) {
        const currP = activeNetRoom.players?.[activeNetRoom.currentPlayerIdx];
        const amIResponsible =
          currP?.id === mySessionId || activeNetRoom.players?.[0]?.id === mySessionId;

        if (amIResponsible) {
          timeoutHandledRef.current = activeNetRoom.turnDeadline;
          handleNetTurnTimeout(activeNetRoom);
        }
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, [appMode, activeNetRoom, mySessionId]);

  const handleEnterRoomSubmit = async () => {
    if (!joinModalRoom) return;
    const trimmedName = joinPlayerName ? joinPlayerName.trim() : '';
    if (!trimmedName) {
      alert('참가할 이름을 입력해주세요!');
      return;
    }

    const roomRef = ref(db, `labyrinth_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType: string = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetRoomData = roomData || createDefaultRoom(joinModalRoom.roomId);
        if (!room.players) room.players = [];
        if (!room.waitlist) room.waitlist = [];

        if (
          room.players.some((p) => p.id === mySessionId) ||
          room.waitlist.some((w) => w.id === mySessionId)
        ) {
          joinResultType = 'REJOIN';
          return room;
        }

        if ((room.status === 'EMPTY' || room.status === 'WAITING') && room.players.length < 4) {
          const idx = room.players.length;
          const corner = START_CORNERS[idx];
          const newPlayer: LabyrinthPlayer = {
            id: mySessionId,
            name: trimmedName,
            color: PIECE_COLORS[idx],
            row: corner.row,
            col: corner.col,
            startRow: corner.row,
            startCol: corner.col,
            targetStack: [],
            collected: [],
            turnsTaken: 0,
          };

          room.status = 'WAITING';
          room.players.push(newPlayer);
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

      if (joinResultType === 'WAITLIST') {
        showToast('⏳ 현재 게임 중이거나 만석이어서 다음 레벨 예약자로 등록되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateRoomSettings = async (newCards: number, newTimeout: number) => {
    if (!activeNetRoom) return;
    const clampedTimeout = Math.min(100, Math.max(15, newTimeout));
    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      baseCards: newCards,
      baseTimeout: clampedTimeout,
    });
  };

  const startNetLevel = async (
    room: NetRoomData,
    targetLevel: number,
    nextPlayersRaw: LabyrinthPlayer[],
    nextWaitlist: WaitlistPlayer[]
  ) => {
    const levelCards = getLevelCardCount(room.baseCards, targetLevel);
    const levelTimeout = getLevelTimeoutSeconds(room.baseTimeout, targetLevel);

    const totalNeeded = nextPlayersRaw.length * levelCards;
    const shuffledTreasures = [...TREASURE_ITEMS].sort(() => Math.random() - 0.5);
    const selectedPool = shuffledTreasures.slice(0, totalNeeded);

    const { board: initialBoard, spare } = createInitialBoard(selectedPool, targetLevel);

    const initializedPlayers: LabyrinthPlayer[] = nextPlayersRaw.map((p, idx) => {
      const corner = START_CORNERS[idx];
      const assignedCards = selectedPool.slice(idx * levelCards, (idx + 1) * levelCards);
      return {
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        row: corner.row,
        col: corner.col,
        startRow: corner.row,
        startCol: corner.col,
        targetStack: assignedCards,
        collected: [],
        turnsTaken: 0,
      };
    });

    const roomRef = ref(db, `labyrinth_rooms/room_${room.roomId}`);
    await update(roomRef, {
      status: 'PLAYING',
      level: targetLevel,
      players: initializedPlayers,
      waitlist: nextWaitlist,
      boardFlat: JSON.stringify(initialBoard),
      spareTile: spare,
      currentPlayerIdx: 0,
      turnPhase: 'SHIFT',
      forbiddenArrowId: null,
      lastPushedArrowId: null,
      turnDeadline: Date.now() + levelTimeout * 1000,
      levelWinnerId: null,
      lastActionNotice: `🚀 레벨 ${targetLevel} 시작! (보물 ${levelCards}개 · 제한시간 ${levelTimeout}초)`,
      consecutiveTimeouts: 0,
    });
  };

  const handleStartNetGameFromLobby = async () => {
    if (!activeNetRoom) return;
    const currentPlayers = activeNetRoom.players || [];
    if (currentPlayers.length < 2) {
      showToast('최소 2명 이상 모여야 게임을 시작할 수 있습니다!', 'info');
      return;
    }
    await startNetLevel(activeNetRoom, 1, currentPlayers, activeNetRoom.waitlist || []);
  };

  const handleAdvanceToNextLevel = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];

      const nextLevel = room.level + 1;
      if (nextLevel > 5) {
        return createDefaultRoom(room.roomId);
      }

      const currentPlayers = [...room.players];
      const waitlist = [...room.waitlist];
      let nextParticipants: LabyrinthPlayer[] = [];
      let remainingWaitlist: WaitlistPlayer[] = [];

      if (currentPlayers.length + waitlist.length <= 4) {
        const convertedWaiters: LabyrinthPlayer[] = waitlist.map((w) => ({
          id: w.id,
          name: w.name,
          color: PIECE_COLORS[0],
          row: 0,
          col: 0,
          startRow: 0,
          startCol: 0,
          targetStack: [],
          collected: [],
          turnsTaken: 0,
        }));
        nextParticipants = [...currentPlayers, ...convertedWaiters];
        remainingWaitlist = [];
      } else {
        const champion = currentPlayers.find((p) => p.id === room.levelWinnerId);
        const retained = champion ? [champion] : [];
        const slotsAvailable = 4 - retained.length;

        const promotedWaiters: LabyrinthPlayer[] = waitlist
          .slice(0, slotsAvailable)
          .map((w) => ({
            id: w.id,
            name: w.name,
            color: PIECE_COLORS[0],
            row: 0,
            col: 0,
            startRow: 0,
            startCol: 0,
            targetStack: [],
            collected: [],
            turnsTaken: 0,
          }));

        nextParticipants = [...retained, ...promotedWaiters];
        remainingWaitlist = waitlist.slice(slotsAvailable);
      }

      if (nextParticipants.length < 2) {
        const soloRetained = nextParticipants.map((p, idx) => ({
          ...p,
          color: PIECE_COLORS[idx],
          row: START_CORNERS[idx].row,
          col: START_CORNERS[idx].col,
          startRow: START_CORNERS[idx].row,
          startCol: START_CORNERS[idx].col,
          targetStack: [],
          collected: [],
          turnsTaken: 0,
        }));
        room.status = soloRetained.length === 0 ? 'EMPTY' : 'WAITING';
        room.level = nextLevel;
        room.players = soloRetained;
        room.waitlist = remainingWaitlist;
        room.levelWinnerId = null;
        room.turnDeadline = null;
        room.consecutiveTimeouts = 0;
        return room;
      }

      const levelCards = getLevelCardCount(room.baseCards, nextLevel);
      const levelTimeout = getLevelTimeoutSeconds(room.baseTimeout, nextLevel);
      const totalNeeded = nextParticipants.length * levelCards;
      const shuffledTreasures = [...TREASURE_ITEMS].sort(() => Math.random() - 0.5);
      const selectedPool = shuffledTreasures.slice(0, totalNeeded);
      const { board: initialBoard, spare } = createInitialBoard(selectedPool, nextLevel);

      const initializedPlayers = nextParticipants.map((p, idx) => {
        const corner = START_CORNERS[idx];
        return {
          ...p,
          color: PIECE_COLORS[idx],
          row: corner.row,
          col: corner.col,
          startRow: corner.row,
          startCol: corner.col,
          targetStack: selectedPool.slice(idx * levelCards, (idx + 1) * levelCards),
          collected: [],
          turnsTaken: 0,
        };
      });

      room.status = 'PLAYING';
      room.level = nextLevel;
      room.players = initializedPlayers;
      room.waitlist = remainingWaitlist;
      room.boardFlat = JSON.stringify(initialBoard);
      room.spareTile = spare;
      room.currentPlayerIdx = 0;
      room.turnPhase = 'SHIFT';
      room.forbiddenArrowId = null;
      room.lastPushedArrowId = null;
      room.turnDeadline = Date.now() + levelTimeout * 1000;
      room.levelWinnerId = null;
      room.lastActionNotice = `🔥 레벨 ${nextLevel} 돌입! (보물 ${levelCards}개 · 제한시간 ${levelTimeout}초)`;
      room.consecutiveTimeouts = 0;
      
      return room;
    });
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }

    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];

      const filteredPlayers = room.players.filter((p) => p.id !== mySessionId);
      const filteredWaitlist = room.waitlist.filter((w) => w.id !== mySessionId);

      if (room.status === 'WAITING' && filteredPlayers.length === 0) {
        return createDefaultRoom(room.roomId);
      }

      if (room.status === 'LEVEL_CLEAR') {
        const newWinnerId = room.levelWinnerId === mySessionId ? null : room.levelWinnerId;
        if (filteredPlayers.length === 0 && filteredWaitlist.length === 0) {
          return createDefaultRoom(room.roomId);
        }
        room.players = filteredPlayers;
        room.waitlist = filteredWaitlist;
        room.levelWinnerId = newWinnerId;
        return room;
      }

      if (room.status === 'PLAYING' && filteredPlayers.length < 2) {
        return createDefaultRoom(room.roomId);
      }

      const adjustedIdx =
        filteredPlayers.length > 0 ? room.currentPlayerIdx % filteredPlayers.length : 0;

      room.players = filteredPlayers;
      room.waitlist = filteredWaitlist;
      room.currentPlayerIdx = adjustedIdx;
      return room;
    });

    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  // ⏰ 턴 시간 초과 처리 및 2회 이상 연속 방치 시 방 비우기
  const handleNetTurnTimeout = async (room: NetRoomData) => {
    const roomRef = ref(db, `labyrinth_rooms/room_${room.roomId}`);
    const levelTimeout = getLevelTimeoutSeconds(room.baseTimeout, room.level);
    const playersArr = room.players || [];
    const nextIdx = playersArr.length > 0 ? (room.currentPlayerIdx + 1) % playersArr.length : 0;
    const timedOutName = playersArr[room.currentPlayerIdx]?.name || '탐험가';

    const nextTimeouts = (room.consecutiveTimeouts || 0) + 1;

    // 아무도 활동하지 않고 2텀 이상 돌아가면 방을 비움
    if (nextTimeouts >= 2) {
      await set(roomRef, createDefaultRoom(room.roomId));
      showToast('⚠️ 활동이 감지되지 않아 방이 자동으로 비워졌습니다.', 'info');
      setSelectedRoomId(null);
      setAppMode('NET_LOBBY');
      return;
    }

    await update(roomRef, {
      currentPlayerIdx: nextIdx,
      turnPhase: 'SHIFT',
      turnDeadline: Date.now() + levelTimeout * 1000,
      lastActionNotice: `⏰ ${timedOutName}님 시간 초과! (${nextTimeouts}/2텀 방치)`,
      consecutiveTimeouts: nextTimeouts,
    });
  };

  const handleNetRotateSpare = async (delta: number) => {
    if (!activeNetRoom || !activeNetRoom.spareTile || activeNetRoom.turnPhase !== 'SHIFT') return;
    const playersArr = activeNetRoom.players || [];
    const currP = playersArr[activeNetRoom.currentPlayerIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    playSound('rotate');
    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      spareTile: {
        ...activeNetRoom.spareTile,
        rotation: (activeNetRoom.spareTile.rotation + delta + 4) % 4,
      },
    });
  };

  const handleNetPushTile = async (arrow: PushArrow) => {
    if (!activeNetRoom || !activeNetRoom.spareTile || activeNetRoom.turnPhase !== 'SHIFT') return;
    const playersArr = activeNetRoom.players || [];
    const currP = playersArr[activeNetRoom.currentPlayerIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }
    if (arrow.id === activeNetRoom.forbiddenArrowId) {
      showToast('🚫 방금 밀어낸 반대 방향으로는 바로 되밀 수 없습니다!', 'info');
      return;
    }

    playSound('shift');
    const netBoard: BoardTile[][] = JSON.parse(activeNetRoom.boardFlat || '[]');
    const nextBoard = netBoard.map((row) => [...row]);
    const enteringTile = { ...activeNetRoom.spareTile };
    let pushedOutTile: BoardTile;

    if (arrow.dir === 'DOWN') {
      const c = arrow.index;
      pushedOutTile = nextBoard[6][c];
      for (let r = 6; r > 0; r--) nextBoard[r][c] = nextBoard[r - 1][c];
      nextBoard[0][c] = enteringTile;
    } else if (arrow.dir === 'UP') {
      const c = arrow.index;
      pushedOutTile = nextBoard[0][c];
      for (let r = 0; r < 6; r++) nextBoard[r][c] = nextBoard[r + 1][c];
      nextBoard[6][c] = enteringTile;
    } else if (arrow.dir === 'RIGHT') {
      const r = arrow.index;
      pushedOutTile = nextBoard[r][6];
      for (let c = 6; c > 0; c--) nextBoard[r][c] = nextBoard[r][c - 1];
      nextBoard[r][0] = enteringTile;
    } else {
      const r = arrow.index;
      pushedOutTile = nextBoard[r][0];
      for (let c = 0; c < 6; c++) nextBoard[r][c] = nextBoard[r][c + 1];
      nextBoard[r][6] = enteringTile;
    }

    const updatedPlayers = playersArr.map((p) => {
      let { row, col } = p;
      if (arrow.dir === 'DOWN' && col === arrow.index) row = row === 6 ? 0 : row + 1;
      else if (arrow.dir === 'UP' && col === arrow.index) row = row === 0 ? 6 : row - 1;
      else if (arrow.dir === 'RIGHT' && row === arrow.index) col = col === 6 ? 0 : col + 1;
      else if (arrow.dir === 'LEFT' && row === arrow.index) col = col === 0 ? 6 : col - 1;
      return { ...p, row, col };
    });

    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      boardFlat: JSON.stringify(nextBoard),
      spareTile: pushedOutTile,
      players: updatedPlayers,
      forbiddenArrowId: arrow.oppositeId,
      lastPushedArrowId: arrow.id,
      turnPhase: 'MOVE',
      lastActionNotice: `✨ ${currP.name}님이 미로를 밀었습니다! 이동할 칸을 선택하세요.`,
      consecutiveTimeouts: 0, // 활동 감지 시 초기화
    });
  };

  const handleNetSelectMoveTarget = async (targetRow: number, targetCol: number) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING' || activeNetRoom.turnPhase !== 'MOVE')
      return;

    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    const netBoard: BoardTile[][] = JSON.parse(activeNetRoom.boardFlat || '[]');
    const reachableMap = findReachablePaths(netBoard, currP.row, currP.col);
    if (!reachableMap.has(`${targetRow},${targetCol}`)) {
      showToast('🚧 길이 막혀 있어 이동할 수 없는 칸입니다!', 'info');
      return;
    }

    playSound('step');
    const landedTile = netBoard[targetRow]?.[targetCol];
    const targetStack = currP.targetStack || [];
    const currentTargetTreasure = targetStack[0];
    let foundTreasure = false;
    let isLevelWon = false;

    const updatedPlayers = playersArr.map((p, idx) => {
      if (idx !== currIdx) return p;
      const nextStack = [...(p.targetStack || [])];
      const nextCollected = [...(p.collected || [])];
      const nextTurns = (p.turnsTaken || 0) + 1;

      if (
        currentTargetTreasure &&
        landedTile?.treasure &&
        landedTile.treasure.id === currentTargetTreasure.id
      ) {
        foundTreasure = true;
        nextCollected.push(currentTargetTreasure);
        nextStack.shift();
      }

      if (nextStack.length === 0 && targetRow === p.startRow && targetCol === p.startCol) {
        isLevelWon = true;
      }

      return {
        ...p,
        row: targetRow,
        col: targetCol,
        targetStack: nextStack,
        collected: nextCollected,
        turnsTaken: nextTurns,
      };
    });

    const nextBoard = foundTreasure
      ? netBoard.map((rowArr, r) =>
          rowArr.map((tile, c) =>
            r === targetRow && c === targetCol ? { ...tile, treasure: undefined } : tile
          )
        )
      : netBoard;

    const roomRef = ref(db, `labyrinth_rooms/room_${activeNetRoom.roomId}`);

    if (isLevelWon) {
      playSound('win');
      speakKorean(`원더풀! 축하합니다! ${currP.name}님이 1등을 달성했습니다!`);
      
      // 넷플레이 명예의 전당 저장 (가장 짧은 턴수 기준 정렬 가능하도록 레코드 기록)
      saveHallOfFameRecord('NET', {
        name: currP.name,
        scoreOrLevel: `Lv.${activeNetRoom.level} (총 ${currP.turnsTaken || 1}턴 완료)`,
      });

      await update(roomRef, {
        boardFlat: JSON.stringify(nextBoard),
        players: updatedPlayers,
        status: 'LEVEL_CLEAR',
        levelWinnerId: currP.id,
        turnDeadline: null,
        lastActionNotice: `🏆 ${currP.name}님이 레벨 ${activeNetRoom.level} 1등을 달성했습니다!`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    if (foundTreasure) {
      playSound('treasure');
      speakKorean(`원더풀! 보물을 찾았어요!`);
    } else {
      const moveCheer = MOVE_CHEERS[Math.floor(Math.random() * MOVE_CHEERS.length)];
      speakKorean(moveCheer);
    }

    const levelTimeout = getLevelTimeoutSeconds(activeNetRoom.baseTimeout, activeNetRoom.level);
    const nextIdx = (currIdx + 1) % updatedPlayers.length;

    await update(roomRef, {
      boardFlat: JSON.stringify(nextBoard),
      players: updatedPlayers,
      currentPlayerIdx: nextIdx,
      turnPhase: 'SHIFT',
      turnDeadline: Date.now() + levelTimeout * 1000,
      lastActionNotice: foundTreasure
        ? `💎 ${currP.name}님이 [${currentTargetTreasure?.name}] 보물을 획득했습니다!`
        : `👉 다음은 ${updatedPlayers[nextIdx].name}님 차례입니다!`,
      consecutiveTimeouts: 0,
    });
  };

  const startLongPressPeek = () => {
    didLongPressRef.current = false;
    if (longPressTimerRef.current) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      didLongPressRef.current = true;
      setIsPeekingRoad(true);
    }, 260);
  };

  const endLongPressPeek = () => {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (isPeekingRoad) setIsPeekingRoad(false);
  };

  const addPlayer = () => {
    const trimmed = inputName ? inputName.trim() : '';
    if (!trimmed) return;
    if (players.length >= 4) {
      showToast('최대 4명까지 참가할 수 있습니다.', 'info');
      return;
    }
    const idx = players.length;
    const corner = START_CORNERS[idx];
    setPlayers([
      ...players,
      {
        id: String(Date.now() + Math.random()),
        name: trimmed,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        row: corner.row,
        col: corner.col,
        startRow: corner.row,
        startCol: corner.col,
        targetStack: [],
        collected: [],
        turnsTaken: 0,
      },
    ]);
    setInputName('');
  };

  const removePlayer = (id: string) => {
    setPlayers(players.filter((p) => p.id !== id));
  };

  const movePlayerOrder = (index: number, direction: 'UP' | 'DOWN') => {
    const newPlayers = [...players];
    const targetIdx = direction === 'UP' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= newPlayers.length) return;
    [newPlayers[index], newPlayers[targetIdx]] = [newPlayers[targetIdx], newPlayers[index]];
    setPlayers(newPlayers);
  };

  const shufflePlayersOrder = () => {
    setPlayers([...players].sort(() => Math.random() - 0.5));
  };

  const goToMainReady = () => {
    if (players.length < 2) {
      showToast('최소 2명 이상의 탐험가를 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startGame = () => {
    const totalNeeded = players.length * cardsPerPlayer;
    const shuffledTreasures = [...TREASURE_ITEMS].sort(() => Math.random() - 0.5);
    const selectedPool = shuffledTreasures.slice(0, totalNeeded);

    const { board: initialBoard, spare } = createInitialBoard(selectedPool, 1);

    const initializedPlayers = players.map((p, idx) => {
      const corner = START_CORNERS[idx];
      const assignedCards = selectedPool.slice(
        idx * cardsPerPlayer,
        (idx + 1) * cardsPerPlayer
      );
      return {
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        row: corner.row,
        col: corner.col,
        startRow: corner.row,
        startCol: corner.col,
        targetStack: assignedCards,
        collected: [],
        turnsTaken: 0,
      };
    });

    setBoard(initialBoard);
    setSpareTile(spare);
    setPlayers(initializedPlayers);
    setCurrentPlayerIdx(0);
    setTurnPhase('SHIFT');
    setForbiddenArrowId(null);
    setLastPushedArrowId(null);
    setShiftingState(null);
    setIsPeekingRoad(false);
    setWinner(null);
    isAnimatingRef.current = false;
    setGameState('PLAYING');

    const firstTarget = initializedPlayers[0]?.targetStack[0];
    if (firstTarget) {
      showToast(
        `🧭 ${initializedPlayers[0].name}님 차례! 붕붕 뜨는 화살표를 눌러 [${firstTarget.emoji} ${firstTarget.name}] 길을 여세요.`,
        'info'
      );
    }
  };

  const rotateSpareTile = (delta: number) => {
    if (!spareTile || turnPhase !== 'SHIFT' || isAnimatingRef.current) return;
    playSound('rotate');
    setSpareTile({
      ...spareTile,
      rotation: (spareTile.rotation + delta + 4) % 4,
    });
  };

  const handlePushTile = (arrow: PushArrow) => {
    if (
      gameState !== 'PLAYING' ||
      turnPhase !== 'SHIFT' ||
      !spareTile ||
      isAnimatingRef.current
    ) {
      return;
    }

    if (arrow.id === forbiddenArrowId) {
      showToast('🚫 방금 밀어낸 반대 방향으로는 바로 되밀 수 없습니다!', 'info');
      return;
    }

    isAnimatingRef.current = true;
    playSound('shift');

    const enteringTile = { ...spareTile };
    setShiftingState({ arrow, enteringTile, active: false });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShiftingState({ arrow, enteringTile, active: true });
      });
    });

    window.setTimeout(() => {
      const nextBoard = board.map((row) => [...row]);
      let pushedOutTile: BoardTile;

      if (arrow.dir === 'DOWN') {
        const c = arrow.index;
        pushedOutTile = nextBoard[6][c];
        for (let r = 6; r > 0; r--) nextBoard[r][c] = nextBoard[r - 1][c];
        nextBoard[0][c] = enteringTile;
      } else if (arrow.dir === 'UP') {
        const c = arrow.index;
        pushedOutTile = nextBoard[0][c];
        for (let r = 0; r < 6; r++) nextBoard[r][c] = nextBoard[r + 1][c];
        nextBoard[6][c] = enteringTile;
      } else if (arrow.dir === 'RIGHT') {
        const r = arrow.index;
        pushedOutTile = nextBoard[r][6];
        for (let c = 6; c > 0; c--) nextBoard[r][c] = nextBoard[r][c - 1];
        nextBoard[r][0] = enteringTile;
      } else {
        const r = arrow.index;
        pushedOutTile = nextBoard[r][0];
        for (let c = 0; c < 6; c++) nextBoard[r][c] = nextBoard[r][c + 1];
        nextBoard[r][6] = enteringTile;
      }

      const updatedPlayers = players.map((p) => {
        let { row, col } = p;
        if (arrow.dir === 'DOWN' && col === arrow.index) row = row === 6 ? 0 : row + 1;
        else if (arrow.dir === 'UP' && col === arrow.index) row = row === 0 ? 6 : row - 1;
        else if (arrow.dir === 'RIGHT' && row === arrow.index) col = col === 6 ? 0 : col + 1;
        else if (arrow.dir === 'LEFT' && row === arrow.index) col = col === 0 ? 6 : col - 1;
        return { ...p, row, col };
      });

      setBoard(nextBoard);
      setSpareTile(pushedOutTile);
      setPlayers(updatedPlayers);
      setShiftingState(null);
      setForbiddenArrowId(arrow.oppositeId);
      setLastPushedArrowId(arrow.id);
      setTurnPhase('MOVE');
      isAnimatingRef.current = false;

      const cheer = SHIFT_CHEERS[Math.floor(Math.random() * SHIFT_CHEERS.length)];
      speakKorean(cheer);
      showToast(`✨ ${cheer} 초록색 길 중 이동할 칸을 터치하세요!`, 'bonus');
    }, 430);
  };

  const advanceTurn = (nextPlayers: LabyrinthPlayer[]) => {
    const nextIdx = (currentPlayerIdx + 1) % nextPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    setTurnPhase('SHIFT');
    const nextPlayer = nextPlayers[nextIdx];
    const nextGoal = nextPlayer?.targetStack?.[0];
    if (nextGoal) {
      showToast(
        `👉 ${nextPlayer.name}님 차례! 먼저 붕붕 뜨는 화살표로 [${nextGoal.emoji} ${nextGoal.name}] 길을 밀어보세요!`,
        'info'
      );
    } else {
      showToast(
        `👉 ${nextPlayer.name}님 차례! 보물을 모두 모았으니 시작 모서리(🏠)로 돌아가세요!`,
        'bonus'
      );
    }
  };

  const handleSelectMoveTarget = async (targetRow: number, targetCol: number) => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (gameState !== 'PLAYING' || turnPhase !== 'MOVE' || isAnimatingRef.current) return;

    const currentPlayer = players[currentPlayerIdx];
    const reachableMap = findReachablePaths(board, currentPlayer.row, currentPlayer.col);
    const path = reachableMap.get(`${targetRow},${targetCol}`);

    if (!path) {
      showToast('🚧 길이 막혀 있어 이동할 수 없는 칸입니다!', 'info');
      return;
    }

    isAnimatingRef.current = true;

    for (let i = 1; i < path.length; i++) {
      const step = path[i];
      playSound('step');
      setPlayers((prev) =>
        prev.map((p, idx) =>
          idx === currentPlayerIdx ? { ...p, row: step.r, col: step.c } : p
        )
      );
      await new Promise((r) => setTimeout(r, 175));
    }

    const landedTile = board[targetRow]?.[targetCol];
    const targetStack = currentPlayer.targetStack || [];
    const currentTargetTreasure = targetStack[0];
    let foundTreasure = false;
    let isGameWon = false;

    const updatedPlayers = players.map((p, idx) => {
      if (idx !== currentPlayerIdx) return p;

      const nextStack = [...(p.targetStack || [])];
      const nextCollected = [...(p.collected || [])];
      const nextTurns = (p.turnsTaken || 0) + 1;

      if (
        currentTargetTreasure &&
        landedTile?.treasure &&
        landedTile.treasure.id === currentTargetTreasure.id
      ) {
        foundTreasure = true;
        nextCollected.push(currentTargetTreasure);
        nextStack.shift();
      }

      if (nextStack.length === 0 && targetRow === p.startRow && targetCol === p.startCol) {
        isGameWon = true;
      }

      return {
        ...p,
        row: targetRow,
        col: targetCol,
        targetStack: nextStack,
        collected: nextCollected,
        turnsTaken: nextTurns,
      };
    });

    if (foundTreasure) {
      setBoard((prev) =>
        prev.map((rowArr, r) =>
          rowArr.map((tile, c) =>
            r === targetRow && c === targetCol ? { ...tile, treasure: undefined } : tile
          )
        )
      );
    }

    setPlayers(updatedPlayers);
    isAnimatingRef.current = false;

    if (isGameWon) {
      const champ = updatedPlayers[currentPlayerIdx];
      setWinner(champ);
      setGameState('GAME_OVER');
      playSound('win');
      speakKorean(`원더풀! 축하합니다! ${champ.name}님이 모든 보물을 찾고 우승했습니다!`);

      // 단독 게임 명예의 전당 저장 (가장 적은 턴 수로 우승한 사람 기록)
      saveHallOfFameRecord('SOLO', {
        name: champ.name,
        scoreOrLevel: `보물 ${cardsPerPlayer}개 · 총 ${champ.turnsTaken || 1}턴 우승`,
      });
      return;
    }

    if (foundTreasure && currentTargetTreasure) {
      playSound('treasure');
      const remainingCount = updatedPlayers[currentPlayerIdx]?.targetStack?.length || 0;
      if (remainingCount === 0) {
        speakKorean(`원더풀! ${currentTargetTreasure.name} 획득! 이제 집으로 돌아가세요!`);
        showToast(
          `🎉 원더풀! [${currentTargetTreasure.emoji} ${currentTargetTreasure.name}] 획득! 이제 출발 모서리로 돌아가세요!`,
          'treasure'
        );
      } else {
        speakKorean(`원더풀! ${currentTargetTreasure.name} 보물을 찾았어요!`);
        showToast(
          `💎 원더풀! [${currentTargetTreasure.emoji} ${currentTargetTreasure.name}] 획득! (남은 보물: ${remainingCount}개)`,
          'treasure'
        );
      }
      window.setTimeout(() => advanceTurn(updatedPlayers), 1200);
    } else {
      const moveCheer = MOVE_CHEERS[Math.floor(Math.random() * MOVE_CHEERS.length)];
      speakKorean(moveCheer);
      showToast(`👣 ${moveCheer}`, 'celebrate');
      window.setTimeout(() => advanceTurn(updatedPlayers), 600);
    }
  };

  const getCellShiftStyle = (r: number, c: number): React.CSSProperties => {
    if (!shiftingState) return {};
    const { arrow, active } = shiftingState;
    const isAffected =
      ((arrow.dir === 'DOWN' || arrow.dir === 'UP') && c === arrow.index) ||
      ((arrow.dir === 'RIGHT' || arrow.dir === 'LEFT') && r === arrow.index);

    if (!isAffected) return {};
    if (!active) return { transform: 'translate(0px, 0px)', transition: 'none', zIndex: 8 };

    let tx = '0%';
    let ty = '0%';
    if (arrow.dir === 'DOWN') ty = 'calc(100% + 4px)';
    if (arrow.dir === 'UP') ty = 'calc(-100% - 4px)';
    if (arrow.dir === 'RIGHT') tx = 'calc(100% + 4px)';
    if (arrow.dir === 'LEFT') tx = 'calc(-100% - 4px)';

    return {
      transform: `translate(${tx}, ${ty})`,
      transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
      zIndex: 8,
    };
  };

  const getEnteringTileStyle = (r: number, c: number): React.CSSProperties | null => {
    if (!shiftingState) return null;
    const { arrow, active } = shiftingState;
    const isEntryCell =
      (arrow.dir === 'DOWN' && r === 0 && c === arrow.index) ||
      (arrow.dir === 'UP' && r === 6 && c === arrow.index) ||
      (arrow.dir === 'RIGHT' && r === arrow.index && c === 0) ||
      (arrow.dir === 'LEFT' && r === arrow.index && c === 6);

    if (!isEntryCell) return null;
    let startTx = '0%';
    let startTy = '0%';
    if (arrow.dir === 'DOWN') startTy = 'calc(-100% - 4px)';
    if (arrow.dir === 'UP') startTy = 'calc(100% + 4px)';
    if (arrow.dir === 'RIGHT') startTx = 'calc(-100% - 4px)';
    if (arrow.dir === 'LEFT') startTx = 'calc(100% + 4px)';

    if (!active) return { transform: `translate(${startTx}, ${startTy})`, transition: 'none' };
    return {
      transform: 'translate(0%, 0%)',
      transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
    };
  };

  const renderTileGraphic = (
    tile: BoardTile,
    activePlayersList: LabyrinthPlayer[],
    activePlayer: LabyrinthPlayer | undefined,
    isPlayingNow: boolean,
    isSpare = false
  ) => {
    const [top, right, bottom, left] = getOpenDirections(tile.shape, tile.rotation);
    const currentGoal = activePlayer?.targetStack?.[0];
    const isMyCurrentGoal =
      isPlayingNow &&
      tile.treasure &&
      currentGoal &&
      tile.treasure.id === currentGoal.id;

    return (
      <div
        className={`maze-tile variant-${tile.stoneVariant} ${
          tile.fixed ? 'fixed-tile' : 'movable-tile'
        } ${isSpare ? 'spare-preview-tile' : ''}`}
      >
        <svg viewBox="0 0 100 100" className="tile-path-svg">
          <defs>
            <linearGradient id={`roadGrad-${tile.uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="55%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#fcd34d" />
            </linearGradient>
          </defs>

          <rect x="3" y="3" width="25" height="25" rx="4" fill="rgba(15, 23, 42, 0.32)" />
          <rect x="72" y="3" width="25" height="25" rx="4" fill="rgba(15, 23, 42, 0.32)" />
          <rect x="3" y="72" width="25" height="25" rx="4" fill="rgba(15, 23, 42, 0.32)" />
          <rect x="72" y="72" width="25" height="25" rx="4" fill="rgba(15, 23, 42, 0.32)" />

          <rect x="31" y="31" width="38" height="38" rx="6" fill={`url(#roadGrad-${tile.uid})`} />

          {top && <rect x="31" y="0" width="38" height="50" fill={`url(#roadGrad-${tile.uid})`} />}
          {bottom && <rect x="31" y="50" width="38" height="50" fill={`url(#roadGrad-${tile.uid})`} />}
          {left && <rect x="0" y="31" width="50" height="38" fill={`url(#roadGrad-${tile.uid})`} />}
          {right && <rect x="50" y="31" width="50" height="38" fill={`url(#roadGrad-${tile.uid})`} />}

          {top && (
            <>
              <line x1="31" y1="0" x2="31" y2="31" stroke="#b45309" strokeWidth="3" />
              <line x1="69" y1="0" x2="69" y2="31" stroke="#b45309" strokeWidth="3" />
            </>
          )}
          {bottom && (
            <>
              <line x1="31" y1="69" x2="31" y2="100" stroke="#b45309" strokeWidth="3" />
              <line x1="69" y1="69" x2="69" y2="100" stroke="#b45309" strokeWidth="3" />
            </>
          )}
          {left && (
            <>
              <line x1="0" y1="31" x2="31" y2="31" stroke="#b45309" strokeWidth="3" />
              <line x1="0" y1="69" x2="31" y2="69" stroke="#b45309" strokeWidth="3" />
            </>
          )}
          {right && (
            <>
              <line x1="69" y1="31" x2="100" y2="31" stroke="#b45309" strokeWidth="3" />
              <line x1="69" y1="69" x2="100" y2="69" stroke="#b45309" strokeWidth="3" />
            </>
          )}
        </svg>

        {tile.fixed && <span className="fixed-rivet" title="고정 석판" />}

        {tile.startCornerOf !== undefined && activePlayersList?.[tile.startCornerOf] && (
          <div
            className="corner-home-badge"
            style={{ backgroundColor: activePlayersList[tile.startCornerOf].color }}
            title={`${activePlayersList[tile.startCornerOf].name}의 출발/복귀 성문`}
          >
            🏠
          </div>
        )}

        {tile.treasure && (
          <div className={`treasure-token ${isMyCurrentGoal ? 'active-goal-token' : ''}`}>
            <span className="treasure-emoji-big">{tile.treasure.emoji}</span>
          </div>
        )}
      </div>
    );
  };

  const topArrows: PushArrow[] = [1, 3, 5].map((idx) => ({
    id: `DOWN-${idx}`,
    dir: 'DOWN',
    index: idx,
    oppositeId: `UP-${idx}`,
  }));
  const bottomArrows: PushArrow[] = [1, 3, 5].map((idx) => ({
    id: `UP-${idx}`,
    dir: 'UP',
    index: idx,
    oppositeId: `DOWN-${idx}`,
  }));
  const leftArrows: PushArrow[] = [1, 3, 5].map((idx) => ({
    id: `RIGHT-${idx}`,
    dir: 'RIGHT',
    index: idx,
    oppositeId: `LEFT-${idx}`,
  }));
  const rightArrows: PushArrow[] = [1, 3, 5].map((idx) => ({
    id: `LEFT-${idx}`,
    dir: 'LEFT',
    index: idx,
    oppositeId: `RIGHT-${idx}`,
  }));

  if (appMode === 'HOME') {
    return (
      <div className="lab-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🏰</div>
          <h1 className="setup-title">어메이징 라비린스</h1>
          <p className="home-subtitle">움직이는 고대 미로 속에서 성경의 보물을 찾아라!</p>

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
              <span className="mode-desc">한 기기에서 2~4명이 함께 플레이</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 방 실시간 대전 & 5레벨 도전</span>
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

  // 🏅 명예의 전당 화면 (단독 / 넷플레이 각각 10명)
  if (appMode === 'HALL_OF_FAME') {
    const soloRecords = getHallOfFameRecords('SOLO');
    const netRecords = getHallOfFameRecords('NET');

    return (
      <div className="lab-container" style={{ background: PLAYER_BG_COLORS[0], padding: '16px' }}>
        <div className="setup-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAppMode('HOME')}
            >
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, color: '#0f172a' }}>🏅 명예의 전당</h2>
            <div style={{ width: '60px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            {/* 단독 플레이 명예의 전당 */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#1e3a8a', textAlign: 'center' }}>
                🎮 단독 플레이 TOP 10
              </h3>
              {soloRecords.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>기록이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {soloRecords.map((rec, i) => (
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <span><strong>{i + 1}. {rec.name}</strong></span>
                      <span style={{ color: '#059669' }}>{rec.scoreOrLevel}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 넷플레이 명예의 전당 */}
            <div style={{ background: '#f8fafc', padding: '12px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 8px', fontSize: '15px', color: '#b45309', textAlign: 'center' }}>
                🌐 넷플레이 TOP 10
              </h3>
              {netRecords.length === 0 ? (
                <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px' }}>기록이 없습니다.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {netRecords.map((rec, i) => (
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
                      <span><strong>{i + 1}. {rec.name}</strong></span>
                      <span style={{ color: '#d97706' }}>{rec.scoreOrLevel}</span>
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

  if (appMode === 'NET_LOBBY') {
    return (
      <div className="lab-container" style={{ background: PLAYER_BG_COLORS[0] }}>
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
              🌐 넷게임 대기실 (방 4개)
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
              const isEmpty = room.status === 'EMPTY' || roomPlayers.length === 0;
              const isWaiting = room.status === 'WAITING' && roomPlayers.length > 0;
              const isPlaying = room.status === 'PLAYING' || room.status === 'LEVEL_CLEAR';
              const isFull = roomPlayers.length >= 4;

              let statusBadgeText = '🟢 빈방';
              let statusClass = 'empty';
              if (isPlaying) {
                statusBadgeText = `🔥 게임중 (Lv.${room.level}/5)`;
                statusClass = 'playing';
              } else if (isWaiting) {
                statusBadgeText = isFull
                  ? `🟠 대기중 (만석 4/4)`
                  : `🟡 대기중 (${roomPlayers.length}/4명)`;
                statusClass = 'waiting';
              }

              return (
                <div
                  key={room.roomId}
                  className={`net-room-card ${statusClass}`}
                  onClick={() => {
                    if (
                      roomPlayers.some((p) => p.id === mySessionId) ||
                      roomWaitlist.some((w) => w.id === mySessionId)
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
                    <span className="room-number-title">🏰 제 {room.roomId} 탐험방</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>💎 기본 보물: {room.baseCards}개</span>
                    <span>⏱️ 기본 제한시간: {room.baseTimeout}초</span>
                  </div>

                  <div className="room-members-box">
                    <div className="room-members-label">참가자 ({roomPlayers.length}/4):</div>
                    <div className="room-members-chips">
                      {roomPlayers.length === 0 ? (
                        <span className="empty-member-text">첫 번째 탐험가를 기다리고 있습니다</span>
                      ) : (
                        roomPlayers.map((p, idx) => (
                          <span
                            key={p.id}
                            className="member-chip"
                            style={{ borderColor: PIECE_COLORS[idx] }}
                          >
                            <i style={{ backgroundColor: PIECE_COLORS[idx] }} />
                            {p.name}
                          </span>
                        ))
                      )}
                    </div>
                  </div>

                  {roomWaitlist.length > 0 && (
                    <div className="room-waitlist-box">
                      ⏳ 다음 레벨 예약 ({roomWaitlist.length}명):{' '}
                      {roomWaitlist.map((w) => w.name).join(', ')}
                    </div>
                  )}

                  <div className="room-enter-cta">
                    {isEmpty
                      ? '👉 클릭하여 방 만들기 (카드수·시간 설정)'
                      : isPlaying || isFull
                      ? '⏳ 클릭하여 이름 입력 후 다음 레벨 예약하기'
                      : '👉 클릭하여 이름 입력 후 바로 참가하기'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {joinModalRoom && (
          <div className="modal-overlay" onClick={() => setJoinModalRoom(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 8px' }}>🏰 제 {joinModalRoom.roomId} 탐험방 입장</h2>
              <p className="modal-subtext">
                {joinModalRoom.status === 'PLAYING' ||
                joinModalRoom.status === 'LEVEL_CLEAR' ||
                (joinModalRoom.players || []).length >= 4
                  ? '현재 게임 중이거나 인원이 가득 차서 다음 레벨 예약자로 등록됩니다.'
                  : '탐험에 사용할 이름을 입력해주세요.'}
              </p>

              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력 (예: 다윗)"
                value={joinPlayerName}
                autoFocus
                onChange={(e) => setJoinPlayerName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleEnterRoomSubmit()}
              />

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => setJoinModalRoom(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 2 }}
                  onClick={handleEnterRoomSubmit}
                >
                  {joinModalRoom.status === 'PLAYING' ||
                  joinModalRoom.status === 'LEVEL_CLEAR' ||
                  (joinModalRoom.players || []).length >= 4
                    ? '⏳ 예약 등록하기'
                    : '🚀 방 입장하기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (appMode === 'NET_ROOM') {
    if (!activeNetRoom) {
      return (
        <div className="lab-container" style={{ background: PLAYER_BG_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="setup-card" style={{ textAlign: 'center' }}>
            <h2>⏳ 방 정보를 불러오는 중입니다...</h2>
            <button type="button" className="btn btn-secondary" style={{ marginTop: '12px' }} onClick={() => setAppMode('NET_LOBBY')}>
              ⬅️ 로비로 돌아가기
            </button>
          </div>
        </div>
      );
    }

    const roomPlayers = activeNetRoom.players || [];
    const roomWaitlist = activeNetRoom.waitlist || [];
    const isHost = roomPlayers[0]?.id === mySessionId;
    const amIWaitlisted = roomWaitlist.some((w) => w.id === mySessionId);
    const amIPlaying = roomPlayers.some((p) => p.id === mySessionId);

    if (activeNetRoom.status === 'WAITING' || activeNetRoom.status === 'EMPTY') {
      return (
        <div className="lab-container" style={{ background: PLAYER_BG_COLORS[0] }}>
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
                제 {activeNetRoom.roomId}방 · 대기중 ({roomPlayers.length}/4명)
              </span>
            </div>

            <h1 className="setup-title" style={{ marginTop: '14px' }}>
              🏰 넷게임 대기실 (총 5레벨 도전)
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                💎 시작 보물 카드 수 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector">
                {[2, 3, 4, 5].map((num) => (
                  <button
                    key={num}
                    type="button"
                    disabled={!isHost}
                    className={`count-btn ${activeNetRoom.baseCards === num ? 'active' : ''}`}
                    onClick={() => updateRoomSettings(num, activeNetRoom.baseTimeout)}
                  >
                    {num}개
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 기본 턴 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong> (15~100초 ·
                레벨당 10초씩 단축)
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>15초</span>
                <input
                  type="range"
                  min={15}
                  max={100}
                  step={5}
                  disabled={!isHost}
                  value={activeNetRoom.baseTimeout}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    updateRoomSettings(activeNetRoom.baseCards, Number(e.target.value))
                  }
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>100초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🧭 입장한 탐험가 (2~4명)</label>
              <div className="player-list">
                {roomPlayers.map((p, idx) => (
                  <div key={p.id} className="player-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        className="squircle-dot"
                        style={{ backgroundColor: PIECE_COLORS[idx] }}
                      >
                        {getShortName(p.name)}
                      </span>
                      {p.name} {idx === 0 && '👑(방장)'} {p.id === mySessionId && '(나)'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#059669' }}>준비완료</span>
                  </div>
                ))}
              </div>
            </div>

            {isHost ? (
              <button
                type="button"
                className="btn btn-success"
                disabled={roomPlayers.length < 2}
                onClick={handleStartNetGameFromLobby}
              >
                🚀 레벨 1 게임 시작하기 ({roomPlayers.length}/4명)
              </button>
            ) : (
              <div className="waiting-host-banner">
                ⏳ 방장({roomPlayers[0]?.name || '방장'})님이 시작 버튼을 누르면 게임이 시작됩니다!
              </div>
            )}
          </div>
        </div>
      );
    }

    let netBoard: BoardTile[][] = [[]];
    try {
      netBoard = JSON.parse(activeNetRoom.boardFlat || '[[]]');
    } catch {
      netBoard = [[]];
    }

    const netCurrIdx = activeNetRoom.currentPlayerIdx || 0;
    const netCurrPlayer = roomPlayers[netCurrIdx];
    const isMyTurn = netCurrPlayer?.id === mySessionId;
    const isNetShiftPhase = activeNetRoom.turnPhase === 'SHIFT' && isMyTurn;
    const isNetMovePhase = activeNetRoom.turnPhase === 'MOVE' && isMyTurn;

    const netReachableCells =
      activeNetRoom.status === 'PLAYING' &&
      activeNetRoom.turnPhase === 'MOVE' &&
      netCurrPlayer &&
      netBoard.length > 0
        ? findReachablePaths(netBoard, netCurrPlayer.row, netCurrPlayer.col)
        : new Map<string, { r: number; c: number }[]>();

    const levelCards = getLevelCardCount(activeNetRoom.baseCards, activeNetRoom.level);
    const levelWinner = roomPlayers.find((p) => p.id === activeNetRoom.levelWinnerId);
    const amILevelWinner = activeNetRoom.levelWinnerId === mySessionId;

    return (
      <div
        className="lab-container"
        style={{
          background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length],
        }}
        onPointerUp={endLongPressPeek}
        onPointerCancel={endLongPressPeek}
      >
        {toast && (
          <div key={toast.id} className={`lab-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">Lv.{activeNetRoom.level}/5</span>
              <span className={`net-timer-badge ${remainingSeconds <= 7 ? 'urgent' : ''}`}>
                ⏱️ {remainingSeconds}초
              </span>
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p, idx) => {
                const isActive = idx === netCurrIdx;
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
                      <strong>
                        {p.name}
                        {p.id === mySessionId ? '(나)' : ''}
                      </strong>
                      <span className="badge-score">
                        {(p.collected || []).length}/{levelCards}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-compact-setup"
              onClick={handleLeaveNetRoom}
              title="방 나가기"
            >
              🚪
            </button>
          </div>

          {(amIWaitlisted || roomWaitlist.length > 0) && (
            <div className="net-waitlist-strip">
              {amIWaitlisted
                ? '⏳ 현재 다음 레벨 예약 대기 중입니다! 이번 레벨이 끝나면 자동으로 참가됩니다.'
                : `⏳ 다음 레벨 예약자 (${roomWaitlist.length}명): ${roomWaitlist
                    .map((w) => w.name)
                    .join(', ')}`}
            </div>
          )}

          {netBoard.length > 0 && activeNetRoom.spareTile && (
            <div className="maze-board-outer">
              <div className="maze-ancient-crest">
                {activeNetRoom.lastActionNotice ||
                  `⚜️ 제 ${activeNetRoom.roomId}방 · 레벨 ${activeNetRoom.level} ⚜️`}
              </div>

              <div className="arrow-row-horizontal">
                <div className="corner-compass">🧭</div>
                {Array.from({ length: 7 }).map((_, c) => {
                  const arrow = topArrows.find((a) => a.index === c);
                  if (!arrow) return <div key={`top-empty-${c}`} className="arrow-cell empty" />;
                  const disabled =
                    !isMyTurn ||
                    activeNetRoom.turnPhase !== 'SHIFT' ||
                    arrow.id === activeNetRoom.forbiddenArrowId;
                  return (
                    <button
                      key={arrow.id}
                      type="button"
                      disabled={disabled}
                      className={`push-arrow-btn ${
                        !disabled && isNetShiftPhase ? 'guide-float-arrow' : ''
                      } ${activeNetRoom.lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                      onClick={() => handleNetPushTile(arrow)}
                    >
                      ▼
                    </button>
                  );
                })}
                <div className="corner-compass">⚜️</div>
              </div>

              <div className="maze-middle-band">
                <div className="arrow-col-vertical">
                  {Array.from({ length: 7 }).map((_, r) => {
                    const arrow = leftArrows.find((a) => a.index === r);
                    if (!arrow) return <div key={`left-empty-${r}`} className="arrow-cell empty" />;
                    const disabled =
                      !isMyTurn ||
                      activeNetRoom.turnPhase !== 'SHIFT' ||
                      arrow.id === activeNetRoom.forbiddenArrowId;
                    return (
                      <button
                        key={arrow.id}
                        type="button"
                        disabled={disabled}
                        className={`push-arrow-btn ${
                          !disabled && isNetShiftPhase ? 'guide-float-arrow' : ''
                        } ${activeNetRoom.lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                        onClick={() => handleNetPushTile(arrow)}
                      >
                        ▶
                      </button>
                    );
                  })}
                </div>

                <div className="maze-grid-7x7">
                  {netBoard.map((rowArr, r) =>
                    rowArr.map((tile, c) => {
                      const cellKey = `${r},${c}`;
                      const isReachable =
                        activeNetRoom.status === 'PLAYING' &&
                        activeNetRoom.turnPhase === 'MOVE' &&
                        netReachableCells.has(cellKey);
                      const piecesHere = roomPlayers.filter(
                        (p) => p.row === r && p.col === c
                      );
                      const activePieceHere = piecesHere.find((p) => p.id === netCurrPlayer?.id);
                      const otherPiecesHere = piecesHere.filter((p) => p.id !== netCurrPlayer?.id);
                      const hasMultiplePieces = piecesHere.length > 1;

                      return (
                        <div
                          key={tile?.uid || `${r}-${c}`}
                          className={`maze-cell-slot ${isReachable ? 'reachable-cell' : ''}`}
                          onPointerDown={() => {
                            if (piecesHere.length > 0) startLongPressPeek();
                          }}
                          onPointerUp={endLongPressPeek}
                          onPointerLeave={endLongPressPeek}
                          onClick={() => {
                            if (activeNetRoom.turnPhase === 'MOVE') {
                              handleNetSelectMoveTarget(r, c);
                            }
                          }}
                        >
                          <div className="tile-slide-layer">
                            {tile && renderTileGraphic(
                              tile,
                              roomPlayers,
                              netCurrPlayer,
                              true,
                              false
                            )}

                            {piecesHere.length > 0 && (
                              <div
                                className={`cell-pieces-cluster ${
                                  hasMultiplePieces ? 'multi-pieces' : 'single-piece'
                                } ${isPeekingRoad ? 'peeking-transparent' : ''}`}
                              >
                                {activePieceHere && (
                                  <div
                                    className={`explorer-squircle-pawn active-turn-pawn ${
                                      hasMultiplePieces ? 'stacked-main' : ''
                                    } ${isNetMovePhase ? 'guide-float-pawn' : ''}`}
                                    style={{ backgroundColor: activePieceHere.color }}
                                  >
                                    <span className="pawn-name-tag">
                                      {getShortName(activePieceHere.name)}
                                    </span>
                                  </div>
                                )}

                                {otherPiecesHere.length > 0 && (
                                  <div
                                    className={`other-pawns-dock ${
                                      activePieceHere ? 'with-active-above' : 'without-active'
                                    }`}
                                  >
                                    {otherPiecesHere.map((p) => (
                                      <div
                                        key={p.id}
                                        className="explorer-squircle-pawn mini-other-pawn"
                                        style={{ backgroundColor: p.color }}
                                      >
                                        <span className="pawn-name-tag mini">
                                          {getShortName(p.name)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="arrow-col-vertical">
                  {Array.from({ length: 7 }).map((_, r) => {
                    const arrow = rightArrows.find((a) => a.index === r);
                    if (!arrow) return <div key={`right-empty-${r}`} className="arrow-cell empty" />;
                    const disabled =
                      !isMyTurn ||
                      activeNetRoom.turnPhase !== 'SHIFT' ||
                      arrow.id === activeNetRoom.forbiddenArrowId;
                    return (
                      <button
                        key={arrow.id}
                        type="button"
                        disabled={disabled}
                        className={`push-arrow-btn ${
                          !disabled && isNetShiftPhase ? 'guide-float-arrow' : ''
                        } ${activeNetRoom.lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                        onClick={() => handleNetPushTile(arrow)}
                      >
                        ◀
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="arrow-row-horizontal">
                <div className="corner-compass">⚜️</div>
                {Array.from({ length: 7 }).map((_, c) => {
                  const arrow = bottomArrows.find((a) => a.index === c);
                  if (!arrow) return <div key={`bot-empty-${c}`} className="arrow-cell empty" />;
                  const disabled =
                    !isMyTurn ||
                    activeNetRoom.turnPhase !== 'SHIFT' ||
                    arrow.id === activeNetRoom.forbiddenArrowId;
                  return (
                    <button
                      key={arrow.id}
                      type="button"
                      disabled={disabled}
                      className={`push-arrow-btn ${
                        !disabled && isNetShiftPhase ? 'guide-float-arrow' : ''
                      } ${activeNetRoom.lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                      onClick={() => handleNetPushTile(arrow)}
                    >
                      ▲
                    </button>
                  );
                })}
                <div className="corner-compass">🧭</div>
              </div>
            </div>
          )}

          {activeNetRoom.spareTile && netCurrPlayer && (
            <div
              className="bottom-compact-dock"
              style={{ borderTop: `4px solid ${netCurrPlayer.color}` }}
            >
              <div
                className={`dock-left-rotate-card ${
                  isNetShiftPhase ? 'guide-float-spare-box' : ''
                }`}
              >
                <div className="dock-sub-label">
                  {isNetShiftPhase ? '👆 여분 길카드' : '🧩 여분 길카드'}
                </div>
                <div className="dock-rotate-body">
                  <div
                    className={`mini-spare-tile-box ${
                      isNetShiftPhase ? 'guide-float-tile' : ''
                    }`}
                    onClick={() => handleNetRotateSpare(1)}
                  >
                    {renderTileGraphic(
                      activeNetRoom.spareTile,
                      roomPlayers,
                      netCurrPlayer,
                      true,
                      true
                    )}
                  </div>
                  <div className="mini-rotate-buttons">
                    <button
                      type="button"
                      className="btn-mini-rot"
                      disabled={!isNetShiftPhase}
                      onClick={() => handleNetRotateSpare(-1)}
                    >
                      ↺ 좌회전
                    </button>
                    <button
                      type="button"
                      className="btn-mini-rot primary"
                      disabled={!isNetShiftPhase}
                      onClick={() => handleNetRotateSpare(1)}
                    >
                      ↻ 우회전
                    </button>
                  </div>
                </div>
              </div>

              <div className="dock-right-info-card">
                <div className="dock-info-top-row">
                  <span
                    className="turn-owner-pill"
                    style={{ backgroundColor: netCurrPlayer.color }}
                  >
                    {netCurrPlayer.name} {isMyTurn ? '(내 차례!)' : '(진행 중)'}
                  </span>
                  <span className="step-status-badge">
                    {!isMyTurn
                      ? `${netCurrPlayer.name}님의 선택을 기다리는 중...`
                      : activeNetRoom.turnPhase === 'SHIFT'
                      ? '1단계: 화살표를 눌러 길 밀기'
                      : '2단계: 초록색 길 터치 이동'}
                  </span>
                </div>

                {(() => {
                  const myPlayerObj = roomPlayers.find((p) => p.id === mySessionId);
                  const displayOwner = myPlayerObj || netCurrPlayer;
                  const displayTarget = displayOwner?.targetStack?.[0] || null;
                  const collectedArr = displayOwner?.collected || [];

                  return (
                    <div className="dock-goal-and-bag">
                      <div className="dock-goal-box">
                        {displayTarget ? (
                          <>
                            <span className="dock-goal-emoji">{displayTarget.emoji}</span>
                            <div className="dock-goal-texts">
                              <span className="dock-goal-caption">
                                {myPlayerObj ? '내가 찾을 보물' : `${displayOwner.name}의 목표`}
                              </span>
                              <strong className="dock-goal-name">{displayTarget.name}</strong>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="dock-goal-emoji">🏠</span>
                            <div className="dock-goal-texts">
                              <span className="dock-goal-caption">수집 완료!</span>
                              <strong className="dock-goal-name">시작 성문 복귀</strong>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="dock-bag-box">
                        <span className="dock-bag-title">
                          획득 보물 ({collectedArr.length}/{levelCards})
                        </span>
                        <div className="dock-bag-icons">
                          {collectedArr.length === 0 ? (
                            <span className="dock-bag-empty">없음</span>
                          ) : (
                            collectedArr.map((item) => (
                              <span key={item.id} className="bag-emoji-badge">
                                {item.emoji}
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}
        </div>

        {activeNetRoom.status === 'LEVEL_CLEAR' && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-trophy">👑🏆👑</div>
              <div className="congrats-banner">
                LEVEL {activeNetRoom.level} / 5 CLEAR!
              </div>
              <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
                {levelWinner ? `${levelWinner.name}님 1등 우승!` : '레벨 종료!'}
              </h2>

              <p className="modal-subtext">
                {activeNetRoom.level >= 5
                  ? '축하합니다! 최종 5레벨까지 모든 미로 탐험을 마쳤습니다!'
                  : roomPlayers.length + roomWaitlist.length > 4
                  ? '예약 인원이 정원(4명)을 초과하여 1등을 제외한 인원은 교체되고 예약자가 합류합니다!'
                  : '다음 레벨에서는 보물이 늘어나고 제한시간이 10초 단축됩니다!'}
              </p>

              <div className="rank-list">
                {roomPlayers.map((p) => {
                  const isChamp = p.id === activeNetRoom.levelWinnerId;
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
                        {(p.collected || []).length} / {levelCards}개 ({p.turnsTaken || 0}턴)
                      </span>
                    </div>
                  );
                })}
              </div>

              {roomWaitlist.length > 0 && activeNetRoom.level < 5 && (
                <div
                  style={{
                    background: '#eff6ff',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#1d4ed8',
                    marginBottom: '14px',
                  }}
                >
                  ⏳ 합류 대기 예약자: {roomWaitlist.map((w) => w.name).join(', ')}
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                {(amILevelWinner || !amIPlaying) && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    onClick={handleLeaveNetRoom}
                  >
                    🚪 방 나가기
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-success"
                  style={{ flex: 2 }}
                  onClick={handleAdvanceToNextLevel}
                >
                  {activeNetRoom.level >= 5
                    ? '🏁 방 종료하고 로비로'
                    : `🔥 레벨 ${activeNetRoom.level + 1} 시작하기`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const currentPlayer = players[currentPlayerIdx];
  const currentTarget = currentPlayer?.targetStack?.[0] || null;

  const reachableCells =
    gameState === 'PLAYING' && turnPhase === 'MOVE' && currentPlayer && board.length > 0
      ? findReachablePaths(board, currentPlayer.row, currentPlayer.col)
      : new Map<string, { r: number; c: number }[]>();

  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  const isShiftPhase = turnPhase === 'SHIFT' && !shiftingState;
  const isMovePhase = turnPhase === 'MOVE' && !shiftingState;

  return (
    <div
      className="lab-container"
      style={{ background: currentBackground }}
      onPointerUp={endLongPressPeek}
      onPointerCancel={endLongPressPeek}
    >
      {toast && gameState === 'PLAYING' && (
        <div key={toast.id} className={`lab-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {gameState === 'SETUP' && (
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
          <h1 className="setup-title">🏰 어메이징 라비린스 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">💎 1인당 찾을 보물 개수</label>
            <div className="piece-count-selector">
              {[3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`count-btn ${cardsPerPlayer === num ? 'active' : ''}`}
                  onClick={() => setCardsPerPlayer(num)}
                >
                  {num}개
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">
              🧭 탐험가 등록 (2~4명 · 이름 첫 두 글자가 말에 표시됩니다)
            </label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="탐험가 이름 입력 후 추가"
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
                    {player.name}
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
            <strong>📜 보물찾기 길잡이:</strong>
            <ul>
              <li>
                1단계(길 밀기): 붕붕 뜨는 여분 길카드를 회전하고, 붕붕 뜨는 화살표를 눌러 길을
                밉니다.
              </li>
              <li>
                2단계(이동): 붕붕 뜨는 내 말을 확인하고 초록색으로 열린 길을 터치해 이동합니다.
              </li>
              <li>💡 팁: 말을 길게 꾹 누르면 말이 투명해져 뒤에 숨은 길 모양을 볼 수 있어요!</li>
            </ul>
          </div>

          <button
            type="button"
            className="btn btn-success"
            disabled={players.length < 2}
            onClick={goToMainReady}
          >
            ➡️ 순서 정하러 가기 ({players.length}명)
          </button>
        </div>
      )}

      {gameState === 'READY' && (
        <div className="order-panel">
          <div className="order-header">
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 탐험가 진행 순서를 정해주세요</h2>
            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 14px', fontSize: '13px' }}
              onClick={shufflePlayersOrder}
            >
              🎲 순서 랜덤 섞기
            </button>
          </div>

          <div className="order-list">
            {players.map((player, idx) => (
              <div key={player.id} className="order-item">
                <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <strong style={{ color: '#2563eb' }}>{idx + 1}번째</strong>
                  <span
                    className="squircle-dot"
                    style={{ backgroundColor: PIECE_COLORS[idx % PIECE_COLORS.length] }}
                  >
                    {getShortName(player.name)}
                  </span>
                  {player.name}
                </span>
                <div className="order-controls">
                  <button
                    type="button"
                    className="order-btn"
                    disabled={idx === 0}
                    onClick={() => movePlayerOrder(idx, 'UP')}
                  >
                    ▲
                  </button>
                  <button
                    type="button"
                    className="order-btn"
                    disabled={idx === players.length - 1}
                    onClick={() => movePlayerOrder(idx, 'DOWN')}
                  >
                    ▼
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setGameState('SETUP')}
            >
              ⬅️ 설정으로
            </button>
            <button type="button" className="btn btn-success" onClick={startGame}>
              🚀 미로 탐험 시작! (1인당 {cardsPerPlayer}개 보물)
            </button>
          </div>
        </div>
      )}

      {gameState === 'PLAYING' && currentPlayer && spareTile && (
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
                      <span className="badge-score">
                        {(p.collected || []).length}/{cardsPerPlayer}
                      </span>
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

          <div className="maze-board-outer">
            <div className="maze-ancient-crest">
              {isPeekingRoad
                ? '👁️ 뒷길 투시 중 (손을 떼면 말이 다시 보입니다)'
                : '⚜️ AMAZING LABYRINTH · 말을 꾹 누르면 뒷길 확인 ⚜️'}
            </div>

            <div className="arrow-row-horizontal">
              <div className="corner-compass">🧭</div>
              {Array.from({ length: 7 }).map((_, c) => {
                const arrow = topArrows.find((a) => a.index === c);
                if (!arrow) return <div key={`top-empty-${c}`} className="arrow-cell empty" />;
                const disabled =
                  turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId || !!shiftingState;
                return (
                  <button
                    key={arrow.id}
                    type="button"
                    disabled={disabled}
                    className={`push-arrow-btn ${
                      !disabled && isShiftPhase ? 'guide-float-arrow' : ''
                    } ${lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                    onClick={() => handlePushTile(arrow)}
                  >
                    ▼
                  </button>
                );
              })}
              <div className="corner-compass">⚜️</div>
            </div>

            <div className="maze-middle-band">
              <div className="arrow-col-vertical">
                {Array.from({ length: 7 }).map((_, r) => {
                  const arrow = leftArrows.find((a) => a.index === r);
                  if (!arrow) return <div key={`left-empty-${r}`} className="arrow-cell empty" />;
                  const disabled =
                    turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId || !!shiftingState;
                  return (
                    <button
                      key={arrow.id}
                      type="button"
                      disabled={disabled}
                      className={`push-arrow-btn ${
                        !disabled && isShiftPhase ? 'guide-float-arrow' : ''
                      } ${lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                      onClick={() => handlePushTile(arrow)}
                    >
                      ▶
                    </button>
                  );
                })}
              </div>

              <div className="maze-grid-7x7">
                {board.map((rowArr, r) =>
                  rowArr.map((tile, c) => {
                    const cellKey = `${r},${c}`;
                    const isReachable =
                      turnPhase === 'MOVE' && !shiftingState && reachableCells.has(cellKey);
                    const isCurrentPos = currentPlayer.row === r && currentPlayer.col === c;
                    const piecesHere = players.filter((p) => p.row === r && p.col === c);

                    const activePieceHere = piecesHere.find((p) => p.id === currentPlayer.id);
                    const otherPiecesHere = piecesHere.filter((p) => p.id !== currentPlayer.id);
                    const hasMultiplePieces = piecesHere.length > 1;

                    const shiftStyle = getCellShiftStyle(r, c);
                    const enteringStyle = getEnteringTileStyle(r, c);

                    return (
                      <div
                        key={tile?.uid || `${r}-${c}`}
                        className={`maze-cell-slot ${isReachable ? 'reachable-cell' : ''} ${
                          isCurrentPos ? 'current-player-cell' : ''
                        }`}
                        onPointerDown={() => {
                          if (piecesHere.length > 0) startLongPressPeek();
                        }}
                        onPointerUp={endLongPressPeek}
                        onPointerLeave={endLongPressPeek}
                        onContextMenu={(e) => {
                          if (piecesHere.length > 0) e.preventDefault();
                        }}
                        onClick={() => {
                          if (turnPhase === 'MOVE' && !shiftingState) {
                            handleSelectMoveTarget(r, c);
                          }
                        }}
                      >
                        <div className="tile-slide-layer" style={shiftStyle}>
                          {tile && renderTileGraphic(tile, players, currentPlayer, true, false)}

                          {piecesHere.length > 0 && (
                            <div
                              className={`cell-pieces-cluster ${
                                hasMultiplePieces ? 'multi-pieces' : 'single-piece'
                              } ${isPeekingRoad ? 'peeking-transparent' : ''}`}
                            >
                              {activePieceHere && (
                                <div
                                  className={`explorer-squircle-pawn active-turn-pawn ${
                                    hasMultiplePieces ? 'stacked-main' : ''
                                  } ${isMovePhase ? 'guide-float-pawn' : ''}`}
                                  style={{ backgroundColor: activePieceHere.color }}
                                >
                                  <span className="pawn-name-tag">
                                    {getShortName(activePieceHere.name)}
                                  </span>
                                </div>
                              )}

                              {otherPiecesHere.length > 0 && (
                                <div
                                  className={`other-pawns-dock ${
                                    activePieceHere ? 'with-active-above' : 'without-active'
                                  }`}
                                >
                                  {otherPiecesHere.map((p) => (
                                    <div
                                      key={p.id}
                                      className="explorer-squircle-pawn mini-other-pawn"
                                      style={{ backgroundColor: p.color }}
                                    >
                                      <span className="pawn-name-tag mini">
                                        {getShortName(p.name)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {shiftingState && enteringStyle && (
                          <div className="tile-entering-layer" style={enteringStyle}>
                            {renderTileGraphic(
                              shiftingState.enteringTile,
                              players,
                              currentPlayer,
                              true,
                              false
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="arrow-col-vertical">
                {Array.from({ length: 7 }).map((_, r) => {
                  const arrow = rightArrows.find((a) => a.index === r);
                  if (!arrow) return <div key={`right-empty-${r}`} className="arrow-cell empty" />;
                  const disabled =
                    turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId || !!shiftingState;
                  return (
                    <button
                      key={arrow.id}
                      type="button"
                      disabled={disabled}
                      className={`push-arrow-btn ${
                        !disabled && isShiftPhase ? 'guide-float-arrow' : ''
                      } ${lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                      onClick={() => handlePushTile(arrow)}
                    >
                      ◀
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="arrow-row-horizontal">
              <div className="corner-compass">⚜️</div>
              {Array.from({ length: 7 }).map((_, c) => {
                const arrow = bottomArrows.find((a) => a.index === c);
                if (!arrow) return <div key={`bot-empty-${c}`} className="arrow-cell empty" />;
                const disabled =
                  turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId || !!shiftingState;
                return (
                  <button
                    key={arrow.id}
                    type="button"
                    disabled={disabled}
                    className={`push-arrow-btn ${
                      !disabled && isShiftPhase ? 'guide-float-arrow' : ''
                    } ${lastPushedArrowId === arrow.id ? 'last-pushed' : ''}`}
                    onClick={() => handlePushTile(arrow)}
                  >
                    ▲
                  </button>
                );
              })}
              <div className="corner-compass">🧭</div>
            </div>
          </div>

          <div
            className="bottom-compact-dock"
            style={{ borderTop: `4px solid ${currentPlayer.color}` }}
          >
            <div
              className={`dock-left-rotate-card ${
                isShiftPhase ? 'guide-float-spare-box' : ''
              }`}
            >
              <div className="dock-sub-label">
                {isShiftPhase ? '👆 여분 길카드' : '🧩 여분 길카드'}
              </div>
              <div className="dock-rotate-body">
                <div
                  className={`mini-spare-tile-box ${
                    isShiftPhase ? 'guide-float-tile' : ''
                  }`}
                  onClick={() => rotateSpareTile(1)}
                >
                  {renderTileGraphic(spareTile, players, currentPlayer, true, true)}
                </div>
                <div className="mini-rotate-buttons">
                  <button
                    type="button"
                    className="btn-mini-rot"
                    disabled={turnPhase !== 'SHIFT' || !!shiftingState}
                    onClick={() => rotateSpareTile(-1)}
                  >
                    ↺ 좌회전
                  </button>
                  <button
                    type="button"
                    className="btn-mini-rot primary"
                    disabled={turnPhase !== 'SHIFT' || !!shiftingState}
                    onClick={() => rotateSpareTile(1)}
                  >
                    ↻ 우회전
                  </button>
                </div>
              </div>
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
                  {turnPhase === 'SHIFT'
                    ? '1단계: 붕붕 뜨는 화살표로 길 밀기'
                    : '2단계: 초록 길 터치 이동 (말 꾹 누르면 뒷길 투시)'}
                </span>
              </div>

              <div className="dock-goal-and-bag">
                <div className="dock-goal-box">
                  {currentTarget ? (
                    <>
                      <span className="dock-goal-emoji">{currentTarget.emoji}</span>
                      <div className="dock-goal-texts">
                        <span className="dock-goal-caption">찾을 보물</span>
                        <strong className="dock-goal-name">{currentTarget.name}</strong>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="dock-goal-emoji">🏠</span>
                      <div className="dock-goal-texts">
                        <span className="dock-goal-caption">수집 완료!</span>
                        <strong className="dock-goal-name">시작 성문 복귀</strong>
                      </div>
                    </>
                  )}
                </div>

                <div className="dock-bag-box">
                  <span className="dock-bag-title">
                    획득 보물 ({(currentPlayer.collected || []).length}/{cardsPerPlayer})
                  </span>
                  <div className="dock-bag-icons">
                    {(currentPlayer.collected || []).length === 0 ? (
                      <span className="dock-bag-empty">없음</span>
                    ) : (
                      (currentPlayer.collected || []).map((item) => (
                        <span key={item.id} className="bag-emoji-badge" title={item.name}>
                          {item.emoji}
                        </span>
                      ))
                    )}
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
            <div className="congrats-banner">✨ WONDERFUL! CONGRATULATIONS! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟
            </h2>
            <p className="modal-subtext">
              보물 {cardsPerPlayer}개를 모두 찾고 무사히 미로를 탈출했습니다! (총 {winner.turnsTaken || 0}턴 소요)
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
                      획득 보물: {(p.collected || []).length}개 ({p.turnsTaken || 0}턴)
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
              <button type="button" className="btn btn-success" onClick={startGame}>
                🔄 바로 다시 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}