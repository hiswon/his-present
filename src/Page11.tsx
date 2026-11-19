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

type Suit = 'SPADE' | 'HEART' | 'DIAMOND' | 'CLUB';

interface PokerCard {
  id: string;
  suit: Suit;
  rank: number; // 2 ~ 14 (11:J, 12:Q, 13:K, 14:A)
  isFaceUp: boolean;
}

interface PokerPlayer {
  id: string;
  name: string;
  color: string;
  hand: PokerCard[];
  chips: number;       // 누적 보유 판돈(칩)
  wins: number;        // 누적 승수
  currentBet: number;  // 현재 베팅 라운드에서 낸 금액
  totalRoundBet: number; // 이번 판 총 베팅 금액
  isFolded: boolean;
  hasActedInRound: boolean;
}

interface WaitlistPlayer {
  id: string;
  name: string;
}

interface SpectatorPlayer {
  id: string;
  name: string;
}

interface NetPokerRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'DISCARD_OPEN' | 'PLAYING' | 'ROUND_OVER';
  players: PokerPlayer[];
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  baseTimeout: number;
  anteAmount: number;
  roundNumber: number; // 누적 판 수
  deck: PokerCard[];
  pot: number;
  currentHighestBet: number;
  currentPlayerIdx: number;
  bettingRound: number; // 1(4구) ~ 4(7구)
  turnDeadline: number | null;
  winnerId: string | null;
  lastWonPot: number;
  winningHandName: string;
  turnNotice: string; // 턴마다 리셋되는 안내 문구
  consecutiveTimeouts: number;
  waitingSince?: number | null;
}

interface HallOfFameRecord {
  id: string;
  name: string;
  scoreOrLevel: string;
  date: string;
}

interface HandEvaluation {
  rankScore: number;
  handName: string;
  tieBreakers: number[];
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
];

const PIECE_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706'];

const INITIAL_CHIPS = 10000;

function getShortName(name: string): string {
  const trimmed = name ? name.trim() : '';
  return trimmed ? trimmed.slice(0, 2) : '?';
}

function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case 'SPADE': return '♠';
    case 'HEART': return '♥';
    case 'DIAMOND': return '♦';
    case 'CLUB': return '♣';
  }
}

function getRankLabel(rank: number): string {
  if (rank === 14) return 'A';
  if (rank === 13) return 'K';
  if (rank === 12) return 'Q';
  if (rank === 11) return 'J';
  return String(rank);
}

function isRedSuit(suit: Suit): boolean {
  return suit === 'HEART' || suit === 'DIAMOND';
}

function createPokerDeck(): PokerCard[] {
  const suits: Suit[] = ['SPADE', 'HEART', 'DIAMOND', 'CLUB'];
  const deck: PokerCard[] = [];
  for (const suit of suits) {
    for (let r = 2; r <= 14; r++) {
      deck.push({
        id: `${suit}-${r}`,
        suit,
        rank: r,
        isFaceUp: false,
      });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

/**
 * 7포커 족보 판정 함수 (7장 중 최고 5장 조합 평가)
 */
function evaluateSevenCardHand(cards: PokerCard[]): HandEvaluation {
  if (!cards || cards.length === 0) {
    return { rankScore: 0, handName: '하이카드', tieBreakers: [0] };
  }

  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const rankCounts = new Map<number, number>();
  const suitGroups = new Map<Suit, PokerCard[]>();

  for (const c of sorted) {
    rankCounts.set(c.rank, (rankCounts.get(c.rank) || 0) + 1);
    const arr = suitGroups.get(c.suit) || [];
    arr.push(c);
    suitGroups.set(c.suit, arr);
  }

  // 플러시 및 스트레이트 플러시 체크
  let flushCards: PokerCard[] | null = null;
  for (const [, group] of suitGroups.entries()) {
    if (group.length >= 5) {
      flushCards = group.sort((a, b) => b.rank - a.rank);
      break;
    }
  }

  const getStraightHigh = (cardList: PokerCard[]): number | null => {
    const uniqueRanks = Array.from(new Set(cardList.map((c) => c.rank))).sort((a, b) => b - a);
    if (uniqueRanks.includes(14)) uniqueRanks.push(1); // 백스트레이트(A-2-3-4-5)
    for (let i = 0; i <= uniqueRanks.length - 5; i++) {
      if (
        uniqueRanks[i] - 1 === uniqueRanks[i + 1] &&
        uniqueRanks[i] - 2 === uniqueRanks[i + 2] &&
        uniqueRanks[i] - 3 === uniqueRanks[i + 3] &&
        uniqueRanks[i] - 4 === uniqueRanks[i + 4]
      ) {
        return uniqueRanks[i] === 5 && uniqueRanks[i + 4] === 1 ? 5 : uniqueRanks[i];
      }
    }
    return null;
  };

  if (flushCards) {
    const sfHigh = getStraightHigh(flushCards);
    if (sfHigh !== null) {
      if (sfHigh === 14) {
        return { rankScore: 9, handName: '👑 로열 스트레이트 플러시', tieBreakers: [14] };
      }
      return { rankScore: 8, handName: `🔥 스트레이트 플러시 (${getRankLabel(sfHigh)} 탑)`, tieBreakers: [sfHigh] };
    }
  }

  // 같은 숫자 그룹 분석
  const groups = Array.from(rankCounts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return b[0] - a[0];
  });

  // 포카드
  if (groups[0][1] === 4) {
    const quadRank = groups[0][0];
    const kicker = groups.find((g) => g[0] !== quadRank)?.[0] || 0;
    return {
      rankScore: 7,
      handName: `💎 포카드 (${getRankLabel(quadRank)})`,
      tieBreakers: [quadRank, kicker],
    };
  }

  // 풀하우스
  if (groups[0][1] === 3 && groups.length > 1 && groups[1][1] >= 2) {
    const tripRank = groups[0][0];
    const pairRank = groups[1][0];
    return {
      rankScore: 6,
      handName: `🏠 풀하우스 (${getRankLabel(tripRank)} 풀 ${getRankLabel(pairRank)})`,
      tieBreakers: [tripRank, pairRank],
    };
  }

  // 플러시
  if (flushCards) {
    const top5 = flushCards.slice(0, 5).map((c) => c.rank);
    return {
      rankScore: 5,
      handName: `♠️ 플러시 (${getRankLabel(top5[0])} 탑)`,
      tieBreakers: top5,
    };
  }

  // 스트레이트
  const straightHigh = getStraightHigh(sorted);
  if (straightHigh !== null) {
    return {
      rankScore: 4,
      handName: `📈 스트레이트 (${getRankLabel(straightHigh)} 탑)`,
      tieBreakers: [straightHigh],
    };
  }

  // 트리플
  if (groups[0][1] === 3) {
    const tripRank = groups[0][0];
    const kickers = groups.filter((g) => g[0] !== tripRank).slice(0, 2).map((g) => g[0]);
    return {
      rankScore: 3,
      handName: `🔱 트리플 (${getRankLabel(tripRank)})`,
      tieBreakers: [tripRank, ...kickers],
    };
  }

  // 투페어
  if (groups[0][1] === 2 && groups.length > 1 && groups[1][1] === 2) {
    const highPair = groups[0][0];
    const lowPair = groups[1][0];
    const kicker = groups.find((g) => g[0] !== highPair && g[0] !== lowPair)?.[0] || 0;
    return {
      rankScore: 2,
      handName: `✌️ 투페어 (${getRankLabel(highPair)}, ${getRankLabel(lowPair)})`,
      tieBreakers: [highPair, lowPair, kicker],
    };
  }

  // 원페어
  if (groups[0][1] === 2) {
    const pairRank = groups[0][0];
    const kickers = groups.filter((g) => g[0] !== pairRank).slice(0, 3).map((g) => g[0]);
    return {
      rankScore: 1,
      handName: `☝️ 원페어 (${getRankLabel(pairRank)})`,
      tieBreakers: [pairRank, ...kickers],
    };
  }

  // 하이카드
  const top5 = sorted.slice(0, 5).map((c) => c.rank);
  return {
    rankScore: 0,
    handName: `🃏 하이카드 (${getRankLabel(top5[0])} 탑)`,
    tieBreakers: top5,
  };
}

function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.rankScore !== b.rankScore) return a.rankScore - b.rankScore;
  const len = Math.max(a.tieBreakers.length, b.tieBreakers.length);
  for (let i = 0; i < len; i++) {
    const av = a.tieBreakers[i] || 0;
    const bv = b.tieBreakers[i] || 0;
    if (av !== bv) return av - bv;
  }
  return 0;
}

/**
 * 오픈된 카드를 기준으로 베팅 선(우선권) 플레이어 인덱스 산출
 */
