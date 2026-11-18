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

type TileColor = 'BLACK' | 'WHITE';

interface DaVinciTile {
  id: string;
  color: TileColor;
  value: number; // 0~11, 조커('-')는 99
  isJoker: boolean;
  revealed: boolean;
  sortKey: number; // 정렬 기준값 (조커 삽입 위치에 따라 유동적)
}

interface DaVinciPlayer {
  id: string;
  name: string;
  color: string;
  hand: DaVinciTile[];
  isEliminated: boolean;
  turnsTaken: number;
}

interface WaitlistPlayer {
  id: string;
  name: string;
}

interface SpectatorPlayer {
  id: string;
  name: string;
}

interface NetRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'PLAYING' | 'LEVEL_CLEAR';
  players: DaVinciPlayer[];
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  useJoker: boolean;
  baseTimeout: number;
  level: number;
  deck: DaVinciTile[];
  currentPlayerIdx: number;
  turnPhase: 'DRAW' | 'PLACE_JOKER' | 'GUESS' | 'DECIDE_CONTINUE';
  drawnTile: DaVinciTile | null;
  turnDeadline: number | null;
  levelWinnerId: string | null;
  lastActionNotice: string;
  consecutiveTimeouts: number;
  waitingSince?: number | null;
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

const GUESS_NUMBERS: { label: string; value: number; isJoker: boolean }[] = [
  ...Array.from({ length: 12 }, (_, i) => ({
    label: String(i),
    value: i,
    isJoker: false,
  })),
  { label: '-', value: 99, isJoker: true },
];

function getShortName(name: string): string {
  const trimmed = name ? name.trim() : '';
  return trimmed ? trimmed.slice(0, 2) : '?';
}

function getTileDisplay(tile: DaVinciTile): string {
  return tile.isJoker ? '-' : String(tile.value);
}

/**
 * 다빈치 코드 타일 정렬 함수
 * 규칙: 숫자 오름차순, 동일 숫자일 경우 검은색(BLACK)이 흰색(WHITE)보다 왼쪽
 */
function sortTiles(tiles: DaVinciTile[]): DaVinciTile[] {
  return [...tiles].sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    if (a.color !== b.color) {
      return a.color === 'BLACK' ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

/**
 * 초기 덱 생성 (검은색 0~11, 흰색 0~11, 옵션에 따라 조커 '-' 2장 포함)
 */
function createDeck(useJoker: boolean): DaVinciTile[] {
  const deck: DaVinciTile[] = [];
  const colors: TileColor[] = ['BLACK', 'WHITE'];

  colors.forEach((color) => {
    for (let v = 0; v <= 11; v++) {
      deck.push({
        id: `${color}-${v}`,
        color,
        value: v,
        isJoker: false,
        revealed: false,
        sortKey: v,
      });
    }
    if (useJoker) {
      deck.push({
        id: `${color}-JOKER`,
        color,
        value: 99,
        isJoker: true,
        revealed: false,
        sortKey: 5.5, // 초기 배분 시 중간 정렬용 기본값
      });
    }
  });

  return deck.sort(() => Math.random() - 0.5);
}

/**
 * 조커가 초기 배분된 경우 손패 내 랜덤 위치의 sortKey 부여
 */
function assignInitialHandWithRandomJoker(rawTiles: DaVinciTile[]): DaVinciTile[] {
  const normals = rawTiles.filter((t) => !t.isJoker).sort((a, b) => {
    if (a.value !== b.value) return a.value - b.value;
    return a.color === 'BLACK' ? -1 : 1;
  });
  const jokers = rawTiles.filter((t) => t.isJoker);

  if (jokers.length === 0) return sortTiles(normals);

  const result: DaVinciTile[] = [...normals];
  jokers.forEach((jk) => {
    const insertIdx = Math.floor(Math.random() * (result.length + 1));
    const prevKey = insertIdx === 0 ? -1 : result[insertIdx - 1].sortKey;
    const nextKey = insertIdx === result.length ? 12 : result[insertIdx].sortKey;
    const newSortKey = (prevKey + nextKey) / 2;
    result.splice(insertIdx, 0, { ...jk, sortKey: newSortKey });
  });

  return result;
}

function getNextAlivePlayerIdx(players: DaVinciPlayer[], currentIdx: number): number {
  const len = players.length;
  for (let i = 1; i <= len; i++) {
    const nextIdx = (currentIdx + i) % len;
    if (!players[nextIdx].isEliminated) {
      return nextIdx;
    }
  }
  return currentIdx;
}

function createDefaultRoom(roomId: number): NetRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    waitlist: [],
    spectators: [],
    useJoker: true,
    baseTimeout: 45,
    level: 1,
    deck: [],
    currentPlayerIdx: 0,
    turnPhase: 'DRAW',
    drawnTile: null,
    turnDeadline: null,
    levelWinnerId: null,
    lastActionNotice: '',
    consecutiveTimeouts: 0,
    waitingSince: null,
  };
}

function getLevelTimeoutSeconds(baseTimeout: number, level: number): number {
  return Math.max(15, baseTimeout - (level - 1) * 7);
}

export default function Page7() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('davinci_net_uid');
    if (saved) return saved;
    const generated = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('davinci_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetRoomData[]>([1, 2, 3, 4].map(createDefaultRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);

  // 단독게임 상태
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<DaVinciPlayer[]>([
    {
      id: '1',
      name: '다빈치',
      color: PIECE_COLORS[0],
      hand: [],
      isEliminated: false,
      turnsTaken: 0,
    },
    {
      id: '2',
      name: '코난',
      color: PIECE_COLORS[1],
      hand: [],
      isEliminated: false,
      turnsTaken: 0,
    },
  ]);
  const [inputName, setInputName] = useState('');
  const [useJokerOption, setUseJokerOption] = useState<boolean>(true);
  const [soloPassScreen, setSoloPassScreen] = useState<boolean>(false); // 단독 플레이 시 기기 전달 가림막

  const [deck, setDeck] = useState<DaVinciTile[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<'DRAW' | 'PLACE_JOKER' | 'GUESS' | 'DECIDE_CONTINUE'>('DRAW');
  const [drawnTile, setDrawnTile] = useState<DaVinciTile | null>(null);
  const [winner, setWinner] = useState<DaVinciPlayer | null>(null);

  // 추리 대상 모달 상태 (단독 & 넷게임 공용)
  const [guessTarget, setGuessTarget] = useState<{
    targetPlayerId: string;
    targetPlayerName: string;
    tileId: string;
    tileColor: TileColor;
    tileIndex: number;
  } | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'success' | 'danger' | 'celebrate';
  } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = (
    text: string,
    type: 'info' | 'success' | 'danger' | 'celebrate' = 'info'
  ) => {
    setToast({ id: Date.now(), text, type });
  };

  const speakKorean = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.12;
      utterance.pitch = 1.05;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playSound = (kind: 'draw' | 'correct' | 'wrong' | 'eliminate' | 'win') => {
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
        draw: [440, 554.37],
        correct: [523.25, 659.25, 783.99],
        wrong: [311.13, 233.08],
        eliminate: [293.66, 220.0, 164.81],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'wrong' || kind === 'eliminate' ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.14, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.24);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.24);
      });
    } catch {
      // 오디오 컨텍스트 차단 무시
    }
  };

  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; scoreOrLevel: string }) => {
    const key = type === 'SOLO' ? 'davinci_hof_solo' : 'davinci_hof_net';
    try {
      const existing: HallOfFameRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
      const newEntry: HallOfFameRecord = {
        id: `rec_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: record.name,
        scoreOrLevel: record.scoreOrLevel,
        date: new Date().toLocaleDateString(),
      };
      const updated = [newEntry, ...existing].slice(0, 10);
      localStorage.setItem(key, JSON.stringify(updated));
    } catch (e) {
      console.error(e);
    }
  };

  const getHallOfFameRecords = (type: 'SOLO' | 'NET'): HallOfFameRecord[] => {
    const key = type === 'SOLO' ? 'davinci_hof_solo' : 'davinci_hof_net';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch {
      return [];
    }
  };

  // =========================================================================
  // Firebase 실시간 넷게임 동기화
  // =========================================================================
  useEffect(() => {
    if (appMode !== 'NET_LOBBY' && appMode !== 'NET_ROOM') return;

    const ensureRoomsExist = async () => {
      for (const id of [1, 2, 3, 4]) {
        const roomRef = ref(db, `davinci_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'davinci_rooms');
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
          players: (rData.players || []).map((p: DaVinciPlayer) => ({
            ...p,
            hand: p.hand || [],
          })),
          waitlist: rData.waitlist || [],
          spectators: rData.spectators || [],
          deck: rData.deck || [],
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

  // 대기실 7분 타임아웃 & 게임 턴 타임아웃 감지
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
          const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
          await set(roomRef, createDefaultRoom(activeNetRoom.roomId));
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

  const handleEnterRoomSubmit = async (asSpectator = false) => {
    if (!joinModalRoom) return;
    const trimmedName = joinPlayerName ? joinPlayerName.trim() : '';
    if (!trimmedName) {
      alert('참가할 이름을 입력해주세요!');
      return;
    }

    const roomRef = ref(db, `davinci_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetRoomData = roomData || createDefaultRoom(joinModalRoom.roomId);
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

        if ((room.status === 'EMPTY' || room.status === 'WAITING') && room.players.length < 4) {
          const idx = room.players.length;
          const newPlayer: DaVinciPlayer = {
            id: mySessionId,
            name: trimmedName,
            color: PIECE_COLORS[idx],
            hand: [],
            isEliminated: false,
            turnsTaken: 0,
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
        showToast('⏳ 현재 게임 중이거나 만석이어서 다음 레벨 예약자로 등록되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateRoomSettings = async (newUseJoker: boolean, newTimeout: number) => {
    if (!activeNetRoom) return;
    const clampedTimeout = Math.min(100, Math.max(15, newTimeout));
    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      useJoker: newUseJoker,
      baseTimeout: clampedTimeout,
      waitingSince: Date.now(),
    });
  };

  const dealInitialHandsForPlayers = (
    rawPlayers: DaVinciPlayer[],
    useJoker: boolean
  ): { initializedPlayers: DaVinciPlayer[]; remainingDeck: DaVinciTile[] } => {
    const fullDeck = createDeck(useJoker);
    const initialCount = rawPlayers.length === 4 ? 3 : 4; // 2~3인 4장, 4인 3장 시작
    let cursor = 0;

    const initializedPlayers = rawPlayers.map((p, idx) => {
      const drawn = fullDeck.slice(cursor, cursor + initialCount);
      cursor += initialCount;
      return {
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        hand: assignInitialHandWithRandomJoker(drawn),
        isEliminated: false,
        turnsTaken: 0,
      };
    });

    return {
      initializedPlayers,
      remainingDeck: fullDeck.slice(cursor),
    };
  };

  const handleStartNetGameFromLobby = async () => {
    if (!activeNetRoom) return;
    const currentPlayers = activeNetRoom.players || [];
    if (currentPlayers.length < 2) {
      showToast('최소 2명 이상 모여야 게임을 시작할 수 있습니다!', 'info');
      return;
    }

    const { initializedPlayers, remainingDeck } = dealInitialHandsForPlayers(
      currentPlayers,
      activeNetRoom.useJoker
    );
    const levelTimeout = getLevelTimeoutSeconds(activeNetRoom.baseTimeout, 1);

    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      status: 'PLAYING',
      level: 1,
      players: initializedPlayers,
      deck: remainingDeck,
      currentPlayerIdx: 0,
      turnPhase: remainingDeck.length > 0 ? 'DRAW' : 'GUESS',
      drawnTile: null,
      turnDeadline: Date.now() + levelTimeout * 1000,
      levelWinnerId: null,
      lastActionNotice: `🕵️ 레벨 1 추리 시작! (제한시간 ${levelTimeout}초)`,
      consecutiveTimeouts: 0,
      waitingSince: null,
    });
  };

  const handleAdvanceToNextLevel = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];
      if (!room.spectators) room.spectators = [];

      const nextLevel = room.level + 1;
      if (nextLevel > 5) {
        return createDefaultRoom(room.roomId);
      }

      const currentPlayers = [...room.players];
      const waitlist = [...room.waitlist];
      let nextParticipants: DaVinciPlayer[] = [];
      let remainingWaitlist: WaitlistPlayer[] = [];

      if (currentPlayers.length + waitlist.length <= 4) {
        const convertedWaiters: DaVinciPlayer[] = waitlist.map((w) => ({
          id: w.id,
          name: w.name,
          color: PIECE_COLORS[0],
          hand: [],
          isEliminated: false,
          turnsTaken: 0,
        }));
        nextParticipants = [...currentPlayers, ...convertedWaiters];
        remainingWaitlist = [];
      } else {
        const champion = currentPlayers.find((p) => p.id === room.levelWinnerId);
        const retained = champion ? [champion] : [];
        const slotsAvailable = 4 - retained.length;

        const promotedWaiters: DaVinciPlayer[] = waitlist
          .slice(0, slotsAvailable)
          .map((w) => ({
            id: w.id,
            name: w.name,
            color: PIECE_COLORS[0],
            hand: [],
            isEliminated: false,
            turnsTaken: 0,
          }));

        nextParticipants = [...retained, ...promotedWaiters];
        remainingWaitlist = waitlist.slice(slotsAvailable);
      }

      if (nextParticipants.length < 2) {
        room.status = nextParticipants.length === 0 ? 'EMPTY' : 'WAITING';
        room.level = nextLevel;
        room.players = nextParticipants.map((p, idx) => ({
          ...p,
          color: PIECE_COLORS[idx],
          hand: [],
          isEliminated: false,
          turnsTaken: 0,
        }));
        room.waitlist = remainingWaitlist;
        room.levelWinnerId = null;
        room.turnDeadline = null;
        room.consecutiveTimeouts = 0;
        room.waitingSince = nextParticipants.length > 0 ? Date.now() : null;
        return room;
      }

      const { initializedPlayers, remainingDeck } = dealInitialHandsForPlayers(
        nextParticipants,
        room.useJoker
      );
      const levelTimeout = getLevelTimeoutSeconds(room.baseTimeout, nextLevel);

      room.status = 'PLAYING';
      room.level = nextLevel;
      room.players = initializedPlayers;
      room.waitlist = remainingWaitlist;
      room.deck = remainingDeck;
      room.currentPlayerIdx = 0;
      room.turnPhase = remainingDeck.length > 0 ? 'DRAW' : 'GUESS';
      room.drawnTile = null;
      room.turnDeadline = Date.now() + levelTimeout * 1000;
      room.levelWinnerId = null;
      room.lastActionNotice = `🔥 레벨 ${nextLevel} 돌입! (제한시간 ${levelTimeout}초)`;
      room.consecutiveTimeouts = 0;
      room.waitingSince = null;

      return room;
    });
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }

    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];
      if (!room.spectators) room.spectators = [];

      const filteredPlayers = room.players.filter((p) => p.id !== mySessionId);
      const filteredWaitlist = room.waitlist.filter((w) => w.id !== mySessionId);
      const filteredSpectators = room.spectators.filter((s) => s.id !== mySessionId);

      if (filteredPlayers.length === 0 && filteredSpectators.length === 0) {
        return createDefaultRoom(room.roomId);
      }

      if (room.status === 'PLAYING') {
        const alivePlayers = filteredPlayers.filter((p) => !p.isEliminated);
        if (alivePlayers.length <= 1) {
          if (alivePlayers.length === 1) {
            room.status = 'LEVEL_CLEAR';
            room.levelWinnerId = alivePlayers[0].id;
            room.turnDeadline = null;
            room.players = filteredPlayers;
            room.waitlist = filteredWaitlist;
            room.spectators = filteredSpectators;
            room.lastActionNotice = `🏆 상대방 퇴장으로 ${alivePlayers[0].name}님이 부전승했습니다!`;
            return room;
          }
          return createDefaultRoom(room.roomId);
        }
        room.players = filteredPlayers;
        room.waitlist = filteredWaitlist;
        room.spectators = filteredSpectators;
        room.currentPlayerIdx = room.currentPlayerIdx % filteredPlayers.length;
        return room;
      }

      room.players = filteredPlayers;
      room.waitlist = filteredWaitlist;
      room.spectators = filteredSpectators;
      return room;
    });

    setGuessTarget(null);
    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  const handleNetTurnTimeout = async (room: NetRoomData) => {
    const roomRef = ref(db, `davinci_rooms/room_${room.roomId}`);
    const levelTimeout = getLevelTimeoutSeconds(room.baseTimeout, room.level);
    const playersArr = room.players || [];
    if (playersArr.length === 0) return;

    const timedOutPlayer = playersArr[room.currentPlayerIdx];
    const newConsecutive = (room.consecutiveTimeouts || 0) + 1;
    const maxAllowedTimeouts = playersArr.length * 2;

    if (newConsecutive >= maxAllowedTimeouts && timedOutPlayer) {
      const remainingPlayers = playersArr.filter((p) => p.id !== timedOutPlayer.id);
      if (remainingPlayers.length < 2) {
        await set(roomRef, createDefaultRoom(room.roomId));
        showToast(`⏰ ${timedOutPlayer.name}님 장기 미참여로 자동 퇴장되어 방이 초기화되었습니다.`, 'info');
        return;
      }
      const nextIdx = room.currentPlayerIdx % remainingPlayers.length;
      const nextDeck = room.deck || [];
      await update(roomRef, {
        players: remainingPlayers,
        currentPlayerIdx: nextIdx,
        turnPhase: nextDeck.length > 0 ? 'DRAW' : 'GUESS',
        drawnTile: null,
        turnDeadline: Date.now() + levelTimeout * 1000,
        lastActionNotice: `⏰ ${timedOutPlayer.name}님이 연속 타임아웃으로 자동 퇴장되었습니다!`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    // 만약 패를 뽑아놓은 상태에서 타임아웃이면 해당 패를 강제 공개 처리
    let updatedPlayers = [...playersArr];
    if (room.drawnTile && timedOutPlayer) {
      updatedPlayers = updatedPlayers.map((p, idx) => {
        if (idx !== room.currentPlayerIdx) return p;
        const nextHand = sortTiles(
          p.hand.map((t) => (t.id === room.drawnTile?.id ? { ...t, revealed: true } : t))
        );
        const allRevealed = nextHand.every((t) => t.revealed);
        return { ...p, hand: nextHand, isEliminated: allRevealed };
      });
    }

    const alive = updatedPlayers.filter((p) => !p.isEliminated);
    if (alive.length <= 1 && alive[0]) {
      await update(roomRef, {
        players: updatedPlayers,
        status: 'LEVEL_CLEAR',
        levelWinnerId: alive[0].id,
        drawnTile: null,
        turnDeadline: null,
        lastActionNotice: `🏆 ${alive[0].name}님이 최후의 승자가 되었습니다!`,
      });
      return;
    }

    const nextIdx = getNextAlivePlayerIdx(updatedPlayers, room.currentPlayerIdx);
    const nextDeck = room.deck || [];

    await update(roomRef, {
      players: updatedPlayers,
      currentPlayerIdx: nextIdx,
      turnPhase: nextDeck.length > 0 ? 'DRAW' : 'GUESS',
      drawnTile: null,
      turnDeadline: Date.now() + levelTimeout * 1000,
      lastActionNotice: `⏰ ${timedOutPlayer?.name || '플레이어'}님 시간 초과! (${newConsecutive}/${maxAllowedTimeouts}회)`,
      consecutiveTimeouts: newConsecutive,
    });
  };

  // 넷게임 1단계: 중앙 덱에서 패 뽑기
  const handleNetDrawTile = async (chosenColor: TileColor) => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING' || activeNetRoom.turnPhase !== 'DRAW') return;
    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % playersArr.length;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 차례가 아닙니다!', 'info');
      return;
    }

    const currentDeck = [...(activeNetRoom.deck || [])];
    const tileIndex = currentDeck.findIndex((t) => t.color === chosenColor);
    if (tileIndex === -1) {
      showToast('해당 색상의 남은 패가 없습니다!', 'info');
      return;
    }

    playSound('draw');
    const [pickedTile] = currentDeck.splice(tileIndex, 1);

    if (pickedTile.isJoker) {
      // 조커를 뽑으면 위치 선택 단계로
      const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
      await update(roomRef, {
        deck: currentDeck,
        drawnTile: pickedTile,
        turnPhase: 'PLACE_JOKER',
        lastActionNotice: `🃏 ${currP.name}님이 조커(-) 패를 뽑았습니다! 배치할 위치를 고르세요.`,
        consecutiveTimeouts: 0,
      });
      return;
    }

    const updatedPlayers = playersArr.map((p, idx) => {
      if (idx !== currIdx) return p;
      return {
        ...p,
        hand: sortTiles([...p.hand, pickedTile]),
      };
    });

    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      deck: currentDeck,
      players: updatedPlayers,
      drawnTile: pickedTile,
      turnPhase: 'GUESS',
      lastActionNotice: `🕵️ ${currP.name}님이 [${chosenColor === 'BLACK' ? '검은색' : '흰색'}] 패를 가져왔습니다. 상대 패를 추리하세요!`,
      consecutiveTimeouts: 0,
    });
  };

  // 넷게임 조커 위치 삽입
  const handleNetPlaceJoker = async (insertIdx: number) => {
    if (!activeNetRoom || activeNetRoom.turnPhase !== 'PLACE_JOKER' || !activeNetRoom.drawnTile) return;
    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % playersArr.length;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) return;

    const hand = [...currP.hand];
    const prevKey = insertIdx === 0 ? -1 : hand[insertIdx - 1].sortKey;
    const nextKey = insertIdx === hand.length ? 12 : hand[insertIdx].sortKey;
    const placedJoker: DaVinciTile = {
      ...activeNetRoom.drawnTile,
      sortKey: (prevKey + nextKey) / 2,
    };

    hand.splice(insertIdx, 0, placedJoker);

    const updatedPlayers = playersArr.map((p, idx) =>
      idx === currIdx ? { ...p, hand } : p
    );

    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      players: updatedPlayers,
      drawnTile: placedJoker,
      turnPhase: 'GUESS',
      lastActionNotice: `🕵️ ${currP.name}님이 조커를 배치했습니다. 상대 패를 추리하세요!`,
    });
  };

  // 넷게임 2단계: 추리 제출
  const handleNetSubmitGuess = async (guessedValue: number, guessedIsJoker: boolean) => {
    if (!activeNetRoom || !guessTarget) return;
    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % playersArr.length;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) return;

    const targetPlayer = playersArr.find((p) => p.id === guessTarget.targetPlayerId);
    const targetTile = targetPlayer?.hand.find((t) => t.id === guessTarget.tileId);
    setGuessTarget(null);

    if (!targetPlayer || !targetTile || targetTile.revealed) return;

    const isCorrect = guessedIsJoker
      ? targetTile.isJoker
      : !targetTile.isJoker && targetTile.value === guessedValue;

    const levelTimeout = getLevelTimeoutSeconds(activeNetRoom.baseTimeout, activeNetRoom.level);
    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);

    if (isCorrect) {
      playSound('correct');
      let targetEliminated = false;

      const updatedPlayers = playersArr.map((p) => {
        if (p.id !== targetPlayer.id) return p;
        const nextHand = p.hand.map((t) =>
          t.id === targetTile.id ? { ...t, revealed: true } : t
        );
        const allRevealed = nextHand.every((t) => t.revealed);
        if (allRevealed) targetEliminated = true;
        return {
          ...p,
          hand: nextHand,
          isEliminated: allRevealed,
        };
      });

      if (targetEliminated) {
        playSound('eliminate');
      }

      const alivePlayers = updatedPlayers.filter((p) => !p.isEliminated);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        playSound('win');
        speakKorean(`축하합니다! ${champ.name}님이 최후의 승자가 되었습니다!`);
        saveHallOfFameRecord('NET', {
          name: champ.name,
          scoreOrLevel: `Lv.${activeNetRoom.level} 코드 해독 우승`,
        });

        await update(roomRef, {
          players: updatedPlayers,
          status: 'LEVEL_CLEAR',
          levelWinnerId: champ.id,
          drawnTile: null,
          turnDeadline: null,
          lastActionNotice: `🏆 ${champ.name}님이 모든 코드를 해독하고 레벨 ${activeNetRoom.level} 우승을 차지했습니다!`,
        });
        return;
      }

      speakKorean('정답입니다! 계속 추리하거나 턴을 넘길 수 있습니다.');
      await update(roomRef, {
        players: updatedPlayers,
        turnPhase: 'DECIDE_CONTINUE',
        turnDeadline: Date.now() + levelTimeout * 1000,
        lastActionNotice: `🎯 명중! ${currP.name}님이 ${targetPlayer.name}님의 [${getTileDisplay(targetTile)}] 패를 맞혔습니다!`,
      });
    } else {
      // 추리 실패: 방금 뽑아온 자신의 패(drawnTile)가 있다면 공개!
      playSound('wrong');
      speakKorean('아쉽네요! 추리에 실패하여 가져온 패가 공개됩니다.');

      let selfEliminated = false;
      const updatedPlayers = playersArr.map((p, idx) => {
        if (idx !== currIdx) return p;
        let nextHand = [...p.hand];
        if (activeNetRoom.drawnTile) {
          nextHand = nextHand.map((t) =>
            t.id === activeNetRoom.drawnTile?.id ? { ...t, revealed: true } : t
          );
        } else {
          // 덱이 비어 뽑은 패가 없던 경우 비공개 패 중 첫 번째 강제 공개
          const firstHiddenIdx = nextHand.findIndex((t) => !t.revealed);
          if (firstHiddenIdx !== -1) {
            nextHand[firstHiddenIdx] = { ...nextHand[firstHiddenIdx], revealed: true };
          }
        }
        const allRevealed = nextHand.every((t) => t.revealed);
        if (allRevealed) selfEliminated = true;
        return {
          ...p,
          hand: nextHand,
          isEliminated: allRevealed,
          turnsTaken: (p.turnsTaken || 0) + 1,
        };
      });

      const alivePlayers = updatedPlayers.filter((p) => !p.isEliminated);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        playSound('win');
        saveHallOfFameRecord('NET', {
          name: champ.name,
          scoreOrLevel: `Lv.${activeNetRoom.level} 코드 해독 우승`,
        });

        await update(roomRef, {
          players: updatedPlayers,
          status: 'LEVEL_CLEAR',
          levelWinnerId: champ.id,
          drawnTile: null,
          turnDeadline: null,
          lastActionNotice: `🏆 ${champ.name}님이 최후의 승자가 되었습니다!`,
        });
        return;
      }

      const nextIdx = getNextAlivePlayerIdx(updatedPlayers, currIdx);
      const nextDeck = activeNetRoom.deck || [];

      await update(roomRef, {
        players: updatedPlayers,
        currentPlayerIdx: nextIdx,
        turnPhase: nextDeck.length > 0 ? 'DRAW' : 'GUESS',
        drawnTile: null,
        turnDeadline: Date.now() + levelTimeout * 1000,
        lastActionNotice: selfEliminated
          ? `💥 ${currP.name}님 추리 실패로 모든 패가 공개되어 탈락했습니다!`
          : `❌ 빗나갔습니다! ${currP.name}님의 새 패가 공개되고 다음 차례로 넘어갑니다.`,
      });
    }
  };

  // 넷게임 3단계: 정답 후 턴 종료(안전하게 패 비공개 유지)
  const handleNetEndTurnSafely = async () => {
    if (!activeNetRoom || activeNetRoom.turnPhase !== 'DECIDE_CONTINUE') return;
    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % playersArr.length;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) return;

    const updatedPlayers = playersArr.map((p, idx) =>
      idx === currIdx ? { ...p, turnsTaken: (p.turnsTaken || 0) + 1 } : p
    );

    const nextIdx = getNextAlivePlayerIdx(updatedPlayers, currIdx);
    const nextDeck = activeNetRoom.deck || [];
    const levelTimeout = getLevelTimeoutSeconds(activeNetRoom.baseTimeout, activeNetRoom.level);

    const roomRef = ref(db, `davinci_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      players: updatedPlayers,
      currentPlayerIdx: nextIdx,
      turnPhase: nextDeck.length > 0 ? 'DRAW' : 'GUESS',
      drawnTile: null,
      turnDeadline: Date.now() + levelTimeout * 1000,
      lastActionNotice: `🛡️ ${currP.name}님이 패를 안전하게 숨기고 ${updatedPlayers[nextIdx].name}님에게 턴을 넘겼습니다.`,
    });
  };

  // =========================================================================
  // 단독게임(SOLO) 로직
  // =========================================================================
  const addPlayer = () => {
    const trimmed = inputName ? inputName.trim() : '';
    if (!trimmed) return;
    if (players.length >= 4) {
      showToast('최대 4명까지 참가할 수 있습니다.', 'info');
      return;
    }
    const idx = players.length;
    setPlayers([
      ...players,
      {
        id: String(Date.now() + Math.random()),
        name: trimmed,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        hand: [],
        isEliminated: false,
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
      showToast('최소 2명 이상의 탐정을 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startSoloGame = () => {
    const { initializedPlayers, remainingDeck } = dealInitialHandsForPlayers(
      players,
      useJokerOption
    );
    setPlayers(initializedPlayers);
    setDeck(remainingDeck);
    setCurrentPlayerIdx(0);
    setTurnPhase(remainingDeck.length > 0 ? 'DRAW' : 'GUESS');
    setDrawnTile(null);
    setGuessTarget(null);
    setWinner(null);
    setSoloPassScreen(true); // 첫 플레이어 기기 전달 화면
    setGameState('PLAYING');
  };

  const handleSoloDrawTile = (chosenColor: TileColor) => {
    if (gameState !== 'PLAYING' || turnPhase !== 'DRAW') return;
    const currentDeck = [...deck];
    const tileIndex = currentDeck.findIndex((t) => t.color === chosenColor);
    if (tileIndex === -1) {
      showToast('해당 색상의 남은 패가 없습니다!', 'info');
      return;
    }

    playSound('draw');
    const [pickedTile] = currentDeck.splice(tileIndex, 1);
    setDeck(currentDeck);
    setDrawnTile(pickedTile);

    if (pickedTile.isJoker) {
      setTurnPhase('PLACE_JOKER');
      showToast('🃏 조커(-) 패를 뽑았습니다! 내 패 사이 원하는 위치에 배치하세요.', 'info');
      return;
    }

    setPlayers((prev) =>
      prev.map((p, idx) =>
        idx === currentPlayerIdx
          ? { ...p, hand: sortTiles([...p.hand, pickedTile]) }
          : p
      )
    );
    setTurnPhase('GUESS');
    showToast('🕵️ 상대방의 뒤집힌 패 하나를 눌러 숫자를 추리하세요!', 'info');
  };

  const handleSoloPlaceJoker = (insertIdx: number) => {
    if (turnPhase !== 'PLACE_JOKER' || !drawnTile) return;
    const currP = players[currentPlayerIdx];
    const hand = [...currP.hand];
    const prevKey = insertIdx === 0 ? -1 : hand[insertIdx - 1].sortKey;
    const nextKey = insertIdx === hand.length ? 12 : hand[insertIdx].sortKey;
    const placedJoker: DaVinciTile = {
      ...drawnTile,
      sortKey: (prevKey + nextKey) / 2,
    };

    hand.splice(insertIdx, 0, placedJoker);
    setPlayers((prev) =>
      prev.map((p, idx) => (idx === currentPlayerIdx ? { ...p, hand } : p))
    );
    setDrawnTile(placedJoker);
    setTurnPhase('GUESS');
    showToast('🕵️ 조커를 배치했습니다! 이제 상대방의 패를 추리하세요.', 'info');
  };

  const handleSoloSubmitGuess = (guessedValue: number, guessedIsJoker: boolean) => {
    if (!guessTarget) return;
    const currP = players[currentPlayerIdx];
    const targetPlayer = players.find((p) => p.id === guessTarget.targetPlayerId);
    const targetTile = targetPlayer?.hand.find((t) => t.id === guessTarget.tileId);
    setGuessTarget(null);

    if (!targetPlayer || !targetTile || targetTile.revealed) return;

    const isCorrect = guessedIsJoker
      ? targetTile.isJoker
      : !targetTile.isJoker && targetTile.value === guessedValue;

    if (isCorrect) {
      playSound('correct');
      let targetEliminated = false;

      const updatedPlayers = players.map((p) => {
        if (p.id !== targetPlayer.id) return p;
        const nextHand = p.hand.map((t) =>
          t.id === targetTile.id ? { ...t, revealed: true } : t
        );
        const allRevealed = nextHand.every((t) => t.revealed);
        if (allRevealed) targetEliminated = true;
        return { ...p, hand: nextHand, isEliminated: allRevealed };
      });

      if (targetEliminated) {
        playSound('eliminate');
      }

      setPlayers(updatedPlayers);

      const alivePlayers = updatedPlayers.filter((p) => !p.isEliminated);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        setWinner(champ);
        setGameState('GAME_OVER');
        playSound('win');
        speakKorean(`축하합니다! ${champ.name}님이 모든 코드를 해독하고 우승했습니다!`);
        saveHallOfFameRecord('SOLO', {
          name: champ.name,
          scoreOrLevel: `코드 해독 우승 (총 ${(champ.turnsTaken || 0) + 1}턴)`,
        });
        return;
      }

      speakKorean('정답입니다!');
      setTurnPhase('DECIDE_CONTINUE');
      showToast(
        `🎯 명중! [${getTileDisplay(targetTile)}] 패를 맞혔습니다! 계속 추리하거나 턴을 마치세요.`,
        'success'
      );
    } else {
      playSound('wrong');
      speakKorean('빗나갔습니다! 가져온 패가 공개됩니다.');

      const updatedPlayers = players.map((p, idx) => {
        if (idx !== currentPlayerIdx) return p;
        let nextHand = [...p.hand];
        if (drawnTile) {
          nextHand = nextHand.map((t) =>
            t.id === drawnTile.id ? { ...t, revealed: true } : t
          );
        } else {
          const firstHiddenIdx = nextHand.findIndex((t) => !t.revealed);
          if (firstHiddenIdx !== -1) {
            nextHand[firstHiddenIdx] = { ...nextHand[firstHiddenIdx], revealed: true };
          }
        }
        const allRevealed = nextHand.every((t) => t.revealed);
        return {
          ...p,
          hand: nextHand,
          isEliminated: allRevealed,
          turnsTaken: (p.turnsTaken || 0) + 1,
        };
      });

      setPlayers(updatedPlayers);

      const alivePlayers = updatedPlayers.filter((p) => !p.isEliminated);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        setWinner(champ);
        setGameState('GAME_OVER');
        playSound('win');
        saveHallOfFameRecord('SOLO', {
          name: champ.name,
          scoreOrLevel: `코드 해독 우승 (총 ${champ.turnsTaken || 1}턴)`,
        });
        return;
      }

      showToast(`❌ 추리 실패! ${currP.name}님의 새 패가 공개되었습니다.`, 'danger');
      const nextIdx = getNextAlivePlayerIdx(updatedPlayers, currentPlayerIdx);
      window.setTimeout(() => {
        setCurrentPlayerIdx(nextIdx);
        setTurnPhase(deck.length > 0 ? 'DRAW' : 'GUESS');
        setDrawnTile(null);
        setSoloPassScreen(true);
      }, 1200);
    }
  };

  const handleSoloEndTurnSafely = () => {
    if (turnPhase !== 'DECIDE_CONTINUE') return;
    const updatedPlayers = players.map((p, idx) =>
      idx === currentPlayerIdx ? { ...p, turnsTaken: (p.turnsTaken || 0) + 1 } : p
    );
    setPlayers(updatedPlayers);
    const nextIdx = getNextAlivePlayerIdx(updatedPlayers, currentPlayerIdx);
    setCurrentPlayerIdx(nextIdx);
    setTurnPhase(deck.length > 0 ? 'DRAW' : 'GUESS');
    setDrawnTile(null);
    setSoloPassScreen(true);
  };

  // =========================================================================
  // 공용 렌더링 헬퍼: 추리 숫자 선택 모달
  // =========================================================================
  const renderGuessModal = (isNet: boolean) => {
    if (!guessTarget) return null;
    return (
      <div className="modal-overlay" onClick={() => setGuessTarget(null)}>
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <h3 style={{ margin: '0 0 6px', color: '#0f172a' }}>
            🔍 {guessTarget.targetPlayerName}님의 {guessTarget.tileIndex + 1}번째 패 추리
          </h3>
          <p className="modal-subtext">
            선택한 패는{' '}
            <strong style={{ color: guessTarget.tileColor === 'BLACK' ? '#0f172a' : '#64748b' }}>
              {guessTarget.tileColor === 'BLACK' ? '⬛ 검은색 타일' : '⬜ 흰색 타일'}
            </strong>
            입니다. 어떤 숫자일까요?
          </p>

          <div className="guess-number-grid">
            {GUESS_NUMBERS.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`guess-num-btn ${
                  guessTarget.tileColor === 'BLACK' ? 'black-style' : 'white-style'
                }`}
                onClick={() =>
                  isNet
                    ? handleNetSubmitGuess(item.value, item.isJoker)
                    : handleSoloSubmitGuess(item.value, item.isJoker)
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: '12px' }}
            onClick={() => setGuessTarget(null)}
          >
            취소
          </button>
        </div>
      </div>
    );
  };

  // =========================================================================
  // 1. 홈 화면 (HOME)
  // =========================================================================
  if (appMode === 'HOME') {
    return (
      <div className="dv-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🕵️‍♂️</div>
          <h1 className="setup-title">다빈치 코드 (DA VINCI CODE)</h1>
          <p className="home-subtitle">상대의 암호 숫자 배열을 추리해 모든 코드를 해독하라!</p>

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
              <span className="mode-desc">한 기기를 돌려가며 2~4명 두뇌 대결</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 방 실시간 대전 & 관망모드</span>
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

  // =========================================================================
  // 2. 명예의 전당 (HALL_OF_FAME)
  // =========================================================================
  if (appMode === 'HALL_OF_FAME') {
    const soloRecords = getHallOfFameRecords('SOLO');
    const netRecords = getHallOfFameRecords('NET');

    return (
      <div className="dv-container" style={{ background: PLAYER_BG_COLORS[0], padding: '16px' }}>
        <div className="setup-card" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, color: '#0f172a' }}>🏅 명예의 전당</h2>
            <div style={{ width: '60px' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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

  // =========================================================================
  // 3. 넷게임 4개 방 로비 (NET_LOBBY)
  // =========================================================================
  if (appMode === 'NET_LOBBY') {
    return (
      <div className="dv-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="net-lobby-container">
          <div className="net-lobby-header">
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
              🌐 다빈치 코드 넷게임 (방 4개)
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
              const isPlaying = room.status === 'PLAYING' || room.status === 'LEVEL_CLEAR';
              const isFull = roomPlayers.length >= 4;

              let statusBadgeText = '🟢 빈방';
              let statusClass = 'empty';
              if (isPlaying) {
                statusBadgeText = `🔥 대결중 (Lv.${room.level}/5)`;
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
                    <span className="room-number-title">🕵️ 제 {room.roomId} 추리방</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>🃏 조커(-): {room.useJoker ? '포함' : '제외'}</span>
                    <span>⏱️ 기본 제한시간: {room.baseTimeout}초</span>
                  </div>

                  <div className="room-members-box">
                    <div className="room-members-label">참가자 ({roomPlayers.length}/4):</div>
                    <div className="room-members-chips">
                      {roomPlayers.length === 0 ? (
                        <span className="empty-member-text">첫 번째 탐정을 기다리고 있습니다</span>
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

                  {roomSpectators.length > 0 && (
                    <div className="room-waitlist-box" style={{ color: '#0369a1', background: '#f0f9ff' }}>
                      👀 관망 중 ({roomSpectators.length}명): {roomSpectators.map((s) => s.name).join(', ')}
                    </div>
                  )}

                  {roomWaitlist.length > 0 && (
                    <div className="room-waitlist-box">
                      ⏳ 다음 레벨 예약 ({roomWaitlist.length}명):{' '}
                      {roomWaitlist.map((w) => w.name).join(', ')}
                    </div>
                  )}

                  <div className="room-enter-cta">
                    {isEmpty
                      ? '👉 클릭하여 방 만들기 또는 관망하기'
                      : isPlaying || isFull
                      ? '👉 클릭하여 참전 예약 또는 관망하기'
                      : '👉 클릭하여 참가하기 또는 관망하기'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {joinModalRoom && (
          <div className="modal-overlay" onClick={() => setJoinModalRoom(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2 style={{ margin: '0 0 8px' }}>🕵️ 제 {joinModalRoom.roomId} 추리방 입장</h2>
              <p className="modal-subtext">
                이름을 입력하고 플레이어로 참가하거나, 게임 상황을 구경하는 <strong>관망모드</strong>를 선택하세요!
              </p>

              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력 (예: 셜록)"
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
                  🚀 참가하기 / 예약하기
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 4. 넷게임 방 내부 (대기실 & 플레이 화면)
  // =========================================================================
  if (appMode === 'NET_ROOM') {
    if (!activeNetRoom) {
      return (
        <div className="dv-container" style={{ background: PLAYER_BG_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
    const roomSpectators = activeNetRoom.spectators || [];
    const isHost = roomPlayers[0]?.id === mySessionId;
    const amIWaitlisted = roomWaitlist.some((w) => w.id === mySessionId);
    const amISpectator = roomSpectators.some((s) => s.id === mySessionId);

    // 4-A. 넷게임 대기실
    if (activeNetRoom.status === 'WAITING' || activeNetRoom.status === 'EMPTY') {
      const minutes = Math.floor(waitingCountdownSec / 60);
      const seconds = waitingCountdownSec % 60;
      const countdownStr = `${minutes}분 ${seconds < 10 ? '0' : ''}${seconds}초`;

      return (
        <div className="dv-container" style={{ background: PLAYER_BG_COLORS[0] }}>
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
                제 {activeNetRoom.roomId}방 · 대기 중 (⏱️ {countdownStr})
              </span>
            </div>

            <h1 className="setup-title" style={{ marginTop: '14px' }}>
              🕵️ 다빈치 코드 대기실 (총 5레벨 도전) {amISpectator ? '👀 [관망모드]' : ''}
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                🃏 조커(-) 타일 사용 여부 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <button
                  type="button"
                  disabled={!isHost}
                  className={`count-btn ${activeNetRoom.useJoker ? 'active' : ''}`}
                  onClick={() => updateRoomSettings(true, activeNetRoom.baseTimeout)}
                >
                  🃏 조커 포함 (26장)
                </button>
                <button
                  type="button"
                  disabled={!isHost}
                  className={`count-btn ${!activeNetRoom.useJoker ? 'active' : ''}`}
                  onClick={() => updateRoomSettings(false, activeNetRoom.baseTimeout)}
                >
                  🔢 숫자만 사용 (24장)
                </button>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 기본 턴 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong> {isHost ? '(방장 설정 가능)' : ''}
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
                    updateRoomSettings(activeNetRoom.useJoker, Number(e.target.value))
                  }
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>100초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🧭 입장한 탐정 (2~4명)</label>
              <div className="player-list">
                {roomPlayers.map((p, idx) => (
                  <div key={p.id} className="player-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="squircle-dot" style={{ backgroundColor: PIECE_COLORS[idx] }}>
                        {getShortName(p.name)}
                      </span>
                      {p.name} {idx === 0 && '👑(방장)'} {p.id === mySessionId && '(나)'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#059669' }}>준비완료</span>
                  </div>
                ))}
              </div>
            </div>

            {roomSpectators.length > 0 && (
              <div className="setting-section">
                <label className="setting-label">👀 관망 중인 사용자</label>
                <div style={{ fontSize: '13px', color: '#0369a1', background: '#f0f9ff', padding: '8px 12px', borderRadius: '8px' }}>
                  {roomSpectators.map((s) => s.name).join(', ')}
                </div>
              </div>
            )}

            <button
              type="button"
              className="btn btn-success"
              disabled={roomPlayers.length < 2}
              onClick={handleStartNetGameFromLobby}
            >
              🚀 추리 대결 시작! ({roomPlayers.length}/4명)
            </button>
          </div>
        </div>
      );
    }

    // 4-B. 넷게임 플레이 화면
    const netCurrIdx = (activeNetRoom.currentPlayerIdx || 0) % roomPlayers.length;
    const netCurrPlayer = roomPlayers[netCurrIdx];
    const isMyTurn = netCurrPlayer?.id === mySessionId && !amISpectator;
    const myPlayerObj = roomPlayers.find((p) => p.id === mySessionId);
    const opponents = roomPlayers.filter((p) => p.id !== (myPlayerObj ? mySessionId : netCurrPlayer?.id));

    const blackDeckCount = (activeNetRoom.deck || []).filter((t) => t.color === 'BLACK').length;
    const whiteDeckCount = (activeNetRoom.deck || []).filter((t) => t.color === 'WHITE').length;

    const levelWinner = roomPlayers.find((p) => p.id === activeNetRoom.levelWinnerId);
    const amILevelWinner = activeNetRoom.levelWinnerId === mySessionId;

    return (
      <div
        className="dv-container"
        style={{ background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length] }}
      >
        {toast && (
          <div key={toast.id} className={`dv-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          {/* 상단 상태바 */}
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">
                Lv.{activeNetRoom.level}/5 {amISpectator ? '👀[관망]' : ''}
              </span>
              <span className={`net-timer-badge ${remainingSeconds <= 7 ? 'urgent' : ''}`}>
                ⏱️ {remainingSeconds}초
              </span>
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p, idx) => {
                const isActive = idx === netCurrIdx;
                const hiddenCount = p.hand.filter((t) => !t.revealed).length;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''} ${
                      p.isEliminated ? 'eliminated' : ''
                    }`}
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
                        {p.isEliminated ? '💀탈락' : `🔒${hiddenCount}장`}
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

          {amISpectator && (
            <div className="net-waitlist-strip" style={{ background: '#e0f2fe', color: '#0369a1' }}>
              👀 현재 관망모드 중입니다. 모든 플레이어의 암호 패 배열이 실시간으로 보입니다!
            </div>
          )}

          {(amIWaitlisted || roomWaitlist.length > 0) && !amISpectator && (
            <div className="net-waitlist-strip">
              {amIWaitlisted
                ? '⏳ 현재 다음 레벨 예약 대기 중입니다! 이번 레벨이 끝나면 자동으로 참가됩니다.'
                : `⏳ 다음 레벨 예약자 (${roomWaitlist.length}명): ${roomWaitlist.map((w) => w.name).join(', ')}`}
            </div>
          )}

          {/* 중앙 추리 테이블 (상대방 패 + 중앙 덱) */}
          <div className="dv-table-board">
            <div className="dv-notice-banner">
              {activeNetRoom.lastActionNotice || `🕵️ 제 ${activeNetRoom.roomId}방 · 레벨 ${activeNetRoom.level}`}
            </div>

            {/* 상대방들의 패 영역 */}
            <div className="opponents-zone">
              {opponents.map((opp) => {
                const canGuessOpp =
                  isMyTurn &&
                  (activeNetRoom.turnPhase === 'GUESS' || activeNetRoom.turnPhase === 'DECIDE_CONTINUE') &&
                  !opp.isEliminated;

                return (
                  <div
                    key={opp.id}
                    className={`opponent-hand-card ${opp.isEliminated ? 'eliminated' : ''} ${
                      opp.id === netCurrPlayer?.id ? 'active-opp' : ''
                    }`}
                  >
                    <div className="opp-header">
                      <span className="squircle-dot mini" style={{ backgroundColor: opp.color }}>
                        {getShortName(opp.name)}
                      </span>
                      <strong>{opp.name}</strong>
                      {opp.isEliminated && <span className="elim-tag">💀 탈락</span>}
                    </div>

                    <div className="tiles-row">
                      {opp.hand.map((tile, tIdx) => {
                        const isVisible = tile.revealed || amISpectator;
                        const isClickable = canGuessOpp && !tile.revealed;

                        return (
                          <button
                            key={tile.id}
                            type="button"
                            disabled={!isClickable}
                            className={`dv-tile ${tile.color === 'BLACK' ? 'black' : 'white'} ${
                              tile.revealed ? 'revealed' : 'hidden'
                            } ${isClickable ? 'guessable-pulse' : ''}`}
                            onClick={() =>
                              setGuessTarget({
                                targetPlayerId: opp.id,
                                targetPlayerName: opp.name,
                                tileId: tile.id,
                                tileColor: tile.color,
                                tileIndex: tIdx,
                              })
                            }
                          >
                            <span className="tile-val">
                              {isVisible ? getTileDisplay(tile) : '?'}
                            </span>
                            {tile.revealed && <span className="tile-eye-badge">👁️</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 중앙 미공개 덱 영역 */}
            <div className="center-deck-zone">
              <div className="deck-title">📦 중앙 암호 패 덱 (남은 패: {(activeNetRoom.deck || []).length}장)</div>
              <div className="deck-buttons-row">
                <button
                  type="button"
                  disabled={!isMyTurn || activeNetRoom.turnPhase !== 'DRAW' || blackDeckCount === 0}
                  className={`deck-draw-btn black ${
                    isMyTurn && activeNetRoom.turnPhase === 'DRAW' && blackDeckCount > 0 ? 'guide-bob' : ''
                  }`}
                  onClick={() => handleNetDrawTile('BLACK')}
                >
                  <span className="deck-card-icon">⬛</span>
                  <div>
                    <strong>검은색 패 뽑기</strong>
                    <span>남은 수량: {blackDeckCount}장</span>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={!isMyTurn || activeNetRoom.turnPhase !== 'DRAW' || whiteDeckCount === 0}
                  className={`deck-draw-btn white ${
                    isMyTurn && activeNetRoom.turnPhase === 'DRAW' && whiteDeckCount > 0 ? 'guide-bob' : ''
                  }`}
                  onClick={() => handleNetDrawTile('WHITE')}
                >
                  <span className="deck-card-icon">⬜</span>
                  <div>
                    <strong>흰색 패 뽑기</strong>
                    <span>남은 수량: {whiteDeckCount}장</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          {/* 하단 내 손패 및 액션 도크 */}
          {netCurrPlayer && (
            <div
              className="dv-bottom-dock"
              style={{ borderTop: `4px solid ${(myPlayerObj || netCurrPlayer).color}` }}
            >
              <div className="dock-top-status">
                <span
                  className="turn-owner-pill"
                  style={{ backgroundColor: netCurrPlayer.color }}
                >
                  {netCurrPlayer.name} {isMyTurn ? '(내 차례!)' : '(진행 중)'}
                </span>

                <span className="step-status-badge">
                  {amISpectator
                    ? '👀 관망모드 실시간 관전 중'
                    : !isMyTurn
                    ? `${netCurrPlayer.name}님의 추리를 기다리는 중...`
                    : activeNetRoom.turnPhase === 'DRAW'
                    ? '1단계: 중앙에서 검은색 또는 흰색 패를 뽑으세요!'
                    : activeNetRoom.turnPhase === 'PLACE_JOKER'
                    ? '🃏 조커(-) 패를 삽입할 위치(+ 버튼)를 클릭하세요!'
                    : activeNetRoom.turnPhase === 'GUESS'
                    ? '2단계: 상대방의 ? 패를 눌러 숫자를 추리하세요!'
                    : '🎯 정답! 계속 추리하거나 턴을 안전하게 마치세요!'}
                </span>

                {isMyTurn && activeNetRoom.turnPhase === 'DECIDE_CONTINUE' && (
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ width: 'auto', padding: '5px 12px', fontSize: '12px' }}
                    onClick={handleNetEndTurnSafely}
                  >
                    🛡️ 턴 종료 (안전하게 패 숨기기)
                  </button>
                )}
              </div>

              {/* 내 암호 패 배열 */}
              {(() => {
                const owner = myPlayerObj || netCurrPlayer;
                const isPlacingJoker = isMyTurn && activeNetRoom.turnPhase === 'PLACE_JOKER';

                return (
                  <div className="my-hand-area">
                    <div className="my-hand-label">
                      🔐 {myPlayerObj ? '나의 암호 패' : `${owner.name}의 암호 패`} (눈 아이콘 👁️은 상대에게 공개된 패)
                    </div>
                    <div className="tiles-row my-tiles">
                      {isPlacingJoker && (
                        <button
                          type="button"
                          className="joker-insert-slot"
                          onClick={() => handleNetPlaceJoker(0)}
                        >
                          +
                        </button>
                      )}
                      {owner.hand.map((tile, idx) => {
                        const isNewlyDrawn = activeNetRoom.drawnTile?.id === tile.id;
                        return (
                          <div key={tile.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                            <div
                              className={`dv-tile my-tile ${tile.color === 'BLACK' ? 'black' : 'white'} ${
                                tile.revealed ? 'revealed-self' : ''
                              } ${isNewlyDrawn ? 'newly-drawn' : ''}`}
                            >
                              <span className="tile-val">{getTileDisplay(tile)}</span>
                              {tile.revealed && <span className="tile-eye-badge" title="공개됨">👁️</span>}
                              {isNewlyDrawn && <span className="new-tag">NEW</span>}
                            </div>

                            {isPlacingJoker && (
                              <button
                                type="button"
                                className="joker-insert-slot"
                                onClick={() => handleNetPlaceJoker(idx + 1)}
                              >
                                +
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* 추리 모달 */}
        {renderGuessModal(true)}

        {/* 레벨 클리어 모달 */}
        {activeNetRoom.status === 'LEVEL_CLEAR' && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div className="modal-trophy">👑🏆👑</div>
              <div className="congrats-banner">LEVEL {activeNetRoom.level} / 5 CLEAR!</div>
              <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
                {levelWinner ? `${levelWinner.name}님 최후의 생존 우승!` : '레벨 종료!'}
              </h2>

              <p className="modal-subtext">
                {activeNetRoom.level >= 5
                  ? '축하합니다! 최종 5레벨까지 모든 코드 해독 대결을 마쳤습니다!'
                  : roomPlayers.length + roomWaitlist.length > 4
                  ? '예약 인원이 정원(4명)을 초과하여 우승자를 제외한 인원은 교체되고 예약자가 합류합니다!'
                  : '다음 레벨에서는 턴 제한시간이 7초씩 단축되어 더욱 긴장감 넘치는 추리가 펼쳐집니다!'}
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
                      <span>{isChamp ? '최종 생존' : '코드 해독됨'}</span>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                {(amILevelWinner || amISpectator || !roomPlayers.some((p) => p.id === mySessionId)) && (
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

  // =========================================================================
  // 5. 단독게임(SOLO) SETUP / READY / PLAYING / GAME_OVER
  // =========================================================================
  const currentPlayer = players[currentPlayerIdx];
  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  return (
    <div className="dv-container" style={{ background: currentBackground }}>
      {toast && gameState === 'PLAYING' && (
        <div key={toast.id} className={`dv-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* SETUP 화면 */}
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
          <h1 className="setup-title">🕵️‍♂️ 다빈치 코드 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">🃏 조커(-) 타일 사용 설정</label>
            <div className="piece-count-selector" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <button
                type="button"
                className={`count-btn ${useJokerOption ? 'active' : ''}`}
                onClick={() => setUseJokerOption(true)}
              >
                🃏 조커 포함 (26장)
              </button>
              <button
                type="button"
                className={`count-btn ${!useJokerOption ? 'active' : ''}`}
                onClick={() => setUseJokerOption(false)}
              >
                🔢 숫자만 사용 (24장)
              </button>
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">🧭 탐정 등록 (2~4명)</label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="탐정 이름 입력 후 추가"
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
            <strong>📜 다빈치 코드 핵심 규칙:</strong>
            <ul>
              <li>모든 패는 왼쪽부터 오름차순 정렬되며, 같은 숫자면 <strong>검은색이 왼쪽</strong>입니다.</li>
              <li>중앙에서 패 1장을 뽑은 뒤, 상대의 뒤집힌 패 1장을 골라 숫자를 추리합니다.</li>
              <li>정답이면 계속 추리하거나 턴을 마칠 수 있고, 틀리면 방금 뽑은 내 패가 공개됩니다!</li>
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

      {/* READY 화면 */}
      {gameState === 'READY' && (
        <div className="order-panel">
          <div className="order-header">
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 추리 진행 순서를 정해주세요</h2>
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
            <button type="button" className="btn btn-success" onClick={startSoloGame}>
              🚀 다빈치 코드 시작!
            </button>
          </div>
        </div>
      )}

      {/* PLAYING 화면 */}
      {gameState === 'PLAYING' && currentPlayer && (
        <div className="play-wrapper compact-tablet-mode">
          {/* 기기 전달 가림막 (다른 사람에게 내 패가 보이지 않도록 보호) */}
          {soloPassScreen && (
            <div className="modal-overlay" style={{ zIndex: 300 }}>
              <div className="modal-content">
                <div style={{ fontSize: '46px', marginBottom: '8px' }}>🤫</div>
                <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>
                  다음은 [{currentPlayer.name}]님 차례입니다!
                </h2>
                <p className="modal-subtext">
                  다른 플레이어는 화면을 보지 않도록 기기를 전달해주세요.
                </p>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={() => setSoloPassScreen(false)}
                >
                  👀 {currentPlayer.name}님 화면 확인하기
                </button>
              </div>
            </div>
          )}

          <div className="game-header compact-header">
            <div className="player-status-bar">
              {players.map((p, idx) => {
                const isActive = idx === currentPlayerIdx;
                const hiddenCount = p.hand.filter((t) => !t.revealed).length;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''} ${
                      p.isEliminated ? 'eliminated' : ''
                    }`}
                    style={{ borderColor: isActive ? p.color : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong>{p.name}</strong>
                      <span className="badge-score">
                        {p.isEliminated ? '💀탈락' : `🔒${hiddenCount}장`}
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

          <div className="dv-table-board">
            <div className="dv-notice-banner">
              🕵️ {currentPlayer.name}님의 추리 차례 · 남은 중앙 덱: {deck.length}장
            </div>

            {/* 상대방 패 영역 */}
            <div className="opponents-zone">
              {players
                .filter((p) => p.id !== currentPlayer.id)
                .map((opp) => {
                  const canGuessOpp =
                    (turnPhase === 'GUESS' || turnPhase === 'DECIDE_CONTINUE') && !opp.isEliminated;

                  return (
                    <div
                      key={opp.id}
                      className={`opponent-hand-card ${opp.isEliminated ? 'eliminated' : ''}`}
                    >
                      <div className="opp-header">
                        <span className="squircle-dot mini" style={{ backgroundColor: opp.color }}>
                          {getShortName(opp.name)}
                        </span>
                        <strong>{opp.name}</strong>
                        {opp.isEliminated && <span className="elim-tag">💀 탈락</span>}
                      </div>

                      <div className="tiles-row">
                        {opp.hand.map((tile, tIdx) => {
                          const isClickable = canGuessOpp && !tile.revealed;
                          return (
                            <button
                              key={tile.id}
                              type="button"
                              disabled={!isClickable}
                              className={`dv-tile ${tile.color === 'BLACK' ? 'black' : 'white'} ${
                                tile.revealed ? 'revealed' : 'hidden'
                              } ${isClickable ? 'guessable-pulse' : ''}`}
                              onClick={() =>
                                setGuessTarget({
                                  targetPlayerId: opp.id,
                                  targetPlayerName: opp.name,
                                  tileId: tile.id,
                                  tileColor: tile.color,
                                  tileIndex: tIdx,
                                })
                              }
                            >
                              <span className="tile-val">
                                {tile.revealed ? getTileDisplay(tile) : '?'}
                              </span>
                              {tile.revealed && <span className="tile-eye-badge">👁️</span>}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* 중앙 덱 영역 */}
            <div className="center-deck-zone">
              <div className="deck-title">📦 중앙 암호 패 덱 (남은 패: {deck.length}장)</div>
              <div className="deck-buttons-row">
                {(() => {
                  const blackCount = deck.filter((t) => t.color === 'BLACK').length;
                  const whiteCount = deck.filter((t) => t.color === 'WHITE').length;
                  return (
                    <>
                      <button
                        type="button"
                        disabled={turnPhase !== 'DRAW' || blackCount === 0}
                        className={`deck-draw-btn black ${
                          turnPhase === 'DRAW' && blackCount > 0 ? 'guide-bob' : ''
                        }`}
                        onClick={() => handleSoloDrawTile('BLACK')}
                      >
                        <span className="deck-card-icon">⬛</span>
                        <div>
                          <strong>검은색 패 뽑기</strong>
                          <span>남은 수량: {blackCount}장</span>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={turnPhase !== 'DRAW' || whiteCount === 0}
                        className={`deck-draw-btn white ${
                          turnPhase === 'DRAW' && whiteCount > 0 ? 'guide-bob' : ''
                        }`}
                        onClick={() => handleSoloDrawTile('WHITE')}
                      >
                        <span className="deck-card-icon">⬜</span>
                        <div>
                          <strong>흰색 패 뽑기</strong>
                          <span>남은 수량: {whiteCount}장</span>
                        </div>
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* 하단 내 손패 도크 */}
          <div
            className="dv-bottom-dock"
            style={{ borderTop: `4px solid ${currentPlayer.color}` }}
          >
            <div className="dock-top-status">
              <span
                className="turn-owner-pill"
                style={{ backgroundColor: currentPlayer.color }}
              >
                {currentPlayer.name} ({getShortName(currentPlayer.name)})
              </span>

              <span className="step-status-badge">
                {turnPhase === 'DRAW'
                  ? '1단계: 중앙 덱에서 검은색/흰색 패 1장 뽑기'
                  : turnPhase === 'PLACE_JOKER'
                  ? '🃏 조커(-)를 삽입할 위치(+ 버튼)를 선택하세요!'
                  : turnPhase === 'GUESS'
                  ? '2단계: 상대의 ? 패를 눌러 숫자 추리하기'
                  : '🎯 정답! 계속 추리하거나 턴을 안전하게 마치세요!'}
              </span>

              {turnPhase === 'DECIDE_CONTINUE' && (
                <button
                  type="button"
                  className="btn btn-success"
                  style={{ width: 'auto', padding: '5px 12px', fontSize: '12px' }}
                  onClick={handleSoloEndTurnSafely}
                >
                  🛡️ 턴 종료 (안전하게 패 숨기기)
                </button>
              )}
            </div>

            <div className="my-hand-area">
              <div className="my-hand-label">
                🔐 나의 암호 패 (눈 아이콘 👁️은 상대에게 공개된 패입니다)
              </div>
              <div className="tiles-row my-tiles">
                {turnPhase === 'PLACE_JOKER' && (
                  <button
                    type="button"
                    className="joker-insert-slot"
                    onClick={() => handleSoloPlaceJoker(0)}
                  >
                    +
                  </button>
                )}
                {currentPlayer.hand.map((tile, idx) => {
                  const isNewlyDrawn = drawnTile?.id === tile.id;
                  return (
                    <div key={tile.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <div
                        className={`dv-tile my-tile ${tile.color === 'BLACK' ? 'black' : 'white'} ${
                          tile.revealed ? 'revealed-self' : ''
                        } ${isNewlyDrawn ? 'newly-drawn' : ''}`}
                      >
                        <span className="tile-val">{getTileDisplay(tile)}</span>
                        {tile.revealed && <span className="tile-eye-badge" title="공개됨">👁️</span>}
                        {isNewlyDrawn && <span className="new-tag">NEW</span>}
                      </div>

                      {turnPhase === 'PLACE_JOKER' && (
                        <button
                          type="button"
                          className="joker-insert-slot"
                          onClick={() => handleSoloPlaceJoker(idx + 1)}
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {renderGuessModal(false)}
        </div>
      )}

      {/* GAME_OVER 화면 */}
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
            <div className="congrats-banner">✨ MASTER DETECTIVE! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟
            </h2>
            <p className="modal-subtext">
              모든 상대의 암호를 완벽하게 해독하고 최후의 승자가 되었습니다!
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
                      {isChamp ? '최종 생존 우승' : '모든 패 공개됨'}
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