function getFirstBetterIdx(players: PokerPlayer[]): number {
  let bestIdx = 0;
  let bestEval: HandEvaluation | null = null;

  players.forEach((p, idx) => {
    if (p.isFolded) return;
    const openCards = p.hand.filter((c) => c.isFaceUp);
    const ev = evaluateSevenCardHand(openCards.length > 0 ? openCards : p.hand);
    if (!bestEval || compareHands(ev, bestEval) > 0) {
      bestEval = ev;
      bestIdx = idx;
    }
  });

  return bestIdx;
}

function getNextActivePlayerIdx(players: PokerPlayer[], currentIdx: number): number {
  const len = players.length;
  for (let i = 1; i <= len; i++) {
    const nextIdx = (currentIdx + i) % len;
    if (!players[nextIdx].isFolded) {
      return nextIdx;
    }
  }
  return currentIdx;
}

function createDefaultPokerRoom(roomId: number): NetPokerRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    waitlist: [],
    spectators: [],
    baseTimeout: 30,
    anteAmount: 200,
    roundNumber: 1,
    deck: [],
    pot: 0,
    currentHighestBet: 0,
    currentPlayerIdx: 0,
    bettingRound: 1,
    turnDeadline: null,
    winnerId: null,
    lastWonPot: 0,
    winningHandName: '',
    turnNotice: '',
    consecutiveTimeouts: 0,
    waitingSince: null,
  };
}

export default function Page11() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('sevenpoker_net_uid');
    if (saved) return saved;
    const generated = `poker_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('sevenpoker_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetPokerRoomData[]>([1, 2, 3, 4].map(createDefaultPokerRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetPokerRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);

  // 넷게임 4장 중 버릴 카드 / 오픈할 카드 임시 선택 상태
  const [netDiscardIdx, setNetDiscardIdx] = useState<number | null>(null);

  // 단독게임(SOLO) 상태
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'DISCARD_OPEN' | 'PLAYING' | 'ROUND_OVER'>('SETUP');
  const [players, setPlayers] = useState<PokerPlayer[]>([
    {
      id: '1',
      name: '타짜',
      color: PIECE_COLORS[0],
      hand: [],
      chips: INITIAL_CHIPS,
      wins: 0,
      currentBet: 0,
      totalRoundBet: 0,
      isFolded: false,
      hasActedInRound: false,
    },
    {
      id: '2',
      name: '고니',
      color: PIECE_COLORS[1],
      hand: [],
      chips: INITIAL_CHIPS,
      wins: 0,
      currentBet: 0,
      totalRoundBet: 0,
      isFolded: false,
      hasActedInRound: false,
    },
  ]);
  const [inputName, setInputName] = useState('');
  const [anteOption, setAnteOption] = useState<number>(200);
  const [soloPassScreen, setSoloPassScreen] = useState<boolean>(false);
  const [soloDiscardIdx, setSoloDiscardIdx] = useState<number | null>(null);
  const [soloRoundNum, setSoloRoundNum] = useState<number>(1);

  const [deck, setDeck] = useState<PokerCard[]>([]);
  const [pot, setPot] = useState<number>(0);
  const [currentHighestBet, setCurrentHighestBet] = useState<number>(0);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [bettingRound, setBettingRound] = useState<number>(1);
  const [turnNotice, setTurnNotice] = useState<string>('');
  const [roundWinner, setRoundWinner] = useState<{
    player: PokerPlayer;
    wonPot: number;
    handName: string;
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

  const playSound = (kind: 'deal' | 'bet' | 'fold' | 'win') => {
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
        deal: [440, 587.33],
        bet: [523.25, 659.25],
        fold: [311.13, 220.0],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'fold' ? 'sawtooth' : 'triangle';
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
    const key = type === 'SOLO' ? 'sevenpoker_hof_solo' : 'sevenpoker_hof_net';
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
    const key = type === 'SOLO' ? 'sevenpoker_hof_solo' : 'sevenpoker_hof_net';
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
        const roomRef = ref(db, `sevenpoker_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultPokerRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'sevenpoker_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const loadedRooms: NetPokerRoomData[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultPokerRoom(id);
        if (!rData) return def;
        return {
          ...def,
          ...rData,
          players: (rData.players || []).map((p: PokerPlayer) => ({
            ...p,
            hand: p.hand || [],
            chips: typeof p.chips === 'number' ? p.chips : INITIAL_CHIPS,
            wins: typeof p.wins === 'number' ? p.wins : 0,
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
          const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);
          await set(roomRef, createDefaultPokerRoom(activeNetRoom.roomId));
          showToast('⏳ 대기 시간이 7분을 초과하여 방이 자동으로 초기화되었습니다.', 'info');
          setSelectedRoomId(null);
          setAppMode('NET_LOBBY');
          return;
        }
      }

      if (
        (activeNetRoom.status === 'PLAYING' || activeNetRoom.status === 'DISCARD_OPEN') &&
        activeNetRoom.turnDeadline
      ) {
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

    const roomRef = ref(db, `sevenpoker_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetPokerRoomData = roomData || createDefaultPokerRoom(joinModalRoom.roomId);
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
          const newPlayer: PokerPlayer = {
            id: mySessionId,
            name: trimmedName,
            color: PIECE_COLORS[idx],
            hand: [],
            chips: INITIAL_CHIPS,
            wins: 0,
            currentBet: 0,
            totalRoundBet: 0,
            isFolded: false,
            hasActedInRound: false,
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
        showToast('⏳ 현재 게임 중이거나 만석이어서 다음 판 예약자로 등록되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateRoomSettings = async (newAnte: number, newTimeout: number) => {
    if (!activeNetRoom) return;
    const clampedTimeout = Math.min(60, Math.max(15, newTimeout));
    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      anteAmount: newAnte,
      baseTimeout: clampedTimeout,
      waitingSince: Date.now(),
    });
  };

  /**
   * 7포커 새 판 시작 시 초기 4장 배분 및 기본 판돈(Ante) 징수
   * (기존 플레이어의 누적 chips와 wins는 그대로 보존!)
   */
  const dealInitialFourCards = (
    rawPlayers: PokerPlayer[],
    ante: number
  ): { initializedPlayers: PokerPlayer[]; remainingDeck: PokerCard[]; initialPot: number } => {
    const fullDeck = createPokerDeck();
    let cursor = 0;
    let initialPot = 0;

    const initializedPlayers = rawPlayers.map((p, idx) => {
      const drawn = fullDeck.slice(cursor, cursor + 4).map((c) => ({ ...c, isFaceUp: false }));
      cursor += 4;
      const baseChips = p.chips > 0 ? p.chips : INITIAL_CHIPS; // 파산 시 리필
      const paidAnte = Math.min(baseChips, ante);
      initialPot += paidAnte;

      return {
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        hand: drawn,
        chips: baseChips - paidAnte,
        wins: p.wins || 0,
        currentBet: 0,
        totalRoundBet: paidAnte,
        isFolded: false,
        hasActedInRound: false,
      };
    });

    return {
      initializedPlayers,
      remainingDeck: fullDeck.slice(cursor),
      initialPot,
    };
  };

  const handleStartNetGameFromLobby = async () => {
    if (!activeNetRoom) return;
    const currentPlayers = activeNetRoom.players || [];
    if (currentPlayers.length < 2) {
      showToast('최소 2명 이상 모여야 게임을 시작할 수 있습니다!', 'info');
      return;
    }

    const { initializedPlayers, remainingDeck, initialPot } = dealInitialFourCards(
      currentPlayers,
      activeNetRoom.anteAmount
    );

    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      status: 'DISCARD_OPEN',
      roundNumber: 1,
      players: initializedPlayers,
      deck: remainingDeck,
      pot: initialPot,
      currentHighestBet: 0,
      currentPlayerIdx: 0,
      bettingRound: 1,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      winnerId: null,
      lastWonPot: 0,
      winningHandName: '',
      turnNotice: `🃏 [1라운드] 4장 중 버릴 카드 1장과 공개할 카드 1장을 선택하세요!`,
      consecutiveTimeouts: 0,
      waitingSince: null,
    });
    setNetDiscardIdx(null);
  };

  /**
   * [요구사항 1] 다음 게임으로 넘어갈 때 기존 판돈(chips)과 승수(wins) 누적 유지
   */
  const handleStartNextNetRound = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetPokerRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];

      const nextRound = (room.roundNumber || 1) + 1;
      const currentPlayers = [...room.players];
      const waitlist = [...room.waitlist];

      let nextParticipants: PokerPlayer[] = [];
      let remainingWaitlist: WaitlistPlayer[] = [];

      if (currentPlayers.length + waitlist.length <= 4) {
        const convertedWaiters: PokerPlayer[] = waitlist.map((w) => ({
          id: w.id,
          name: w.name,
          color: PIECE_COLORS[0],
          hand: [],
          chips: INITIAL_CHIPS,
          wins: 0,
          currentBet: 0,
          totalRoundBet: 0,
          isFolded: false,
          hasActedInRound: false,
        }));
        nextParticipants = [...currentPlayers, ...convertedWaiters];
        remainingWaitlist = [];
      } else {
        // 정원 초과 시 이전 판 승자를 우선 유지하고 대기자를 합류
        const champion = currentPlayers.find((p) => p.id === room.winnerId);
        const retained = champion ? [champion] : currentPlayers.slice(0, 1);
        const slotsAvailable = 4 - retained.length;
        const promotedWaiters: PokerPlayer[] = waitlist.slice(0, slotsAvailable).map((w) => ({
          id: w.id,
          name: w.name,
          color: PIECE_COLORS[0],
          hand: [],
          chips: INITIAL_CHIPS,
          wins: 0,
          currentBet: 0,
          totalRoundBet: 0,
          isFolded: false,
          hasActedInRound: false,
        }));
        nextParticipants = [...retained, ...promotedWaiters];
        remainingWaitlist = waitlist.slice(slotsAvailable);
      }

      if (nextParticipants.length < 2) {
        room.status = nextParticipants.length === 0 ? 'EMPTY' : 'WAITING';
        room.roundNumber = nextRound;
        room.players = nextParticipants;
        room.waitlist = remainingWaitlist;
        room.winnerId = null;
        room.turnDeadline = null;
        room.turnNotice = '';
        room.waitingSince = nextParticipants.length > 0 ? Date.now() : null;
        return room;
      }

      // 기존 플레이어들의 chips와 wins는 그대로 보존하면서 새 패 배분
      const { initializedPlayers, remainingDeck, initialPot } = dealInitialFourCards(
        nextParticipants,
        room.anteAmount
      );

      room.status = 'DISCARD_OPEN';
      room.roundNumber = nextRound;
      room.players = initializedPlayers;
      room.waitlist = remainingWaitlist;
      room.deck = remainingDeck;
      room.pot = initialPot;
      room.currentHighestBet = 0;
      room.currentPlayerIdx = 0;
      room.bettingRound = 1;
      room.turnDeadline = Date.now() + room.baseTimeout * 1000;
      room.winnerId = null;
      room.lastWonPot = 0;
      room.winningHandName = '';
      // [요구사항 2] 새 라운드 시작 시 안내 문구 리셋
      room.turnNotice = `🔥 [${nextRound}라운드] 4장 중 버릴 카드 1장과 오픈할 카드 1장을 선택하세요!`;
      room.consecutiveTimeouts = 0;
      room.waitingSince = null;

      return room;
    });

    setNetDiscardIdx(null);
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }

    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetPokerRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];
      if (!room.spectators) room.spectators = [];

      const filteredPlayers = room.players.filter((p) => p.id !== mySessionId);
      const filteredWaitlist = room.waitlist.filter((w) => w.id !== mySessionId);
      const filteredSpectators = room.spectators.filter((s) => s.id !== mySessionId);

      if (filteredPlayers.length === 0 && filteredSpectators.length === 0) {
        return createDefaultPokerRoom(room.roomId);
      }

      if (room.status === 'PLAYING' || room.status === 'DISCARD_OPEN') {
        const activePlayers = filteredPlayers.filter((p) => !p.isFolded);
        if (activePlayers.length <= 1) {
          if (activePlayers.length === 1) {
            const champ = activePlayers[0];
            const wonPot = room.pot;
            room.players = filteredPlayers.map((p) =>
              p.id === champ.id
                ? { ...p, chips: p.chips + wonPot, wins: (p.wins || 0) + 1 }
                : p
            );
            room.status = 'ROUND_OVER';
            room.winnerId = champ.id;
            room.lastWonPot = wonPot;
            room.winningHandName = '상대방 퇴장 기권승';
            room.pot = 0;
            room.turnDeadline = null;
            room.turnNotice = '';
            room.waitlist = filteredWaitlist;
            room.spectators = filteredSpectators;
            return room;
          }
          return createDefaultPokerRoom(room.roomId);
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

    setNetDiscardIdx(null);
    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  /**
   * 넷게임 4장 중 버리기(1장) + 오픈(1장) 확정
   */
  const handleNetConfirmDiscardAndOpen = async (openIdx: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'DISCARD_OPEN' || netDiscardIdx === null) return;
    if (netDiscardIdx === openIdx) return;

    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetPokerRoomData;
      if (room.status !== 'DISCARD_OPEN') return room;

      const pIdx = room.players.findIndex((p) => p.id === mySessionId);
      if (pIdx === -1) return room;

      const player = room.players[pIdx];
      if (player.hand.length !== 4) return room; // 이미 선택 완료됨

      const remaining3: PokerCard[] = [];
      player.hand.forEach((card, idx) => {
        if (idx === netDiscardIdx) return; // 버림
        remaining3.push({
          ...card,
          isFaceUp: idx === openIdx, // 선택한 1장 오픈, 나머지 2장 히든
        });
      });

      room.players[pIdx] = {
        ...player,
        hand: remaining3,
      };

      // 모든 플레이어가 3장 세팅을 완료했는지 확인
      const allReady = room.players.every((p) => p.hand.length === 3);
      if (allReady) {
        // 4번째 카드(구)를 모든 플레이어에게 오픈 상태로 1장씩 배분
        const deckCopy = [...(room.deck || [])];
        room.players = room.players.map((p) => {
          const fourthCard = deckCopy.shift();
          return {
            ...p,
            hand: fourthCard ? [...p.hand, { ...fourthCard, isFaceUp: true }] : p.hand,
            currentBet: 0,
            hasActedInRound: false,
          };
        });

        const firstIdx = getFirstBetterIdx(room.players);
        const firstPlayer = room.players[firstIdx];

        room.deck = deckCopy;
        room.status = 'PLAYING';
        room.bettingRound = 1; // 4구 베팅
        room.currentHighestBet = 0;
        room.currentPlayerIdx = firstIdx;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        // [요구사항 2] 턴 전환 시 새로운 턴 안내로 리셋
        room.turnNotice = `🎯 [4구 베팅] ${firstPlayer.name}님의 차례입니다.`;
      }

      return room;
    });

    setNetDiscardIdx(null);
  };

  /**
   * 넷게임 베팅 액션 (CHECK, CALL, RAISE, FOLD)
   */
  const handleNetBetAction = async (action: 'CHECK' | 'CALL' | 'RAISE' | 'FOLD', raiseExtra = 0) => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;
    const playersArr = activeNetRoom.players || [];
    const currIdx = activeNetRoom.currentPlayerIdx % playersArr.length;
    const currP = playersArr[currIdx];
    if (!currP || currP.id !== mySessionId) {
      showToast('지금은 내 베팅 차례가 아닙니다!', 'info');
      return;
    }

    const roomRef = ref(db, `sevenpoker_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetPokerRoomData;
      if (room.status !== 'PLAYING') return room;

      const idx = room.currentPlayerIdx % room.players.length;
      const actor = room.players[idx];
      if (!actor || actor.id !== mySessionId) return room;

      const callNeeded = Math.max(0, room.currentHighestBet - actor.currentBet);

      if (action === 'FOLD') {
        playSound('fold');
        room.players[idx] = {
          ...actor,
          isFolded: true,
          hasActedInRound: true,
        };
      } else if (action === 'CHECK') {
        if (callNeeded > 0) return room; // 콜 금액이 있으면 체크 불가
        playSound('bet');
        room.players[idx] = {
          ...actor,
          hasActedInRound: true,
        };
      } else if (action === 'CALL') {
        const pay = Math.min(actor.chips, callNeeded);
        playSound('bet');
        room.players[idx] = {
          ...actor,
          chips: actor.chips - pay,
          currentBet: actor.currentBet + pay,
          totalRoundBet: actor.totalRoundBet + pay,
          hasActedInRound: true,
        };
        room.pot += pay;
      } else if (action === 'RAISE') {
        const totalPay = Math.min(actor.chips, callNeeded + raiseExtra);
        const newBetLevel = actor.currentBet + totalPay;
        playSound('bet');
        room.players[idx] = {
          ...actor,
          chips: actor.chips - totalPay,
          currentBet: newBetLevel,
          totalRoundBet: actor.totalRoundBet + totalPay,
          hasActedInRound: true,
        };
        room.pot += totalPay;
        if (newBetLevel > room.currentHighestBet) {
          room.currentHighestBet = newBetLevel;
          // 레이즈가 발생하면 다른 생존 플레이어들도 다시 액션해야 함
          room.players = room.players.map((p, pIdx) =>
            pIdx === idx || p.isFolded ? p : { ...p, hasActedInRound: false }
          );
        }
      }

      room.consecutiveTimeouts = 0;

      // 1) 생존자가 1명만 남았는지 확인 (기권승)
      const alivePlayers = room.players.filter((p) => !p.isFolded);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        const wonPot = room.pot;
        // 모든 카드 공개 처리하여 결과 확인 가능하게 함
        room.players = room.players.map((p) => {
          const revealedHand = p.hand.map((c) => ({ ...c, isFaceUp: true }));
          if (p.id === champ.id) {
            return {
              ...p,
              hand: revealedHand,
              chips: p.chips + wonPot,
              wins: (p.wins || 0) + 1,
            };
          }
          return { ...p, hand: revealedHand };
        });
        room.status = 'ROUND_OVER';
        room.winnerId = champ.id;
        room.lastWonPot = wonPot;
        room.winningHandName = '상대방 전원 다이(기권승)';
        room.pot = 0;
        room.turnDeadline = null;
        room.turnNotice = '';
        return room;
      }

      // 2) 현재 베팅 라운드 종료 여부 확인
      const isBettingRoundComplete = alivePlayers.every(
        (p) => p.hasActedInRound && (p.currentBet === room.currentHighestBet || p.chips === 0)
      );

      if (!isBettingRoundComplete) {
        // 다음 생존 플레이어로 턴 이동 & [요구사항 2] 안내 문구 새 턴으로 리셋
        const nextIdx = getNextActivePlayerIdx(room.players, idx);
        const nextPlayer = room.players[nextIdx];
        room.currentPlayerIdx = nextIdx;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        room.turnNotice = `🎯 [${room.bettingRound + 3}구 베팅] ${nextPlayer.name}님의 베팅 차례입니다.`;
        return room;
      }

      // 3) 베팅 라운드 완료 -> 다음 카드 배분 또는 최종 쇼다운
      if (room.bettingRound < 4) {
        const nextBettingRound = room.bettingRound + 1;
        const isFinalSeventhCard = nextBettingRound === 4; // 7구 마지막 카드는 히든(비공개) 배분
        const deckCopy = [...(room.deck || [])];

        room.players = room.players.map((p) => {
          if (p.isFolded) return { ...p, currentBet: 0, hasActedInRound: false };
          const drawnCard = deckCopy.shift();
          return {
            ...p,
            hand: drawnCard
              ? [...p.hand, { ...drawnCard, isFaceUp: !isFinalSeventhCard }]
              : p.hand,
            currentBet: 0,
            hasActedInRound: false,
          };
        });

        const firstIdx = getFirstBetterIdx(room.players);
        const firstPlayer = room.players[firstIdx];

        room.deck = deckCopy;
        room.bettingRound = nextBettingRound;
        room.currentHighestBet = 0;
        room.currentPlayerIdx = firstIdx;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        // [요구사항 2] 새 구(라운드) 진입 시 안내 문구 리셋
        room.turnNotice = `🃏 [${nextBettingRound + 3}구 카드 배분 완료] ${firstPlayer.name}님부터 베팅을 시작합니다.`;
        return room;
      }

      // 4) 7구 베팅 종료 -> 최종 쇼다운 승자 결정!
      let bestPlayer = alivePlayers[0];
      let bestEval = evaluateSevenCardHand(bestPlayer.hand);

      for (let i = 1; i < alivePlayers.length; i++) {
        const candidate = alivePlayers[i];
        const candEval = evaluateSevenCardHand(candidate.hand);
        if (compareHands(candEval, bestEval) > 0) {
          bestPlayer = candidate;
          bestEval = candEval;
        }
      }

      const wonPot = room.pot;
      // 모든 플레이어의 7장 카드를 전부 앞면으로 오픈하여 결과를 살펴볼 수 있게 유지
      room.players = room.players.map((p) => {
        const revealedHand = p.hand.map((c) => ({ ...c, isFaceUp: true }));
        if (p.id === bestPlayer.id) {
          return {
            ...p,
            hand: revealedHand,
            chips: p.chips + wonPot,
            wins: (p.wins || 0) + 1,
          };
        }
        return { ...p, hand: revealedHand };
      });

      room.status = 'ROUND_OVER';
      room.winnerId = bestPlayer.id;
      room.lastWonPot = wonPot;
      room.winningHandName = bestEval.handName;
      room.pot = 0;
      room.turnDeadline = null;
      room.turnNotice = '';

      saveHallOfFameRecord('NET', {
        name: bestPlayer.name,
        scoreOrLevel: `${bestEval.handName} (+${wonPot.toLocaleString()}칩)`,
      });

      return room;
    });
  };

  const handleNetTurnTimeout = async (room: NetPokerRoomData) => {
    const roomRef = ref(db, `sevenpoker_rooms/room_${room.roomId}`);

    if (room.status === 'DISCARD_OPEN') {
      // 미선택 플레이어 자동 0번 버리고 1번 오픈 처리
      await runTransaction(roomRef, (roomData) => {
        if (!roomData) return roomData;
        const r = roomData as NetPokerRoomData;
        if (r.status !== 'DISCARD_OPEN') return r;

        r.players = r.players.map((p) => {
          if (p.hand.length !== 4) return p;
          return {
            ...p,
            hand: [
              { ...p.hand[1], isFaceUp: true },
              { ...p.hand[2], isFaceUp: false },
              { ...p.hand[3], isFaceUp: false },
            ],
          };
        });

        const deckCopy = [...(r.deck || [])];
        r.players = r.players.map((p) => {
          const fourthCard = deckCopy.shift();
          return {
            ...p,
            hand: fourthCard ? [...p.hand, { ...fourthCard, isFaceUp: true }] : p.hand,
            currentBet: 0,
            hasActedInRound: false,
          };
        });

        const firstIdx = getFirstBetterIdx(r.players);
        r.deck = deckCopy;
        r.status = 'PLAYING';
        r.bettingRound = 1;
        r.currentHighestBet = 0;
        r.currentPlayerIdx = firstIdx;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = `⏰ 시간 초과로 자동 배분되었습니다. ${r.players[firstIdx].name}님 차례입니다.`;
        return r;
      });
      return;
    }

    // PLAYING 중 타임아웃 시 자동 체크 또는 폴드 처리
    const playersArr = room.players || [];
    const currIdx = room.currentPlayerIdx % playersArr.length;
    const timedOutPlayer = playersArr[currIdx];
    if (!timedOutPlayer) return;

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetPokerRoomData;
      if (r.status !== 'PLAYING') return r;

      const idx = r.currentPlayerIdx % r.players.length;
      const actor = r.players[idx];
      const callNeeded = Math.max(0, r.currentHighestBet - actor.currentBet);

      if (callNeeded === 0) {
        r.players[idx] = { ...actor, hasActedInRound: true };
      } else {
        r.players[idx] = { ...actor, isFolded: true, hasActedInRound: true };
      }

      const alivePlayers = r.players.filter((p) => !p.isFolded);
      if (alivePlayers.length === 1) {
        const champ = alivePlayers[0];
        const wonPot = r.pot;
        r.players = r.players.map((p) => {
          const revealedHand = p.hand.map((c) => ({ ...c, isFaceUp: true }));
          if (p.id === champ.id) {
            return { ...p, hand: revealedHand, chips: p.chips + wonPot, wins: (p.wins || 0) + 1 };
          }
          return { ...p, hand: revealedHand };
        });
        r.status = 'ROUND_OVER';
        r.winnerId = champ.id;
        r.lastWonPot = wonPot;
        r.winningHandName = '상대방 시간초과 기권승';
        r.pot = 0;
        r.turnDeadline = null;
        r.turnNotice = '';
        return r;
      }

      const nextIdx = getNextActivePlayerIdx(r.players, idx);
      r.currentPlayerIdx = nextIdx;
      r.turnDeadline = Date.now() + r.baseTimeout * 1000;
      // [요구사항 2] 다음 턴 안내로 리셋
      r.turnNotice = `🎯 [${r.bettingRound + 3}구 베팅] ${r.players[nextIdx].name}님의 베팅 차례입니다.`;
      return r;
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
        chips: INITIAL_CHIPS,
        wins: 0,
        currentBet: 0,
        totalRoundBet: 0,
        isFolded: false,
        hasActedInRound: false,
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
      showToast('최소 2명 이상의 플레이어를 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startSoloRound = (isNextRound = false) => {
    const { initializedPlayers, remainingDeck, initialPot } = dealInitialFourCards(
      players,
      anteOption
    );
    const nextRoundNum = isNextRound ? soloRoundNum + 1 : 1;
    setSoloRoundNum(nextRoundNum);
    setPlayers(initializedPlayers);
    setDeck(remainingDeck);
    setPot(initialPot);
    setCurrentHighestBet(0);
    setCurrentPlayerIdx(0);
    setBettingRound(1);
    setSoloDiscardIdx(null);
    setRoundWinner(null);
    setTurnNotice(`🃏 [${nextRoundNum}라운드] 4장 중 버릴 카드 1장과 오픈할 카드 1장을 고르세요!`);
    setSoloPassScreen(true);
    setGameState('DISCARD_OPEN');
  };

  const handleSoloConfirmDiscardAndOpen = (openIdx: number) => {
    if (gameState !== 'DISCARD_OPEN' || soloDiscardIdx === null || soloDiscardIdx === openIdx) return;

    const currP = players[currentPlayerIdx];
    const remaining3: PokerCard[] = [];
    currP.hand.forEach((card, idx) => {
      if (idx === soloDiscardIdx) return;
      remaining3.push({ ...card, isFaceUp: idx === openIdx });
    });

    const updatedPlayers = players.map((p, idx) =>
      idx === currentPlayerIdx ? { ...p, hand: remaining3 } : p
    );

    setSoloDiscardIdx(null);

    if (currentPlayerIdx + 1 < updatedPlayers.length) {
      const nextIdx = currentPlayerIdx + 1;
      setPlayers(updatedPlayers);
      setCurrentPlayerIdx(nextIdx);
      setTurnNotice(`🃏 ${updatedPlayers[nextIdx].name}님, 버릴 카드와 오픈할 카드를 고르세요!`);
      setSoloPassScreen(true);
      return;
    }

    // 전원 선택 완료 -> 4구 카드 오픈 배분 후 베팅 시작
    const deckCopy = [...deck];
    const fourCardPlayers = updatedPlayers.map((p) => {
      const fourth = deckCopy.shift();
      return {
        ...p,
        hand: fourth ? [...p.hand, { ...fourth, isFaceUp: true }] : p.hand,
        currentBet: 0,
        hasActedInRound: false,
      };
    });

    const firstIdx = getFirstBetterIdx(fourCardPlayers);
    setDeck(deckCopy);
    setPlayers(fourCardPlayers);
    setCurrentPlayerIdx(firstIdx);
    setBettingRound(1);
    setCurrentHighestBet(0);
    // [요구사항 2] 턴 전환 시 안내 문구 리셋
    setTurnNotice(`🎯 [4구 베팅] ${fourCardPlayers[firstIdx].name}님의 베팅 차례입니다.`);
    setSoloPassScreen(true);
    setGameState('PLAYING');
  };

  const handleSoloBetAction = (action: 'CHECK' | 'CALL' | 'RAISE' | 'FOLD', raiseExtra = 0) => {
    if (gameState !== 'PLAYING') return;
    const actor = players[currentPlayerIdx];
    const callNeeded = Math.max(0, currentHighestBet - actor.currentBet);

    let nextPlayers = [...players];
    let nextPot = pot;
    let nextHighestBet = currentHighestBet;

    if (action === 'FOLD') {
      playSound('fold');
      nextPlayers[currentPlayerIdx] = { ...actor, isFolded: true, hasActedInRound: true };
    } else if (action === 'CHECK') {
      if (callNeeded > 0) return;
      playSound('bet');
      nextPlayers[currentPlayerIdx] = { ...actor, hasActedInRound: true };
    } else if (action === 'CALL') {
      const pay = Math.min(actor.chips, callNeeded);
      playSound('bet');
      nextPlayers[currentPlayerIdx] = {
        ...actor,
        chips: actor.chips - pay,
        currentBet: actor.currentBet + pay,
        totalRoundBet: actor.totalRoundBet + pay,
        hasActedInRound: true,
      };
      nextPot += pay;
    } else if (action === 'RAISE') {
      const totalPay = Math.min(actor.chips, callNeeded + raiseExtra);
      const newBetLevel = actor.currentBet + totalPay;
      playSound('bet');
      nextPlayers[currentPlayerIdx] = {
        ...actor,
        chips: actor.chips - totalPay,
        currentBet: newBetLevel,
        totalRoundBet: actor.totalRoundBet + totalPay,
        hasActedInRound: true,
      };
      nextPot += totalPay;
      if (newBetLevel > nextHighestBet) {
        nextHighestBet = newBetLevel;
        nextPlayers = nextPlayers.map((p, pIdx) =>
          pIdx === currentPlayerIdx || p.isFolded ? p : { ...p, hasActedInRound: false }
        );
      }
    }

    // 1) 기권승 체크
    const alivePlayers = nextPlayers.filter((p) => !p.isFolded);
    if (alivePlayers.length === 1) {
      const champ = alivePlayers[0];
      const revealedPlayers = nextPlayers.map((p) => {
        const allOpen = p.hand.map((c) => ({ ...c, isFaceUp: true }));
        if (p.id === champ.id) {
          return { ...p, hand: allOpen, chips: p.chips + nextPot, wins: p.wins + 1 };
        }
        return { ...p, hand: allOpen };
      });
      const updatedChamp = revealedPlayers.find((p) => p.id === champ.id)!;
      setPlayers(revealedPlayers);
      setPot(0);
      setTurnNotice('');
      setRoundWinner({
        player: updatedChamp,
        wonPot: nextPot,
        handName: '상대방 전원 다이(기권승)',
      });
      setGameState('ROUND_OVER');
      playSound('win');
      speakKorean(`축하합니다! ${champ.name}님이 ${nextPot}칩을 획득했습니다!`);
      return;
    }

    // 2) 현재 베팅 라운드 계속 진행 여부
    const isRoundComplete = alivePlayers.every(
      (p) => p.hasActedInRound && (p.currentBet === nextHighestBet || p.chips === 0)
    );

    if (!isRoundComplete) {
      const nextIdx = getNextActivePlayerIdx(nextPlayers, currentPlayerIdx);
      setPlayers(nextPlayers);
      setPot(nextPot);
      setCurrentHighestBet(nextHighestBet);
      setCurrentPlayerIdx(nextIdx);
      // [요구사항 2] 턴 변경 시 안내 문구 새 턴 안내로 리셋
      setTurnNotice(`🎯 [${bettingRound + 3}구 베팅] ${nextPlayers[nextIdx].name}님의 베팅 차례입니다.`);
      setSoloPassScreen(true);
      return;
    }

    // 3) 다음 구(5구, 6구, 7구) 카드 배분
    if (bettingRound < 4) {
      const nextBettingRound = bettingRound + 1;
      const isSeventh = nextBettingRound === 4;
      const deckCopy = [...deck];

      const dealtPlayers = nextPlayers.map((p) => {
        if (p.isFolded) return { ...p, currentBet: 0, hasActedInRound: false };
        const card = deckCopy.shift();
        return {
          ...p,
          hand: card ? [...p.hand, { ...card, isFaceUp: !isSeventh }] : p.hand,
          currentBet: 0,
          hasActedInRound: false,
        };
      });

      const firstIdx = getFirstBetterIdx(dealtPlayers);
      setDeck(deckCopy);
      setPlayers(dealtPlayers);
      setPot(nextPot);
      setBettingRound(nextBettingRound);
      setCurrentHighestBet(0);
      setCurrentPlayerIdx(firstIdx);
      // [요구사항 2] 새 라운드 시작 시 안내 문구 리셋
      setTurnNotice(`🃏 [${nextBettingRound + 3}구 카드 배분] ${dealtPlayers[firstIdx].name}님부터 베팅합니다.`);
      setSoloPassScreen(true);
      return;
    }

    // 4) 최종 쇼다운
    let bestPlayer = alivePlayers[0];
    let bestEval = evaluateSevenCardHand(bestPlayer.hand);
    for (let i = 1; i < alivePlayers.length; i++) {
      const cand = alivePlayers[i];
      const ev = evaluateSevenCardHand(cand.hand);
      if (compareHands(ev, bestEval) > 0) {
        bestPlayer = cand;
        bestEval = ev;
      }
    }

    const finalPlayers = nextPlayers.map((p) => {
      const allOpen = p.hand.map((c) => ({ ...c, isFaceUp: true }));
      if (p.id === bestPlayer.id) {
        return { ...p, hand: allOpen, chips: p.chips + nextPot, wins: p.wins + 1 };
      }
      return { ...p, hand: allOpen };
    });

    const updatedChamp = finalPlayers.find((p) => p.id === bestPlayer.id)!;
    setPlayers(finalPlayers);
    setPot(0);
    setTurnNotice('');
    setRoundWinner({
      player: updatedChamp,
      wonPot: nextPot,
      handName: bestEval.handName,
    });
    setGameState('ROUND_OVER');
    playSound('win');
    speakKorean(`축하합니다! ${bestPlayer.name}님이 ${bestEval.handName}로 승리했습니다!`);
    saveHallOfFameRecord('SOLO', {
      name: bestPlayer.name,
      scoreOrLevel: `${bestEval.handName} (+${nextPot.toLocaleString()}칩)`,
    });
  };

  // =========================================================================
  // 공용 카드 렌더링 헬퍼
  // =========================================================================
  const renderPokerCard = (
    card: PokerCard,
    visible: boolean,
    options?: {
      selectable?: boolean;
      selectedTag?: string;
      onClick?: () => void;
      mini?: boolean;
    }
  ) => {
    const red = isRedSuit(card.suit);
    return (
      <button
        key={card.id}
        type="button"
        disabled={!options?.selectable}
        onClick={options?.onClick}
        className={`pk-card ${visible ? 'face-up' : 'face-down'} ${red ? 'red' : 'black'} ${
          options?.selectable ? 'selectable' : ''
        } ${options?.selectedTag ? 'selected' : ''} ${options?.mini ? 'mini' : ''}`}
      >
        {visible ? (
          <>
            <span className="pk-card-rank">{getRankLabel(card.rank)}</span>
            <span className="pk-card-suit">{getSuitSymbol(card.suit)}</span>
            {!card.isFaceUp && <span className="pk-hidden-badge">🔒</span>}
          </>
        ) : (
          <span className="pk-card-back-pattern">🂠</span>
        )}
        {options?.selectedTag && <span className="pk-select-tag">{options.selectedTag}</span>}
      </button>
    );
  };

  // =========================================================================
  // 1. 홈 화면 (HOME)
  // =========================================================================
  if (appMode === 'HOME') {
    return (
      <div className="pk-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">♠️♥️♦️♣️</div>
          <h1 className="setup-title">7포커 (SEVEN-CARD STUD)</h1>
          <p className="home-subtitle">4구에서 7구까지 심리전과 베팅으로 판돈을 석권하라!</p>

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
              <span className="mode-desc">한 기기를 돌려가며 2~4명 포커 대결</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 방 실시간 대전 · 승수/판돈 누적</span>
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
      <div className="pk-container" style={{ background: PLAYER_BG_COLORS[0], padding: '16px' }}>
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
      <div className="pk-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="net-lobby-container">
          <div className="net-lobby-header">
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
              🌐 7포커 넷게임 (4개 테이블)
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
              const isPlaying =
                room.status === 'PLAYING' ||
                room.status === 'DISCARD_OPEN' ||
                room.status === 'ROUND_OVER';
              const isFull = roomPlayers.length >= 4;

              let statusBadgeText = '🟢 빈 테이블';
              let statusClass = 'empty';
              if (isPlaying) {
                statusBadgeText = `🔥 ${room.roundNumber}판째 진행중`;
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
                    <span className="room-number-title">♠️ 제 {room.roomId} 포커룸</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>💰 기본 판돈(Ante): {room.anteAmount.toLocaleString()}칩</span>
                    <span>⏱️ 턴 제한: {room.baseTimeout}초</span>
                  </div>

                  <div className="room-members-box">
                    <div className="room-members-label">참가자 ({roomPlayers.length}/4):</div>
                    <div className="room-members-chips">
                      {roomPlayers.length === 0 ? (
                        <span className="empty-member-text">첫 번째 승부사를 기다리고 있습니다</span>
                      ) : (
                        roomPlayers.map((p, idx) => (
                          <span
                            key={p.id}
                            className="member-chip"
                            style={{ borderColor: PIECE_COLORS[idx] }}
                          >
                            <i style={{ backgroundColor: PIECE_COLORS[idx] }} />
                            {p.name} ({p.wins || 0}승 · {(p.chips ?? INITIAL_CHIPS).toLocaleString()})
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
                      ⏳ 다음 판 예약 ({roomWaitlist.length}명):{' '}
                      {roomWaitlist.map((w) => w.name).join(', ')}
                    </div>
                  )}

                  <div className="room-enter-cta">
                    {isEmpty
                      ? '👉 클릭하여 테이블 열기 또는 관망하기'
                      : isPlaying || isFull
                      ? '👉 클릭하여 다음 판 예약 또는 관망하기'
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
              <h2 style={{ margin: '0 0 8px' }}>♠️ 제 {joinModalRoom.roomId} 포커룸 입장</h2>
              <p className="modal-subtext">
                이름을 입력하고 승부에 참가하거나, <strong>관망모드</strong>로 패를 구경하세요!
              </p>

              <input
                type="text"
                className="player-input"
                style={{ width: '100%', boxSizing: 'border-box', marginBottom: '14px' }}
                placeholder="내 이름 입력 (예: 타짜)"
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
        <div className="pk-container" style={{ background: PLAYER_BG_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
        <div className="pk-container" style={{ background: PLAYER_BG_COLORS[0] }}>
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
              ♠️ 7포커 대기실 (승수 · 판돈 누적전) {amISpectator ? '👀 [관망모드]' : ''}
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                💰 기본 참가 판돈(Ante) 설정 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[100, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    disabled={!isHost}
                    className={`count-btn ${activeNetRoom.anteAmount === val ? 'active' : ''}`}
                    onClick={() => updateRoomSettings(val, activeNetRoom.baseTimeout)}
                  >
                    {val}칩
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 베팅 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong> {isHost ? '(방장 설정 가능)' : ''}
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
                    updateRoomSettings(activeNetRoom.anteAmount, Number(e.target.value))
                  }
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>60초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🧭 입장한 플레이어 (초기 판돈 {INITIAL_CHIPS.toLocaleString()}칩 지급)</label>
              <div className="player-list">
                {roomPlayers.map((p, idx) => (
                  <div key={p.id} className="player-item">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="squircle-dot" style={{ backgroundColor: PIECE_COLORS[idx] }}>
                        {getShortName(p.name)}
                      </span>
                      {p.name} {idx === 0 && '👑(방장)'} {p.id === mySessionId && '(나)'}
                    </span>
                    <span style={{ fontSize: '12px', color: '#059669' }}>
                      {p.wins || 0}승 · {(p.chips ?? INITIAL_CHIPS).toLocaleString()}칩
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-success"
              disabled={roomPlayers.length < 2}
              onClick={handleStartNetGameFromLobby}
            >
              🚀 7포커 게임 시작! ({roomPlayers.length}/4명)
            </button>
          </div>
        </div>
      );
    }

    // 4-B. 넷게임 플레이 화면
    const netCurrIdx = (activeNetRoom.currentPlayerIdx || 0) % roomPlayers.length;
    const netCurrPlayer = roomPlayers[netCurrIdx];
    const isMyTurn =
      activeNetRoom.status === 'PLAYING' && netCurrPlayer?.id === mySessionId && !amISpectator;
    const myPlayerObj = roomPlayers.find((p) => p.id === mySessionId);
    const opponents = roomPlayers.filter((p) => p.id !== (myPlayerObj ? mySessionId : netCurrPlayer?.id));

    const roundWinnerPlayer = roomPlayers.find((p) => p.id === activeNetRoom.winnerId);
    const callAmountNeeded =
      myPlayerObj ? Math.max(0, activeNetRoom.currentHighestBet - myPlayerObj.currentBet) : 0;

    return (
      <div
        className="pk-container"
        style={{ background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length] }}
      >
        {toast && (
          <div key={toast.id} className={`pk-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          {/* 상단 상태바: 누적 승수 & 보유 판돈 표시 */}
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">
                {activeNetRoom.roundNumber}판째 {amISpectator ? '👀[관망]' : ''}
              </span>
              {activeNetRoom.status !== 'ROUND_OVER' && (
                <span className={`net-timer-badge ${remainingSeconds <= 7 ? 'urgent' : ''}`}>
                  ⏱️ {remainingSeconds}초
                </span>
              )}
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p, idx) => {
                const isActive = activeNetRoom.status === 'PLAYING' && idx === netCurrIdx;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active' : ''} ${
                      p.isFolded ? 'eliminated' : ''
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
                      <span className="win-count-pill">🏆{p.wins || 0}승</span>
                      <span className="badge-score">
                        💰{(p.chips ?? 0).toLocaleString()}
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

          {(amIWaitlisted || roomWaitlist.length > 0) && !amISpectator && (
            <div className="net-waitlist-strip">
              {amIWaitlisted
                ? '⏳ 현재 다음 판 예약 대기 중입니다! 이번 판이 끝나면 자동으로 참가됩니다.'
                : `⏳ 다음 판 예약자 (${roomWaitlist.length}명): ${roomWaitlist.map((w) => w.name).join(', ')}`}
            </div>
          )}

          {/* 중앙 포커 테이블 */}
          <div className="pk-table-board">
            {/* [요구사항 3] 최종 승자 결정 시 카드를 가리지 않고 상단에 축하 배너 + 승수/판돈 표시 */}
            {activeNetRoom.status === 'ROUND_OVER' && roundWinnerPlayer ? (
              <div className="winner-celebration-top-bar">
                <div className="winner-celebrate-title">
                  🎊🎉 축하합니다! <strong>{roundWinnerPlayer.name}</strong>님 최종 승리! 🎉🎊
                </div>
                <div className="winner-celebrate-stats">
                  <span className="stat-chip">🃏 족보: {activeNetRoom.winningHandName}</span>
                  <span className="stat-chip">
                    💰 획득 판돈: +{(activeNetRoom.lastWonPot || 0).toLocaleString()}칩 (보유:{' '}
                    {roundWinnerPlayer.chips.toLocaleString()}칩)
                  </span>
                  <span className="stat-chip">
                    🏆 누적 승수: {roundWinnerPlayer.wins}승
                  </span>
                </div>
                <div className="winner-celebrate-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                    onClick={handleLeaveNetRoom}
                  >
                    🚪 방 나가기
                  </button>
                  <button
                    type="button"
                    className="btn btn-success"
                    style={{ width: 'auto', padding: '6px 18px', fontSize: '14px' }}
                    onClick={handleStartNextNetRound}
                  >
                    🔥 다음 게임 시작 (승수·판돈 누적)
                  </button>
                </div>
              </div>
            ) : (
              /* [요구사항 2] 턴이 바뀔 때마다 새로 리셋되는 상단 안내 배너 */
              <div className="pk-notice-banner">
                {activeNetRoom.turnNotice}
              </div>
            )}

            {/* 중앙 총 판돈(POT) 표시 */}
            {activeNetRoom.status !== 'ROUND_OVER' && (
              <div className="center-pot-box">
                <span className="pot-label">💰 현재 총 판돈 (POT)</span>
                <strong className="pot-amount">{(activeNetRoom.pot || 0).toLocaleString()} 칩</strong>
                {activeNetRoom.currentHighestBet > 0 && (
                  <span className="highest-bet-tag">
                    현재 콜 기준액: {activeNetRoom.currentHighestBet.toLocaleString()}칩
                  </span>
                )}
              </div>
            )}

            {/* 상대방 카드 영역 (ROUND_OVER 시 모든 카드가 오픈되어 결과 확인 가능) */}
            <div className="opponents-zone">
              {opponents.map((opp) => {
                const isRoundOver = activeNetRoom.status === 'ROUND_OVER';
                const handEval = isRoundOver ? evaluateSevenCardHand(opp.hand) : null;

                return (
                  <div
                    key={opp.id}
                    className={`opponent-hand-card ${opp.isFolded ? 'eliminated' : ''} ${
                      opp.id === activeNetRoom.winnerId ? 'winner-highlight-card' : ''
                    }`}
                  >
                    <div className="opp-header">
                      <span className="squircle-dot mini" style={{ backgroundColor: opp.color }}>
                        {getShortName(opp.name)}
                      </span>
                      <strong>{opp.name}</strong>
                      <span className="opp-stat-mini">
                        🏆{opp.wins || 0}승 · 💰{opp.chips.toLocaleString()}
                      </span>
                      {opp.isFolded && <span className="elim-tag">🏳️ 다이(폴드)</span>}
                      {isRoundOver && handEval && (
                        <span className="result-hand-badge">{handEval.handName}</span>
                      )}
                    </div>

                    <div className="cards-row">
                      {opp.hand.map((card) => {
                        const canSee = card.isFaceUp || amISpectator || isRoundOver;
                        return renderPokerCard(card, canSee, { mini: true });
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 내 손패 및 액션 도크 */}
          {(myPlayerObj || netCurrPlayer) && (
            <div
              className="pk-bottom-dock"
              style={{ borderTop: `4px solid ${(myPlayerObj || netCurrPlayer).color}` }}
            >
              {(() => {
                const owner = myPlayerObj || netCurrPlayer;
                const isRoundOver = activeNetRoom.status === 'ROUND_OVER';
                const myEval = evaluateSevenCardHand(owner.hand);

                return (
                  <>
                    <div className="dock-top-status">
                      <span
                        className="turn-owner-pill"
                        style={{ backgroundColor: owner.color }}
                      >
                        {owner.name} · 🏆{owner.wins || 0}승 · 💰{owner.chips.toLocaleString()}칩
                      </span>

                      <span className="step-status-badge">
                        {isRoundOver
                          ? `최종 족보: ${myEval.handName}`
                          : activeNetRoom.status === 'DISCARD_OPEN'
                          ? owner.hand.length === 4
                            ? netDiscardIdx === null
                              ? '1단계: 4장 중 버릴 카드 1장을 클릭하세요'
                              : '2단계: 나머지 3장 중 오픈할 카드 1장을 클릭하세요'
                            : '⏳ 다른 플레이어의 선택을 기다리는 중...'
                          : isMyTurn
                          ? `내 족보: ${myEval.handName} | 베팅을 선택하세요!`
                          : amISpectator
                          ? '👀 관망모드 실시간 관전 중'
                          : `${netCurrPlayer?.name}님의 베팅을 기다리는 중...`}
                      </span>
                    </div>

                    {/* 내 카드 배열 */}
                    <div className="my-hand-area">
                      <div className="cards-row my-cards">
                        {owner.hand.map((card, idx) => {
                          const isSelectingDiscardOpen =
                            activeNetRoom.status === 'DISCARD_OPEN' &&
                            myPlayerObj &&
                            owner.hand.length === 4 &&
                            !amISpectator;

                          let selectedTag: string | undefined;
                          if (isSelectingDiscardOpen && netDiscardIdx === idx) {
                            selectedTag = '🗑️ 버림';
                          }

                          return renderPokerCard(card, true, {
                            selectable: Boolean(isSelectingDiscardOpen),
                            selectedTag,
                            onClick: () => {
                              if (!isSelectingDiscardOpen) return;
                              if (netDiscardIdx === null) {
                                setNetDiscardIdx(idx);
                              } else if (netDiscardIdx === idx) {
                                setNetDiscardIdx(null);
                              } else {
                                handleNetConfirmDiscardAndOpen(idx);
                              }
                            },
                          });
                        })}
                      </div>
                    </div>

                    {/* 베팅 버튼 그룹 */}
                    {isMyTurn && !owner.isFolded && (
                      <div className="betting-controls-row">
                        <button
                          type="button"
                          className="bet-btn fold"
                          onClick={() => handleNetBetAction('FOLD')}
                        >
                          🏳️ 다이 (폴드)
                        </button>

                        {callAmountNeeded === 0 ? (
                          <button
                            type="button"
                            className="bet-btn check"
                            onClick={() => handleNetBetAction('CHECK')}
                          >
                            ✋ 체크 (0칩)
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="bet-btn call"
                            onClick={() => handleNetBetAction('CALL')}
                          >
                            📞 콜 ({Math.min(owner.chips, callAmountNeeded).toLocaleString()}칩)
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={owner.chips <= callAmountNeeded}
                          className="bet-btn raise"
                          onClick={() => handleNetBetAction('RAISE', activeNetRoom.anteAmount)}
                        >
                          🔥 레이즈 (+{activeNetRoom.anteAmount}칩)
                        </button>

                        <button
                          type="button"
                          disabled={owner.chips <= callAmountNeeded}
                          className="bet-btn raise-big"
                          onClick={() => handleNetBetAction('RAISE', activeNetRoom.anteAmount * 3)}
                        >
                          🚀 빅 레이즈 (+{activeNetRoom.anteAmount * 3}칩)
                        </button>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. 단독게임(SOLO) SETUP / READY / DISCARD_OPEN / PLAYING / ROUND_OVER
  // =========================================================================
  const currentPlayer = players[currentPlayerIdx];
  const currentBackground =
    (gameState === 'PLAYING' || gameState === 'DISCARD_OPEN') && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  return (
    <div className="pk-container" style={{ background: currentBackground }}>
      {toast && (
        <div key={toast.id} className={`pk-toast ${toast.type}`}>
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
          <h1 className="setup-title">♠️ 7포커 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">💰 기본 판돈(Ante) 설정 (초기 지급 10,000칩)</label>
            <div className="piece-count-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[100, 200, 500].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`count-btn ${anteOption === val ? 'active' : ''}`}
                  onClick={() => setAnteOption(val)}
                >
                  {val}칩
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">🧭 플레이어 등록 (2~4명)</label>
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
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 진행 순서를 정해주세요</h2>
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
            <button type="button" className="btn btn-success" onClick={() => startSoloRound(false)}>
              🚀 7포커 시작!
            </button>
          </div>
        </div>
      )}

      {/* DISCARD_OPEN / PLAYING / ROUND_OVER 화면 */}
      {(gameState === 'DISCARD_OPEN' || gameState === 'PLAYING' || gameState === 'ROUND_OVER') &&
        currentPlayer && (
          <div className="play-wrapper compact-tablet-mode">
            {soloPassScreen && gameState !== 'ROUND_OVER' && (
              <div className="modal-overlay" style={{ zIndex: 300 }}>
                <div className="modal-content">
                  <div style={{ fontSize: '46px', marginBottom: '8px' }}>🤫</div>
                  <h2 style={{ margin: '0 0 8px', color: '#0f172a' }}>
                    다음은 [{currentPlayer.name}]님 차례입니다!
                  </h2>
                  <p className="modal-subtext">
                    다른 플레이어는 히든 카드를 보지 않도록 기기를 전달해주세요.
                  </p>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => setSoloPassScreen(false)}
                  >
                    👀 {currentPlayer.name}님 카드 확인하기
                  </button>
                </div>
              </div>
            )}

            <div className="game-header compact-header">
              <div className="player-status-bar">
                {players.map((p, idx) => {
                  const isActive = gameState !== 'ROUND_OVER' && idx === currentPlayerIdx;
                  return (
                    <div
                      key={p.id}
                      className={`player-badge-card ${isActive ? 'active' : ''} ${
                        p.isFolded ? 'eliminated' : ''
                      }`}
                      style={{ borderColor: isActive ? p.color : 'transparent' }}
                    >
                      <div className="player-badge-top">
                        <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                          {getShortName(p.name)}
                        </span>
                        <strong>{p.name}</strong>
                        <span className="win-count-pill">🏆{p.wins}승</span>
                        <span className="badge-score">💰{p.chips.toLocaleString()}</span>
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

            <div className="pk-table-board">
              {/* [요구사항 3] 최종 승자 결정 시 카드를 가리지 않고 상단에 축하 배너 + 승수/판돈 표시 */}
              {gameState === 'ROUND_OVER' && roundWinner ? (
                <div className="winner-celebration-top-bar">
                  <div className="winner-celebrate-title">
                    🎊🎉 축하합니다! <strong>{roundWinner.player.name}</strong>님 최종 승리! 🎉🎊
                  </div>
                  <div className="winner-celebrate-stats">
                    <span className="stat-chip">🃏 족보: {roundWinner.handName}</span>
                    <span className="stat-chip">
                      💰 획득 판돈: +{roundWinner.wonPot.toLocaleString()}칩 (보유:{' '}
                      {roundWinner.player.chips.toLocaleString()}칩)
                    </span>
                    <span className="stat-chip">🏆 누적 승수: {roundWinner.player.wins}승</span>
                  </div>
                  <div className="winner-celebrate-actions">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ padding: '6px 14px', fontSize: '13px' }}
                      onClick={() => setGameState('SETUP')}
                    >
                      ⚙️ 설정 변경
                    </button>
                    <button
                      type="button"
                      className="btn btn-success"
                      style={{ width: 'auto', padding: '6px 18px', fontSize: '14px' }}
                      onClick={() => startSoloRound(true)}
                    >
                      🔥 다음 게임 시작 (승수·판돈 누적)
                    </button>
                  </div>
                </div>
              ) : (
                /* [요구사항 2] 턴 변경 시 리셋되는 상단 안내 문구 */
                <div className="pk-notice-banner">{turnNotice}</div>
              )}

              {gameState !== 'ROUND_OVER' && (
                <div className="center-pot-box">
                  <span className="pot-label">💰 현재 총 판돈 (POT)</span>
                  <strong className="pot-amount">{pot.toLocaleString()} 칩</strong>
                  {currentHighestBet > 0 && (
                    <span className="highest-bet-tag">
                      현재 콜 기준액: {currentHighestBet.toLocaleString()}칩
                    </span>
                  )}
                </div>
              )}

              <div className="opponents-zone">
                {players
                  .filter((p) => p.id !== currentPlayer.id)
                  .map((opp) => {
                    const isRoundOver = gameState === 'ROUND_OVER';
                    const handEval = isRoundOver ? evaluateSevenCardHand(opp.hand) : null;
                    return (
                      <div
                        key={opp.id}
                        className={`opponent-hand-card ${opp.isFolded ? 'eliminated' : ''} ${
                          roundWinner?.player.id === opp.id ? 'winner-highlight-card' : ''
                        }`}
                      >
                        <div className="opp-header">
                          <span className="squircle-dot mini" style={{ backgroundColor: opp.color }}>
                            {getShortName(opp.name)}
                          </span>
                          <strong>{opp.name}</strong>
                          <span className="opp-stat-mini">
                            🏆{opp.wins}승 · 💰{opp.chips.toLocaleString()}
                          </span>
                          {opp.isFolded && <span className="elim-tag">🏳️ 다이</span>}
                          {isRoundOver && handEval && (
                            <span className="result-hand-badge">{handEval.handName}</span>
                          )}
                        </div>

                        <div className="cards-row">
                          {opp.hand.map((card) =>
                            renderPokerCard(card, card.isFaceUp || isRoundOver, { mini: true })
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>

            {/* 하단 현재 플레이어 손패 도크 */}
            <div
              className="pk-bottom-dock"
              style={{ borderTop: `4px solid ${currentPlayer.color}` }}
            >
              <div className="dock-top-status">
                <span
                  className="turn-owner-pill"
                  style={{ backgroundColor: currentPlayer.color }}
                >
                  {currentPlayer.name} · 🏆{currentPlayer.wins}승 · 💰{currentPlayer.chips.toLocaleString()}칩
                </span>

                <span className="step-status-badge">
                  {gameState === 'ROUND_OVER'
                    ? `최종 족보: ${evaluateSevenCardHand(currentPlayer.hand).handName}`
                    : gameState === 'DISCARD_OPEN'
                    ? soloDiscardIdx === null
                      ? '1단계: 버릴 카드 1장을 클릭하세요'
                      : '2단계: 나머지 중 오픈할 카드 1장을 클릭하세요'
                    : `내 족보: ${evaluateSevenCardHand(currentPlayer.hand).handName}`}
                </span>
              </div>

              <div className="my-hand-area">
                <div className="cards-row my-cards">
                  {currentPlayer.hand.map((card, idx) => {
                    const isSelecting = gameState === 'DISCARD_OPEN';
                    const selectedTag = isSelecting && soloDiscardIdx === idx ? '🗑️ 버림' : undefined;
                    return renderPokerCard(card, true, {
                      selectable: isSelecting,
                      selectedTag,
                      onClick: () => {
                        if (!isSelecting) return;
                        if (soloDiscardIdx === null) {
                          setSoloDiscardIdx(idx);
                        } else if (soloDiscardIdx === idx) {
                          setSoloDiscardIdx(null);
                        } else {
                          handleSoloConfirmDiscardAndOpen(idx);
                        }
                      },
                    });
                  })}
                </div>
              </div>

              {gameState === 'PLAYING' && !currentPlayer.isFolded && (
                <div className="betting-controls-row">
                  <button
                    type="button"
                    className="bet-btn fold"
                    onClick={() => handleSoloBetAction('FOLD')}
                  >
                    🏳️ 다이 (폴드)
                  </button>

                  {Math.max(0, currentHighestBet - currentPlayer.currentBet) === 0 ? (
                    <button
                      type="button"
                      className="bet-btn check"
                      onClick={() => handleSoloBetAction('CHECK')}
                    >
                      ✋ 체크 (0칩)
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="bet-btn call"
                      onClick={() => handleSoloBetAction('CALL')}
                    >
                      📞 콜 (
                      {Math.min(
                        currentPlayer.chips,
                        currentHighestBet - currentPlayer.currentBet
                      ).toLocaleString()}
                      칩)
                    </button>
                  )}

                  <button
                    type="button"
                    disabled={
                      currentPlayer.chips <=
                      Math.max(0, currentHighestBet - currentPlayer.currentBet)
                    }
                    className="bet-btn raise"
                    onClick={() => handleSoloBetAction('RAISE', anteOption)}
                  >
                    🔥 레이즈 (+{anteOption}칩)
                  </button>

                  <button
                    type="button"
                    disabled={
                      currentPlayer.chips <=
                      Math.max(0, currentHighestBet - currentPlayer.currentBet)
                    }
                    className="bet-btn raise-big"
                    onClick={() => handleSoloBetAction('RAISE', anteOption * 3)}
                  >
                    🚀 빅 레이즈 (+{anteOption * 3}칩)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}