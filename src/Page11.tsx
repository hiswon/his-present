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

interface BlackjackCard {
  id: string;
  suit: Suit;
  rank: number; // 2 ~ 14 (11:J, 12:Q, 13:K, 14:A)
  isFaceUp: boolean;
}

type PlayerRoundResult = 'NONE' | 'WIN' | 'BLACKJACK_WIN' | 'LOSE' | 'BUST' | 'PUSH';

interface BlackjackPlayer {
  id: string;
  name: string;
  color: string;
  hand: BlackjackCard[];
  chips: number;
  wins: number;
  currentBet: number;
  hasPlacedBet: boolean;
  isStanding: boolean;
  isBusted: boolean;
  isBlackjack: boolean;
  roundResult: PlayerRoundResult;
}

interface WaitlistPlayer {
  id: string;
  name: string;
}

interface SpectatorPlayer {
  id: string;
  name: string;
}

interface NetBlackjackRoomData {
  roomId: number;
  status: 'EMPTY' | 'WAITING' | 'BETTING' | 'PLAYING' | 'ROUND_OVER';
  players: BlackjackPlayer[];
  pot: number;
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  baseTimeout: number;
  minBet: number;
  roundNumber: number;
  deck: BlackjackCard[];
  currentPlayerIdx: number;
  turnDeadline: number | null;
  turnNotice: string;
  winnerAnnouncement: string;
  winnersList: string[];
  waitingSince?: number | null;
}

interface HallOfFameRecord {
  id: string;
  name: string;
  scoreOrLevel: string;
  date: string;
}

interface ChipFlyEffect {
  id: number;
  playerName: string;
  amount: number;
  color: string;
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
];

const PIECE_COLORS = ['#dc2626', '#2563eb', '#059669', '#d97706'];
const INITIAL_CHIPS = 10000;
const DEFAULT_TIMEOUT_SEC = 120;

const SITUATION_LINES = {
  BET_START: (round: number) => [
    `${round}라운드가 시작되었습니다! 행운을 걸고 칩을 베팅해 주세요.`,
    `새 판이 열렸습니다! 승부사 여러분, 베팅할 칩을 올려주세요.`,
    `${round}번째 승부! 원하는 만큼 칩을 베팅하고 카드를 받으세요.`,
  ],
  BET_PLACED: (name: string, amount: number) => [
    `${name}님이 ${amount.toLocaleString()}칩을 과감하게 베팅했습니다!`,
    `찰칵! ${name}님이 ${amount.toLocaleString()}칩을 테이블에 올렸습니다.`,
    `${name}님의 베팅 ${amount.toLocaleString()}칩! 좋은 패가 들어올까요?`,
  ],
  PLAYER_TURN: (name: string) => [
    `${name}님 차례입니다! 카드를 더 받으시겠습니까?`,
    `지금은 ${name}님의 턴입니다. 히트할까요, 스탠드할까요?`,
    `${name}님, 신중하게 선택하세요!`,
  ],
  HIT: (name: string) => [
    `${name}님 히트! 카드를 한 장 더 받았습니다.`,
    `승부수를 띄우는 ${name}님!`,
    `${name}님이 카드를 추가했습니다.`,
  ],
  STAND: (name: string) => [
    `${name}님이 멈추고 스탠드를 선언했습니다.`,
    `안전을 택한 ${name}님! 다음 순서를 기다립니다.`,
    `${name}님 스탠드입니다.`,
  ],
  DOUBLE: (name: string) => [
    `와우! ${name}님의 더블 다운! 판돈을 두 배로 올렸습니다!`,
    `${name}님이 승부수를 던졌습니다! 더블입니다!`,
  ],
  BUST: (name: string, score: number) => [
    `아이고! ${name}님 ${score}점으로 21점을 초과해 버스트되었습니다!`,
    `아쉽습니다! ${name}님 버스트(${score}점)로 이번 판은 아웃입니다.`,
  ],
};

function pickRandomLine(lines: string[]): string {
  return lines[Math.floor(Math.random() * lines.length)];
}

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

function createBlackjackShoe(deckCount = 4): BlackjackCard[] {
  const suits: Suit[] = ['SPADE', 'HEART', 'DIAMOND', 'CLUB'];
  const shoe: BlackjackCard[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const suit of suits) {
      for (let r = 2; r <= 14; r++) {
        shoe.push({
          id: `d${d}-${suit}-${r}-${Math.random().toString(36).slice(2, 6)}`,
          suit,
          rank: r,
          isFaceUp: true,
        });
      }
    }
  }
  return shoe.sort(() => Math.random() - 0.5);
}

function calculateBlackjackScore(cards: BlackjackCard[]): {
  score: number;
  isSoft: boolean;
  isBlackjack: boolean;
} {
  let total = 0;
  let aceCount = 0;

  for (const c of cards) {
    if (c.rank === 14) {
      total += 11;
      aceCount += 1;
    } else if (c.rank >= 11) {
      total += 10;
    } else {
      total += c.rank;
    }
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  const isBlackjack = cards.length === 2 && total === 21;
  return {
    score: total,
    isSoft: aceCount > 0,
    isBlackjack,
  };
}

/**
 * [단독게임 전용] 딜러와 플레이어 간 대결 정산
 */
function settleSoloWithDealer(
  players: BlackjackPlayer[],
  dealerHand: BlackjackCard[],
  deck: BlackjackCard[]
): {
  settledPlayers: BlackjackPlayer[];
  finalDealerHand: BlackjackCard[];
  remainingDeck: BlackjackCard[];
  winners: string[];
  announcement: string;
} {
  const deckCopy = [...deck];
  const revealedDealer = dealerHand.map((c) => ({ ...c, isFaceUp: true }));

  const anyAliveNonBlackjack = players.some((p) => !p.isBusted && !p.isBlackjack);
  if (anyAliveNonBlackjack) {
    while (calculateBlackjackScore(revealedDealer).score < 17 && deckCopy.length > 0) {
      const drawn = deckCopy.shift()!;
      revealedDealer.push({ ...drawn, isFaceUp: true });
    }
  }

  const dealerEval = calculateBlackjackScore(revealedDealer);
  const dealerBust = dealerEval.score > 21;
  const winners: string[] = [];

  const settledPlayers = players.map((p) => {
    const pEval = calculateBlackjackScore(p.hand);
    let result: PlayerRoundResult = 'LOSE';
    let payout = 0;
    let winAdd = 0;

    if (p.isBusted || pEval.score > 21) {
      result = 'BUST';
      payout = 0;
    } else if (p.isBlackjack && !dealerEval.isBlackjack) {
      result = 'BLACKJACK_WIN';
      payout = Math.floor(p.currentBet * 2.5);
      winAdd = 1;
      winners.push(p.name);
    } else if (dealerEval.isBlackjack && !p.isBlackjack) {
      result = 'LOSE';
      payout = 0;
    } else if (dealerBust || pEval.score > dealerEval.score) {
      result = 'WIN';
      payout = p.currentBet * 2;
      winAdd = 1;
      winners.push(p.name);
    } else if (pEval.score === dealerEval.score) {
      result = 'PUSH';
      payout = p.currentBet;
    } else {
      result = 'LOSE';
      payout = 0;
    }

    return {
      ...p,
      hand: p.hand.map((c) => ({ ...c, isFaceUp: true })),
      chips: p.chips + payout,
      wins: (p.wins || 0) + winAdd,
      roundResult: result,
    };
  });

  let announcement = '';
  if (winners.length > 0) {
    announcement = `🎊 ${winners.join(', ')}님이 이겼습니다! 축하합니다! (딜러 ${
      dealerBust ? '버스트' : `${dealerEval.score}점`
    })`;
  } else if (settledPlayers.some((p) => p.roundResult === 'PUSH')) {
    announcement = `🤝 무승부(푸시)입니다! 베팅한 칩을 돌려받았습니다. (딜러 ${dealerEval.score}점)`;
  } else {
    announcement = `🎩 딜러(${dealerEval.score}점)의 승리입니다! 다음 판에 도전하세요!`;
  }

  return {
    settledPlayers,
    finalDealerHand: revealedDealer,
    remainingDeck: deckCopy,
    winners,
    announcement,
  };
}

/**
 * [넷게임 전용] 딜러 없이 플레이어 간 직접 승부 정산
 */
function settleNetPlayersOnly(
  players: BlackjackPlayer[],
  totalPot: number
): {
  settledPlayers: BlackjackPlayer[];
  winners: string[];
  announcement: string;
} {
  const validPlayers = players.filter((p) => {
    const score = calculateBlackjackScore(p.hand).score;
    return !p.isBusted && score <= 21;
  });

  if (validPlayers.length === 0) {
    // 전원 버스트 시 판돈은 다음 라운드 또는 균등 분배 대신 이월 처리
    const settledPlayers = players.map((p) => ({
      ...p,
      hand: p.hand.map((c) => ({ ...c, isFaceUp: true })),
      roundResult: 'BUST' as PlayerRoundResult,
    }));
    return {
      settledPlayers,
      winners: [],
      announcement: `💥 참가자 전원 21점을 초과(버스트)했습니다! 판돈 ${totalPot.toLocaleString()}칩이 다음 판으로 이월됩니다.`,
    };
  }

  let highestScore = -1;
  for (const vp of validPlayers) {
    const sc = calculateBlackjackScore(vp.hand).score;
    if (sc > highestScore) {
      highestScore = sc;
    }
  }

  const topPlayers = validPlayers.filter(
    (vp) => calculateBlackjackScore(vp.hand).score === highestScore
  );
  const winners = topPlayers.map((tp) => tp.name);
  const prizePerWinner = Math.floor(totalPot / topPlayers.length);

  const settledPlayers = players.map((p) => {
    const sc = calculateBlackjackScore(p.hand).score;
    const isTop = !p.isBusted && sc === highestScore;
    if (isTop) {
      return {
        ...p,
        hand: p.hand.map((c) => ({ ...c, isFaceUp: true })),
        chips: p.chips + prizePerWinner,
        wins: (p.wins || 0) + 1,
        roundResult: (p.isBlackjack ? 'BLACKJACK_WIN' : 'WIN') as PlayerRoundResult,
      };
    }
    return {
      ...p,
      hand: p.hand.map((c) => ({ ...c, isFaceUp: true })),
      roundResult: (p.isBusted || sc > 21 ? 'BUST' : 'LOSE') as PlayerRoundResult,
    };
  });

  const announcement = `🎊 ${winners.join(', ')}님이 이겼습니다! 축하합니다! (${highestScore}점 · +${prizePerWinner.toLocaleString()}칩)`;
  return {
    settledPlayers,
    winners,
    announcement,
  };
}

function createDefaultBlackjackRoom(roomId: number): NetBlackjackRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    pot: 0,
    waitlist: [],
    spectators: [],
    baseTimeout: DEFAULT_TIMEOUT_SEC,
    minBet: 200,
    roundNumber: 1,
    deck: [],
    currentPlayerIdx: 0,
    turnDeadline: null,
    turnNotice: '',
    winnerAnnouncement: '',
    winnersList: [],
    waitingSince: null,
  };
}

export default function Page11() {
  const [appMode, setAppMode] = useState<'HOME' | 'SOLO' | 'NET_LOBBY' | 'NET_ROOM' | 'HALL_OF_FAME'>('HOME');

  const [mySessionId] = useState<string>(() => {
    const saved = sessionStorage.getItem('blackjack_net_uid');
    if (saved) return saved;
    const generated = `bj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem('blackjack_net_uid', generated);
    return generated;
  });

  // 넷게임 상태
  const [rooms, setRooms] = useState<NetBlackjackRoomData[]>([1, 2, 3, 4].map(createDefaultBlackjackRoom));
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [joinModalRoom, setJoinModalRoom] = useState<NetBlackjackRoomData | null>(null);
  const [joinPlayerName, setJoinPlayerName] = useState<string>('');
  const [remainingSeconds, setRemainingSeconds] = useState<number>(DEFAULT_TIMEOUT_SEC);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);
  const lastSpokenNoticeRef = useRef<string>('');
  const lastCountdownSpokenRef = useRef<number | null>(null);

  // 단독게임(SOLO) 상태
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'BETTING' | 'PLAYING' | 'ROUND_OVER'>('SETUP');
  const [players, setPlayers] = useState<BlackjackPlayer[]>([
    {
      id: '1',
      name: '타짜',
      color: PIECE_COLORS[0],
      hand: [],
      chips: INITIAL_CHIPS,
      wins: 0,
      currentBet: 0,
      hasPlacedBet: false,
      isStanding: false,
      isBusted: false,
      isBlackjack: false,
      roundResult: 'NONE',
    },
    {
      id: '2',
      name: '고니',
      color: PIECE_COLORS[1],
      hand: [],
      chips: INITIAL_CHIPS,
      wins: 0,
      currentBet: 0,
      hasPlacedBet: false,
      isStanding: false,
      isBusted: false,
      isBlackjack: false,
      roundResult: 'NONE',
    },
  ]);
  const [dealerHand, setDealerHand] = useState<BlackjackCard[]>([]);
  const [inputName, setInputName] = useState('');
  const [minBetOption, setMinBetOption] = useState<number>(200);
  const [soloTimeoutSec, setSoloTimeoutSec] = useState<number>(DEFAULT_TIMEOUT_SEC);
  const [soloRemainingSec, setSoloRemainingSec] = useState<number>(DEFAULT_TIMEOUT_SEC);
  const [soloRoundNum, setSoloRoundNum] = useState<number>(1);
  const [soloSelectedBet, setSoloSelectedBet] = useState<number>(200);
  const [netSelectedBet, setNetSelectedBet] = useState<number>(200);

  const [deck, setDeck] = useState<BlackjackCard[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [turnNotice, setTurnNotice] = useState<string>('');
  const [winnerAnnouncement, setWinnerAnnouncement] = useState<string>('');
  const [showFireworks, setShowFireworks] = useState<boolean>(false);
  const [chipFlyEffects, setChipFlyEffects] = useState<ChipFlyEffect[]>([]);

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

  const speakKorean = (text: string, interrupt = true) => {
    if (!text || !('speechSynthesis' in window)) return;
    const cleanText = text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();
    if (!cleanText) return;
    if (interrupt) {
      window.speechSynthesis.cancel();
    }
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ko-KR';
    utterance.rate = 1.1;
    utterance.pitch = 1.05;
    window.speechSynthesis.speak(utterance);
  };

  const playSound = (kind: 'deal' | 'chip' | 'bust' | 'win' | 'tick') => {
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
        deal: [480, 640],
        chip: [880, 1174.66],
        bust: [300, 210],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
        tick: [987.77],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'bust' ? 'sawtooth' : kind === 'chip' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(kind === 'tick' ? 0.18 : 0.14, ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.07);
        osc.stop(ctx.currentTime + idx * 0.07 + 0.22);
      });
    } catch {
      // 오디오 차단 예외 무시
    }
  };

  const triggerChipAnimation = (playerName: string, amount: number, color: string) => {
    playSound('chip');
    const id = Date.now() + Math.random();
    setChipFlyEffects((prev) => [...prev, { id, playerName, amount, color }]);
    window.setTimeout(() => {
      setChipFlyEffects((prev) => prev.filter((item) => item.id !== id));
    }, 1050);
  };

  const triggerFireworksCelebration = (announcementText: string) => {
    playSound('win');
    speakKorean(announcementText);
    setShowFireworks(true);
    window.setTimeout(() => {
      setShowFireworks(false);
    }, 4500);
  };

  const handleCountdownCue = (secLeft: number) => {
    if (lastCountdownSpokenRef.current === secLeft) return;
    lastCountdownSpokenRef.current = secLeft;

    if (secLeft === 10) {
      playSound('tick');
      speakKorean('10초 남았습니다.', false);
    } else if (secLeft >= 1 && secLeft <= 5) {
      playSound('tick');
      speakKorean(String(secLeft), false);
    }
  };

  const saveHallOfFameRecord = (type: 'SOLO' | 'NET', record: { name: string; scoreOrLevel: string }) => {
    const key = type === 'SOLO' ? 'blackjack_hof_solo' : 'blackjack_hof_net';
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
    const key = type === 'SOLO' ? 'blackjack_hof_solo' : 'blackjack_hof_net';
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
        const roomRef = ref(db, `blackjack_rooms/room_${id}`);
        const snap = await get(roomRef);
        if (!snap.exists()) {
          await set(roomRef, createDefaultBlackjackRoom(id));
        }
      }
    };
    ensureRoomsExist();

    const roomsRef = ref(db, 'blackjack_rooms');
    const unsubscribe = onValue(roomsRef, (snapshot) => {
      const data = snapshot.val();
      if (!data) return;

      const loadedRooms: NetBlackjackRoomData[] = [1, 2, 3, 4].map((id) => {
        const rData = data[`room_${id}`];
        const def = createDefaultBlackjackRoom(id);
        if (!rData) return def;
        return {
          ...def,
          ...rData,
          players: (rData.players || []).map((p: BlackjackPlayer) => ({
            ...p,
            hand: p.hand || [],
            chips: typeof p.chips === 'number' ? p.chips : INITIAL_CHIPS,
            wins: typeof p.wins === 'number' ? p.wins : 0,
          })),
          pot: typeof rData.pot === 'number' ? rData.pot : 0,
          waitlist: rData.waitlist || [],
          spectators: rData.spectators || [],
          deck: rData.deck || [],
          winnersList: rData.winnersList || [],
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

  useEffect(() => {
    if (appMode !== 'NET_ROOM' || !activeNetRoom) return;

    if (
      activeNetRoom.status === 'ROUND_OVER' &&
      activeNetRoom.winnerAnnouncement &&
      lastSpokenNoticeRef.current !== activeNetRoom.winnerAnnouncement
    ) {
      lastSpokenNoticeRef.current = activeNetRoom.winnerAnnouncement;
      if (activeNetRoom.winnersList && activeNetRoom.winnersList.length > 0) {
        triggerFireworksCelebration(activeNetRoom.winnerAnnouncement);
      } else {
        speakKorean(activeNetRoom.winnerAnnouncement);
      }
      return;
    }

    if (
      activeNetRoom.turnNotice &&
      lastSpokenNoticeRef.current !== activeNetRoom.turnNotice
    ) {
      lastSpokenNoticeRef.current = activeNetRoom.turnNotice;
      speakKorean(activeNetRoom.turnNotice);
    }
  }, [appMode, activeNetRoom?.turnNotice, activeNetRoom?.status, activeNetRoom?.winnerAnnouncement]);

  useEffect(() => {
    if (appMode !== 'NET_ROOM' || !activeNetRoom) {
      setRemainingSeconds(DEFAULT_TIMEOUT_SEC);
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
          const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
          await set(roomRef, createDefaultBlackjackRoom(activeNetRoom.roomId));
          showToast('⏳ 대기 시간이 7분을 초과하여 방이 초기화되었습니다.', 'info');
          setSelectedRoomId(null);
          setAppMode('NET_LOBBY');
          return;
        }
      }

      if (
        (activeNetRoom.status === 'PLAYING' || activeNetRoom.status === 'BETTING') &&
        activeNetRoom.turnDeadline
      ) {
        const diff = Math.max(0, Math.ceil((activeNetRoom.turnDeadline - now) / 1000));
        setRemainingSeconds(diff);
        handleCountdownCue(diff);

        if (diff === 0 && timeoutHandledRef.current !== activeNetRoom.turnDeadline) {
          timeoutHandledRef.current = activeNetRoom.turnDeadline;
          handleNetTurnTimeout(activeNetRoom);
        }
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, [appMode, activeNetRoom]);

  useEffect(() => {
    if (appMode !== 'SOLO' || (gameState !== 'BETTING' && gameState !== 'PLAYING')) {
      return;
    }

    const timer = window.setInterval(() => {
      setSoloRemainingSec((prev) => {
        const next = Math.max(0, prev - 1);
        handleCountdownCue(next);
        if (next === 0) {
          if (gameState === 'BETTING') {
            handleSoloPlaceBet(minBetOption);
          } else if (gameState === 'PLAYING') {
            handleSoloStand();
          }
        }
        return next;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [appMode, gameState, currentPlayerIdx, soloTimeoutSec]);

  const handleEnterRoomSubmit = async (asSpectator = false) => {
    if (!joinModalRoom) return;
    const trimmedName = joinPlayerName ? joinPlayerName.trim() : '';
    if (!trimmedName) {
      alert('참가할 이름을 입력해주세요!');
      return;
    }

    const roomRef = ref(db, `blackjack_rooms/room_${joinModalRoom.roomId}`);

    try {
      let joinResultType = 'PLAYER';

      await runTransaction(roomRef, (roomData) => {
        const room: NetBlackjackRoomData = roomData || createDefaultBlackjackRoom(joinModalRoom.roomId);
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
          const newPlayer: BlackjackPlayer = {
            id: mySessionId,
            name: trimmedName,
            color: PIECE_COLORS[idx],
            hand: [],
            chips: INITIAL_CHIPS,
            wins: 0,
            currentBet: 0,
            hasPlacedBet: false,
            isStanding: false,
            isBusted: false,
            isBlackjack: false,
            roundResult: 'NONE',
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
        showToast('👀 관망모드로 입장했습니다! 패는 비공개로 보호됩니다.', 'info');
      } else if (joinResultType === 'WAITLIST') {
        showToast('⏳ 다음 판 예약자로 등록되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateRoomSettings = async (newMinBet: number, newTimeout: number) => {
    if (!activeNetRoom) return;
    const clampedTimeout = Math.min(180, Math.max(30, newTimeout));
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      minBet: newMinBet,
      baseTimeout: clampedTimeout,
      waitingSince: Date.now(),
    });
  };

  /**
   * 넷게임 라운드 시작 (딜러 없이 참가자끼리만 대결)
   */
  const handleStartNetBettingPhase = async (isNextRound = false) => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);

    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetBlackjackRoomData;
      if (!room.players) room.players = [];
      if (!room.waitlist) room.waitlist = [];

      const nextRound = isNextRound ? (room.roundNumber || 1) + 1 : 1;
      const currentPlayers = [...room.players];
      const waitlist = [...room.waitlist];

      let nextParticipants: BlackjackPlayer[] = [];
      let remainingWaitlist: WaitlistPlayer[] = [];

      if (currentPlayers.length + waitlist.length <= 4) {
        const convertedWaiters: BlackjackPlayer[] = waitlist.map((w) => ({
          id: w.id,
          name: w.name,
          color: PIECE_COLORS[0],
          hand: [],
          chips: INITIAL_CHIPS,
          wins: 0,
          currentBet: 0,
          hasPlacedBet: false,
          isStanding: false,
          isBusted: false,
          isBlackjack: false,
          roundResult: 'NONE',
        }));
        nextParticipants = [...currentPlayers, ...convertedWaiters];
      } else {
        nextParticipants = currentPlayers.slice(0, 4);
        remainingWaitlist = waitlist;
      }

      if (nextParticipants.length < 2) {
        room.status = nextParticipants.length === 0 ? 'EMPTY' : 'WAITING';
        room.players = nextParticipants;
        room.waitlist = remainingWaitlist;
        return room;
      }

      // 이전 판 전원 버스트로 이월된 판돈이 있으면 보존, 정상 종료 시 0으로 시작
      const carryOverPot =
        room.status === 'ROUND_OVER' && room.winnersList.length === 0 ? room.pot || 0 : 0;

      const resetPlayers = nextParticipants.map((p, idx) => ({
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        hand: [],
        chips: p.chips > 0 ? p.chips : INITIAL_CHIPS,
        wins: p.wins || 0,
        currentBet: 0,
        hasPlacedBet: false,
        isStanding: false,
        isBusted: false,
        isBlackjack: false,
        roundResult: 'NONE' as PlayerRoundResult,
      }));

      const freshShoe = room.deck && room.deck.length > 40 ? room.deck : createBlackjackShoe(4);

      room.status = 'BETTING';
      room.roundNumber = nextRound;
      room.players = resetPlayers;
      room.pot = carryOverPot;
      room.waitlist = remainingWaitlist;
      room.deck = freshShoe;
      room.currentPlayerIdx = 0;
      room.turnDeadline = Date.now() + room.baseTimeout * 1000;
      room.winnerAnnouncement = '';
      room.winnersList = [];
      room.turnNotice = `💰 [${nextRound}라운드 · 참가자 대전] ${pickRandomLine(
        SITUATION_LINES.BET_START(nextRound)
      )}`;
      room.waitingSince = null;

      return room;
    });

    setNetSelectedBet(activeNetRoom.minBet);
  };

  /**
   * 넷게임 베팅 확정 -> 전원 베팅 시 참가자들에게만 2장씩 배분 (딜러 없음)
   */
  const handleNetPlaceBet = async (betAmount: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'BETTING') return;
    const me = activeNetRoom.players.find((p) => p.id === mySessionId);
    if (!me || me.hasPlacedBet) return;

    const actualBet = Math.min(me.chips, Math.max(activeNetRoom.minBet, betAmount));
    triggerChipAnimation(me.name, actualBet, me.color);

    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetBlackjackRoomData;
      if (room.status !== 'BETTING') return room;

      const pIdx = room.players.findIndex((p) => p.id === mySessionId);
      if (pIdx === -1 || room.players[pIdx].hasPlacedBet) return room;

      const actor = room.players[pIdx];
      const pay = Math.min(actor.chips, Math.max(room.minBet, betAmount));

      room.players[pIdx] = {
        ...actor,
        chips: actor.chips - pay,
        currentBet: pay,
        hasPlacedBet: true,
      };
      room.pot = (room.pot || 0) + pay;

      const allBetDone = room.players.every((p) => p.hasPlacedBet);
      if (!allBetDone) {
        room.turnNotice = `🪙 ${pickRandomLine(SITUATION_LINES.BET_PLACED(actor.name, pay))}`;
        return room;
      }

      const deckCopy = [...(room.deck || createBlackjackShoe(4))];
      room.players = room.players.map((p) => {
        const c1 = { ...deckCopy.shift()!, isFaceUp: true };
        const c2 = { ...deckCopy.shift()!, isFaceUp: true };
        const hand = [c1, c2];
        const ev = calculateBlackjackScore(hand);
        return {
          ...p,
          hand,
          isBlackjack: ev.isBlackjack,
          isStanding: ev.isBlackjack,
        };
      });

      room.deck = deckCopy;

      const firstActiveIdx = room.players.findIndex((p) => !p.isStanding && !p.isBusted);
      if (firstActiveIdx === -1) {
        const settled = settleNetPlayersOnly(room.players, room.pot);
        room.players = settled.settledPlayers;
        room.pot = 0;
        room.status = 'ROUND_OVER';
        room.turnDeadline = null;
        room.turnNotice = '';
        room.winnersList = settled.winners;
        room.winnerAnnouncement = settled.announcement;
        return room;
      }

      const activeP = room.players[firstActiveIdx];
      room.status = 'PLAYING';
      room.currentPlayerIdx = firstActiveIdx;
      room.turnDeadline = Date.now() + room.baseTimeout * 1000;
      room.turnNotice = `🎯 ${pickRandomLine(SITUATION_LINES.PLAYER_TURN(activeP.name))}`;
      return room;
    });
  };

  /**
   * 넷게임 플레이어 액션: HIT / STAND / DOUBLE
   */
  const handleNetPlayAction = async (action: 'HIT' | 'STAND' | 'DOUBLE') => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;
    const currIdx = activeNetRoom.currentPlayerIdx % activeNetRoom.players.length;
    const currP = activeNetRoom.players[currIdx];
    if (!currP || currP.id !== mySessionId) return;

    if (action === 'DOUBLE') {
      triggerChipAnimation(currP.name, currP.currentBet, currP.color);
    } else if (action === 'HIT') {
      playSound('deal');
    }

    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetBlackjackRoomData;
      if (room.status !== 'PLAYING') return room;

      const idx = room.currentPlayerIdx % room.players.length;
      const actor = room.players[idx];
      if (!actor || actor.id !== mySessionId) return room;

      const deckCopy = [...(room.deck || [])];
      let actionNotice = '';

      if (action === 'HIT') {
        const drawn = { ...deckCopy.shift()!, isFaceUp: true };
        const nextHand = [...actor.hand, drawn];
        const ev = calculateBlackjackScore(nextHand);
        const busted = ev.score > 21;
        const autoStand = ev.score === 21;

        room.players[idx] = {
          ...actor,
          hand: nextHand,
          isBusted: busted,
          isStanding: busted || autoStand,
        };

        if (busted) {
          playSound('bust');
          actionNotice = `💥 ${pickRandomLine(SITUATION_LINES.BUST(actor.name, ev.score))}`;
        } else {
          actionNotice = `🃏 ${pickRandomLine(SITUATION_LINES.HIT(actor.name))}`;
        }
      } else if (action === 'STAND') {
        room.players[idx] = {
          ...actor,
          isStanding: true,
        };
        actionNotice = `✋ ${pickRandomLine(SITUATION_LINES.STAND(actor.name))}`;
      } else if (action === 'DOUBLE') {
        if (actor.hand.length !== 2 || actor.chips < actor.currentBet) return room;
        const extra = actor.currentBet;
        const drawn = { ...deckCopy.shift()!, isFaceUp: true };
        const nextHand = [...actor.hand, drawn];
        const ev = calculateBlackjackScore(nextHand);
        const busted = ev.score > 21;

        room.players[idx] = {
          ...actor,
          chips: actor.chips - extra,
          currentBet: actor.currentBet + extra,
          hand: nextHand,
          isBusted: busted,
          isStanding: true,
        };
        room.pot = (room.pot || 0) + extra;

        if (busted) {
          playSound('bust');
          actionNotice = `💥 ${pickRandomLine(SITUATION_LINES.BUST(actor.name, ev.score))}`;
        } else {
          actionNotice = `🔥 ${pickRandomLine(SITUATION_LINES.DOUBLE(actor.name))}`;
        }
      }

      room.deck = deckCopy;

      const nextIdx = room.players.findIndex((p, i) => i > idx && !p.isStanding && !p.isBusted);
      const wrapIdx =
        nextIdx !== -1
          ? nextIdx
          : room.players.findIndex((p) => !p.isStanding && !p.isBusted);

      if (wrapIdx !== -1) {
        const nextActor = room.players[wrapIdx];
        room.currentPlayerIdx = wrapIdx;
        room.turnDeadline = Date.now() + room.baseTimeout * 1000;
        room.turnNotice =
          wrapIdx === idx
            ? actionNotice
            : `🎯 ${pickRandomLine(SITUATION_LINES.PLAYER_TURN(nextActor.name))}`;
        return room;
      }

      // 참가자 전원 플레이 종료 -> 일제 공개 및 승패 정산
      const settled = settleNetPlayersOnly(room.players, room.pot || 0);
      room.players = settled.settledPlayers;
      room.pot = settled.winners.length > 0 ? 0 : room.pot;
      room.status = 'ROUND_OVER';
      room.turnDeadline = null;
      room.turnNotice = '';
      room.winnersList = settled.winners;
      room.winnerAnnouncement = settled.announcement;

      settled.settledPlayers.forEach((sp) => {
        if (sp.roundResult === 'WIN' || sp.roundResult === 'BLACKJACK_WIN') {
          saveHallOfFameRecord('NET', {
            name: sp.name,
            scoreOrLevel: `${sp.wins}승 · 보유 ${sp.chips.toLocaleString()}칩`,
          });
        }
      });

      return room;
    });
  };

  const handleNetTurnTimeout = async (room: NetBlackjackRoomData) => {
    const roomRef = ref(db, `blackjack_rooms/room_${room.roomId}`);

    if (room.status === 'BETTING') {
      await runTransaction(roomRef, (roomData) => {
        if (!roomData) return roomData;
        const r = roomData as NetBlackjackRoomData;
        if (r.status !== 'BETTING') return r;

        let addedPot = 0;
        r.players = r.players.map((p) => {
          if (p.hasPlacedBet) return p;
          const autoPay = Math.min(p.chips, r.minBet);
          addedPot += autoPay;
          return { ...p, chips: p.chips - autoPay, currentBet: autoPay, hasPlacedBet: true };
        });
        r.pot = (r.pot || 0) + addedPot;

        const deckCopy = [...(r.deck || createBlackjackShoe(4))];
        r.players = r.players.map((p) => {
          const hand = [
            { ...deckCopy.shift()!, isFaceUp: true },
            { ...deckCopy.shift()!, isFaceUp: true },
          ];
          const ev = calculateBlackjackScore(hand);
          return { ...p, hand, isBlackjack: ev.isBlackjack, isStanding: ev.isBlackjack };
        });

        r.deck = deckCopy;

        const firstIdx = r.players.findIndex((p) => !p.isStanding && !p.isBusted);
        if (firstIdx === -1) {
          const settled = settleNetPlayersOnly(r.players, r.pot || 0);
          r.players = settled.settledPlayers;
          r.pot = 0;
          r.status = 'ROUND_OVER';
          r.turnDeadline = null;
          r.turnNotice = '';
          r.winnersList = settled.winners;
          r.winnerAnnouncement = settled.announcement;
          return r;
        }

        const nextP = r.players[firstIdx];
        r.status = 'PLAYING';
        r.currentPlayerIdx = firstIdx;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = `⏰ 시간 초과로 기본 베팅이 완료되었습니다. ${nextP.name}님 차례입니다.`;
        return r;
      });
      return;
    }

    if (room.status === 'PLAYING') {
      await runTransaction(roomRef, (roomData) => {
        if (!roomData) return roomData;
        const r = roomData as NetBlackjackRoomData;
        if (r.status !== 'PLAYING') return r;

        const idx = r.currentPlayerIdx % r.players.length;
        r.players[idx] = { ...r.players[idx], isStanding: true };

        const nextIdx = r.players.findIndex((p) => !p.isStanding && !p.isBusted);
        if (nextIdx !== -1) {
          const nextP = r.players[nextIdx];
          r.currentPlayerIdx = nextIdx;
          r.turnDeadline = Date.now() + r.baseTimeout * 1000;
          r.turnNotice = `🎯 ${pickRandomLine(SITUATION_LINES.PLAYER_TURN(nextP.name))}`;
          return r;
        }

        const settled = settleNetPlayersOnly(r.players, r.pot || 0);
        r.players = settled.settledPlayers;
        r.pot = settled.winners.length > 0 ? 0 : r.pot;
        r.status = 'ROUND_OVER';
        r.turnDeadline = null;
        r.turnNotice = '';
        r.winnersList = settled.winners;
        r.winnerAnnouncement = settled.announcement;
        return r;
      });
    }
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }

    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const room = roomData as NetBlackjackRoomData;
      const filteredPlayers = (room.players || []).filter((p) => p.id !== mySessionId);
      const filteredWaitlist = (room.waitlist || []).filter((w) => w.id !== mySessionId);
      const filteredSpectators = (room.spectators || []).filter((s) => s.id !== mySessionId);

      if (filteredPlayers.length === 0 && filteredSpectators.length === 0) {
        return createDefaultBlackjackRoom(room.roomId);
      }
      room.players = filteredPlayers;
      room.waitlist = filteredWaitlist;
      room.spectators = filteredSpectators;
      return room;
    });

    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
  };

  // =========================================================================
  // 단독게임(SOLO) 로직 (딜러와 함께 대결)
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
        hasPlacedBet: false,
        isStanding: false,
        isBusted: false,
        isBlackjack: false,
        roundResult: 'NONE',
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
    if (players.length < 1) {
      showToast('최소 1명 이상의 플레이어를 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startSoloRound = (isNextRound = false) => {
    const nextRound = isNextRound ? soloRoundNum + 1 : 1;
    const freshShoe = deck.length > 40 ? deck : createBlackjackShoe(4);
    const initialized = players.map((p, idx) => ({
      ...p,
      color: PIECE_COLORS[idx % PIECE_COLORS.length],
      hand: [],
      chips: p.chips > 0 ? p.chips : INITIAL_CHIPS,
      currentBet: 0,
      hasPlacedBet: false,
      isStanding: false,
      isBusted: false,
      isBlackjack: false,
      roundResult: 'NONE' as PlayerRoundResult,
    }));

    const notice = `💰 [${nextRound}라운드 · 딜러 대결] ${initialized[0].name}님, 베팅할 칩을 선택해 주세요!`;
    setSoloRoundNum(nextRound);
    setDeck(freshShoe);
    setPlayers(initialized);
    setDealerHand([]);
    setCurrentPlayerIdx(0);
    setSoloSelectedBet(minBetOption);
    setSoloRemainingSec(soloTimeoutSec);
    lastCountdownSpokenRef.current = null;
    setWinnerAnnouncement('');
    setShowFireworks(false);
    setTurnNotice(notice);
    speakKorean(notice);
    setGameState('BETTING');
  };

  const handleSoloPlaceBet = (amount: number) => {
    if (gameState !== 'BETTING') return;
    const actor = players[currentPlayerIdx];
    const pay = Math.min(actor.chips, Math.max(minBetOption, amount));

    triggerChipAnimation(actor.name, pay, actor.color);

    const updated = players.map((p, idx) =>
      idx === currentPlayerIdx
        ? { ...p, chips: p.chips - pay, currentBet: pay, hasPlacedBet: true }
        : p
    );

    if (currentPlayerIdx + 1 < updated.length) {
      const nextIdx = currentPlayerIdx + 1;
      const nextNotice = `💰 ${updated[nextIdx].name}님 차례입니다! 베팅할 칩을 올려주세요.`;
      setPlayers(updated);
      setCurrentPlayerIdx(nextIdx);
      setSoloSelectedBet(minBetOption);
      setSoloRemainingSec(soloTimeoutSec);
      lastCountdownSpokenRef.current = null;
      setTurnNotice(nextNotice);
      speakKorean(nextNotice);
      return;
    }

    const deckCopy = [...deck];
    const dealtPlayers = updated.map((p) => {
      const hand = [
        { ...deckCopy.shift()!, isFaceUp: true },
        { ...deckCopy.shift()!, isFaceUp: true },
      ];
      const ev = calculateBlackjackScore(hand);
      return {
        ...p,
        hand,
        isBlackjack: ev.isBlackjack,
        isStanding: ev.isBlackjack,
      };
    });

    // 딜러 카드 2장 (게임 중에는 모두 뒷면 숨김 처리, 종료 시 일제 공개)
    const newDealerHand = [
      { ...deckCopy.shift()!, isFaceUp: false },
      { ...deckCopy.shift()!, isFaceUp: false },
    ];

    playSound('deal');
    const firstActiveIdx = dealtPlayers.findIndex((p) => !p.isStanding && !p.isBusted);

    if (firstActiveIdx === -1) {
      const settled = settleSoloWithDealer(dealtPlayers, newDealerHand, deckCopy);
      setPlayers(settled.settledPlayers);
      setDealerHand(settled.finalDealerHand);
      setDeck(settled.remainingDeck);
      setTurnNotice('');
      setWinnerAnnouncement(settled.announcement);
      setGameState('ROUND_OVER');
      if (settled.winners.length > 0) {
        triggerFireworksCelebration(settled.announcement);
      } else {
        speakKorean(settled.announcement);
      }
      return;
    }

    const firstP = dealtPlayers[firstActiveIdx];
    const nextNotice = `🎯 ${pickRandomLine(SITUATION_LINES.PLAYER_TURN(firstP.name))}`;

    setDeck(deckCopy);
    setPlayers(dealtPlayers);
    setDealerHand(newDealerHand);
    setCurrentPlayerIdx(firstActiveIdx);
    setSoloRemainingSec(soloTimeoutSec);
    lastCountdownSpokenRef.current = null;
    setTurnNotice(nextNotice);
    speakKorean(nextNotice);
    setGameState('PLAYING');
  };

  const advanceSoloTurnOrSettle = (
    nextPlayers: BlackjackPlayer[],
    nextDeck: BlackjackCard[],
    sameTurnNotice?: string
  ) => {
    const nextIdx = nextPlayers.findIndex(
      (p, i) => i > currentPlayerIdx && !p.isStanding && !p.isBusted
    );
    const wrapIdx =
      nextIdx !== -1
        ? nextIdx
        : nextPlayers.findIndex((p) => !p.isStanding && !p.isBusted);

    if (wrapIdx !== -1) {
      const targetP = nextPlayers[wrapIdx];
      const notice =
        wrapIdx === currentPlayerIdx && sameTurnNotice
          ? sameTurnNotice
          : `🎯 ${pickRandomLine(SITUATION_LINES.PLAYER_TURN(targetP.name))}`;

      setPlayers(nextPlayers);
      setDeck(nextDeck);
      setCurrentPlayerIdx(wrapIdx);
      setSoloRemainingSec(soloTimeoutSec);
      lastCountdownSpokenRef.current = null;
      setTurnNotice(notice);
      speakKorean(notice);
      return;
    }

    const settled = settleSoloWithDealer(nextPlayers, dealerHand, nextDeck);
    setPlayers(settled.settledPlayers);
    setDealerHand(settled.finalDealerHand);
    setDeck(settled.remainingDeck);
    setTurnNotice('');
    setWinnerAnnouncement(settled.announcement);
    setGameState('ROUND_OVER');

    if (settled.winners.length > 0) {
      triggerFireworksCelebration(settled.announcement);
      settled.settledPlayers.forEach((sp) => {
        if (sp.roundResult === 'WIN' || sp.roundResult === 'BLACKJACK_WIN') {
          saveHallOfFameRecord('SOLO', {
            name: sp.name,
            scoreOrLevel: `${sp.wins}승 · 보유 ${sp.chips.toLocaleString()}칩`,
          });
        }
      });
    } else {
      speakKorean(settled.announcement);
    }
  };

  const handleSoloHit = () => {
    if (gameState !== 'PLAYING') return;
    const actor = players[currentPlayerIdx];
    const deckCopy = [...deck];
    const drawn = { ...deckCopy.shift()!, isFaceUp: true };
    const nextHand = [...actor.hand, drawn];
    const ev = calculateBlackjackScore(nextHand);
    const busted = ev.score > 21;
    const autoStand = ev.score === 21;

    playSound(busted ? 'bust' : 'deal');

    const updated = players.map((p, idx) =>
      idx === currentPlayerIdx
        ? { ...p, hand: nextHand, isBusted: busted, isStanding: busted || autoStand }
        : p
    );

    const notice = busted
      ? `💥 ${pickRandomLine(SITUATION_LINES.BUST(actor.name, ev.score))}`
      : `🃏 ${pickRandomLine(SITUATION_LINES.HIT(actor.name))}`;

    advanceSoloTurnOrSettle(updated, deckCopy, notice);
  };

  const handleSoloStand = () => {
    if (gameState !== 'PLAYING') return;
    const actor = players[currentPlayerIdx];
    const updated = players.map((p, idx) =>
      idx === currentPlayerIdx ? { ...p, isStanding: true } : p
    );
    const notice = `✋ ${pickRandomLine(SITUATION_LINES.STAND(actor.name))}`;
    advanceSoloTurnOrSettle(updated, deck, notice);
  };

  const handleSoloDouble = () => {
    if (gameState !== 'PLAYING') return;
    const actor = players[currentPlayerIdx];
    if (actor.hand.length !== 2 || actor.chips < actor.currentBet) return;

    const extra = actor.currentBet;
    triggerChipAnimation(actor.name, extra, actor.color);

    const deckCopy = [...deck];
    const drawn = { ...deckCopy.shift()!, isFaceUp: true };
    const nextHand = [...actor.hand, drawn];
    const ev = calculateBlackjackScore(nextHand);
    const busted = ev.score > 21;

    const updated = players.map((p, idx) =>
      idx === currentPlayerIdx
        ? {
            ...p,
            chips: p.chips - extra,
            currentBet: p.currentBet + extra,
            hand: nextHand,
            isBusted: busted,
            isStanding: true,
          }
        : p
    );

    const notice = busted
      ? `💥 ${pickRandomLine(SITUATION_LINES.BUST(actor.name, ev.score))}`
      : `🔥 ${pickRandomLine(SITUATION_LINES.DOUBLE(actor.name))}`;

    advanceSoloTurnOrSettle(updated, deckCopy, notice);
  };

  // =========================================================================
  // 공용 UI 렌더링 헬퍼 (revealFace가 false면 무조건 카드 뒷면 표시)
  // =========================================================================
  const renderCard = (card: BlackjackCard, revealFace: boolean, mini = false) => {
    const showFront = revealFace && card.isFaceUp;
    const red = isRedSuit(card.suit);
    return (
      <div
        key={card.id}
        className={`bj-card ${showFront ? 'face-up' : 'face-down'} ${
          red ? 'red' : 'black'
        } ${mini ? 'mini' : ''}`}
      >
        {showFront ? (
          <>
            <span className="bj-card-rank">{getRankLabel(card.rank)}</span>
            <span className="bj-card-suit">{getSuitSymbol(card.suit)}</span>
          </>
        ) : (
          <span className="bj-card-back-pattern">🂠</span>
        )}
      </div>
    );
  };

  const renderResultBadge = (result: PlayerRoundResult) => {
    switch (result) {
      case 'BLACKJACK_WIN':
        return <span className="bj-res-badge bj">👑 블랙잭 승리!</span>;
      case 'WIN':
        return <span className="bj-res-badge win">🎉 승리!</span>;
      case 'PUSH':
        return <span className="bj-res-badge push">🤝 무승부</span>;
      case 'BUST':
        return <span className="bj-res-badge lose">💥 버스트 (21 초과)</span>;
      case 'LOSE':
        return <span className="bj-res-badge lose">😢 패배</span>;
      default:
        return null;
    }
  };

  const renderFireworksAndChips = () => (
    <>
      <div className="chip-fly-layer">
        {chipFlyEffects.map((chip) => (
          <div
            key={chip.id}
            className="flying-poker-chip"
            style={{ backgroundColor: chip.color }}
          >
            <div className="chip-inner-ring">
              <span>{chip.playerName}</span>
              <strong>+{chip.amount.toLocaleString()}</strong>
            </div>
          </div>
        ))}
      </div>

      {showFireworks && (
        <div className="fireworks-overlay" aria-hidden="true">
          <div className="firework-burst fb-1" />
          <div className="firework-burst fb-2" />
          <div className="firework-burst fb-3" />
          <div className="firework-burst fb-4" />
          <div className="firework-burst fb-5" />
        </div>
      )}
    </>
  );

  // =========================================================================
  // 1. 홈 화면 (HOME)
  // =========================================================================
  if (appMode === 'HOME') {
    return (
      <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🃏🎰♠️♥️</div>
          <h1 className="setup-title">블랙잭 21 (BLACKJACK)</h1>
          <p className="home-subtitle">단독은 딜러와 대결 · 넷게임은 플레이어 간 대결</p>

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
              <span className="mode-desc">딜러와 함께 즐기는 1~4인 블랙잭</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">딜러 없이 참가자끼리 실시간 판돈 대전</span>
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
      <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0], padding: '16px' }}>
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
      <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="net-lobby-container">
          <div className="net-lobby-header">
            <button type="button" className="btn btn-secondary" onClick={() => setAppMode('HOME')}>
              ⬅️ 홈으로
            </button>
            <h2 style={{ margin: 0, fontSize: '20px', color: '#0f172a' }}>
              🌐 블랙잭 21 넷게임 (4개 테이블)
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
                room.status === 'BETTING' ||
                room.status === 'PLAYING' ||
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
                    <span className="room-number-title">🎰 제 {room.roomId} 블랙잭룸</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>💰 최소 베팅: {room.minBet.toLocaleString()}칩</span>
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
              <h2 style={{ margin: '0 0 8px' }}>🎰 제 {joinModalRoom.roomId} 블랙잭룸 입장</h2>
              <p className="modal-subtext">
                이름을 입력하고 승부에 참가하거나, <strong>관망모드</strong>로 구경하세요!
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
  // 4. 넷게임 방 내부 (딜러 없이 플레이어 간 대결, 관망모드 패 비공개)
  // =========================================================================
  if (appMode === 'NET_ROOM') {
    if (!activeNetRoom) {
      return (
        <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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

    if (activeNetRoom.status === 'WAITING' || activeNetRoom.status === 'EMPTY') {
      const minutes = Math.floor(waitingCountdownSec / 60);
      const seconds = waitingCountdownSec % 60;
      const countdownStr = `${minutes}분 ${seconds < 10 ? '0' : ''}${seconds}초`;

      return (
        <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0] }}>
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
              🎰 블랙잭 21 대기실 (참가자 대전) {amISpectator ? '👀 [관망모드]' : ''}
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                💰 최소 베팅 칩 설정 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {[100, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    disabled={!isHost}
                    className={`count-btn ${activeNetRoom.minBet === val ? 'active' : ''}`}
                    onClick={() => updateRoomSettings(val, activeNetRoom.baseTimeout)}
                  >
                    {val}칩
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 턴 제한시간: <strong>{activeNetRoom.baseTimeout}초 (기본 2분)</strong>{' '}
                {isHost ? '(방장 설정 가능)' : ''}
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700 }}>30초</span>
                <input
                  type="range"
                  min={30}
                  max={180}
                  step={10}
                  disabled={!isHost}
                  value={activeNetRoom.baseTimeout}
                  style={{ flex: 1 }}
                  onChange={(e) =>
                    updateRoomSettings(activeNetRoom.minBet, Number(e.target.value))
                  }
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>180초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🧭 입장한 플레이어 (2명 이상 시 시작 가능)</label>
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
              onClick={() => handleStartNetBettingPhase(false)}
            >
              🚀 블랙잭 대전 시작! ({roomPlayers.length}/4명)
            </button>
          </div>
        </div>
      );
    }

    const netCurrIdx = (activeNetRoom.currentPlayerIdx || 0) % Math.max(1, roomPlayers.length);
    const netCurrPlayer = roomPlayers[netCurrIdx];
    const isMyTurn =
      activeNetRoom.status === 'PLAYING' && netCurrPlayer?.id === mySessionId && !amISpectator;
    const myPlayerObj = roomPlayers.find((p) => p.id === mySessionId);
    const isRoundOver = activeNetRoom.status === 'ROUND_OVER';

    return (
      <div
        className="bj-container"
        style={{ background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length] }}
      >
        {renderFireworksAndChips()}

        {toast && (
          <div key={toast.id} className={`bj-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">
                {activeNetRoom.roundNumber}판째 {amISpectator ? '👀[관망]' : ''}
              </span>
              {!isRoundOver && (
                <span className={`net-timer-badge ${remainingSeconds <= 10 ? 'urgent' : ''}`}>
                  ⏱️ {remainingSeconds}초
                </span>
              )}
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p, idx) => {
                const isActive =
                  (activeNetRoom.status === 'PLAYING' && idx === netCurrIdx) ||
                  (activeNetRoom.status === 'BETTING' && !p.hasPlacedBet);
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active-turn-spotlight' : ''} ${
                      p.isBusted ? 'eliminated' : ''
                    }`}
                    style={{ borderColor: isActive ? p.color : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong className={isActive ? 'turn-hero-name' : ''}>
                        {isActive && '👉 '}
                        {p.name}
                        {p.id === mySessionId ? '(나)' : ''}
                      </strong>
                      <span className="win-count-pill">🏆{p.wins || 0}승</span>
                      <span className="badge-score">💰{(p.chips ?? 0).toLocaleString()}</span>
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

          <div className="bj-table-board">
            {isRoundOver ? (
              <div className="winner-celebration-top-bar">
                <div className="winner-celebrate-title">
                  {activeNetRoom.winnerAnnouncement}
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
                    onClick={() => handleStartNetBettingPhase(true)}
                  >
                    🔥 다음 게임 시작 (승수·칩 누적)
                  </button>
                </div>
              </div>
            ) : (
              <div key={activeNetRoom.turnNotice} className="bj-notice-banner">
                {activeNetRoom.turnNotice}
              </div>
            )}

            {/* 넷게임 총 판돈(POT) 표시 */}
            <div className="center-pot-box">
              <span className="pot-label">💰 현재 총 판돈 (POT)</span>
              <strong className="pot-amount">{(activeNetRoom.pot || 0).toLocaleString()} 칩</strong>
            </div>

            {/* 참가자 좌석 그리드 (관망모드 및 타인 패는 라운드 종료 전까지 뒷면 숨김) */}
            <div className="players-seats-grid">
              {roomPlayers.map((p, idx) => {
                const isTurn =
                  (activeNetRoom.status === 'PLAYING' && idx === netCurrIdx) ||
                  (activeNetRoom.status === 'BETTING' && !p.hasPlacedBet);
                const canSeeFace =
                  !amISpectator && (p.id === mySessionId || isRoundOver);
                const pEval = calculateBlackjackScore(p.hand);

                return (
                  <div
                    key={p.id}
                    className={`seat-hand-card ${isTurn ? 'seat-active-turn' : ''} ${
                      p.roundResult === 'WIN' || p.roundResult === 'BLACKJACK_WIN'
                        ? 'seat-winner-glow'
                        : ''
                    }`}
                  >
                    <div className="seat-header">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong className={isTurn ? 'seat-hero-name' : ''}>
                        {isTurn && '🔥 '}
                        {p.name}
                        {p.id === mySessionId ? '(나)' : ''}
                      </strong>
                      <span className="seat-bet-chip">
                        🪙 베팅: {p.currentBet.toLocaleString()}
                      </span>
                      {p.hand.length > 0 && canSeeFace && (
                        <span className="seat-score-tag">
                          {pEval.score}점 {p.isBlackjack ? '👑BJ' : ''}
                        </span>
                      )}
                    </div>

                    {p.roundResult !== 'NONE' && (
                      <div style={{ margin: '2px 0' }}>{renderResultBadge(p.roundResult)}</div>
                    )}

                    <div className="cards-row">
                      {p.hand.length === 0 ? (
                        <span className="bet-status-text">
                          {p.hasPlacedBet ? '✅ 베팅 완료!' : '⏳ 베팅 대기 중...'}
                        </span>
                      ) : (
                        p.hand.map((card) => renderCard(card, canSeeFace))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {amISpectator && (
            <div className="bj-bottom-dock">
              <div className="waiting-dock-msg">
                👀 관망모드에서는 모든 플레이어의 패가 숨겨지며, 라운드 종료 시 일제 공개됩니다.
              </div>
            </div>
          )}

          {myPlayerObj && !amISpectator && (
            <div
              className="bj-bottom-dock"
              style={{ borderTop: `4px solid ${myPlayerObj.color}` }}
            >
              {activeNetRoom.status === 'BETTING' && !myPlayerObj.hasPlacedBet && (
                <div className="bet-control-panel">
                  <div className="bet-presets-row">
                    {[
                      activeNetRoom.minBet,
                      activeNetRoom.minBet * 2,
                      activeNetRoom.minBet * 5,
                      myPlayerObj.chips,
                    ].map((amt, i) => {
                      const validAmt = Math.min(myPlayerObj.chips, amt);
                      return (
                        <button
                          key={i}
                          type="button"
                          className={`preset-chip-btn ${netSelectedBet === validAmt ? 'active' : ''}`}
                          onClick={() => setNetSelectedBet(validAmt)}
                        >
                          {i === 3 ? `올인 (${validAmt.toLocaleString()})` : `+${validAmt.toLocaleString()}칩`}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleNetPlaceBet(netSelectedBet)}
                  >
                    🪙 {Math.min(myPlayerObj.chips, netSelectedBet).toLocaleString()}칩 베팅하기!
                  </button>
                </div>
              )}

              {activeNetRoom.status === 'BETTING' && myPlayerObj.hasPlacedBet && (
                <div className="waiting-dock-msg">
                  ✅ {myPlayerObj.currentBet.toLocaleString()}칩 베팅 완료! 다른 참가자의 베팅을 기다리고 있습니다...
                </div>
              )}

              {activeNetRoom.status === 'PLAYING' && (
                <>
                  {isMyTurn ? (
                    <div className="bj-actions-row">
                      <button
                        type="button"
                        className="bj-act-btn hit"
                        onClick={() => handleNetPlayAction('HIT')}
                      >
                        🃏 히트 (카드 받기)
                      </button>
                      <button
                        type="button"
                        className="bj-act-btn stand"
                        onClick={() => handleNetPlayAction('STAND')}
                      >
                        ✋ 스탠드 (멈추기)
                      </button>
                      <button
                        type="button"
                        className="bj-act-btn double"
                        disabled={
                          myPlayerObj.hand.length !== 2 ||
                          myPlayerObj.chips < myPlayerObj.currentBet
                        }
                        onClick={() => handleNetPlayAction('DOUBLE')}
                      >
                        🔥 더블 다운 (2배 베팅)
                      </button>
                    </div>
                  ) : (
                    <div className="waiting-dock-msg">
                      ⏳ 현재 <strong>{netCurrPlayer?.name}</strong>님의 차례입니다. 잠시만 기다려주세요!
                    </div>
                  )}
                </>
              )}

              {isRoundOver && (
                <div className="waiting-dock-msg">
                  🏆 라운드 종료! 상단의 <strong>[다음 게임 시작]</strong> 버튼을 눌러 승부를 이어가세요!
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 5. 단독게임(SOLO) - 딜러와 함께 대결, 상대 패 & 딜러 패 뒷면 숨김 -> 종료 시 일제 공개
  // =========================================================================
  const currentPlayer = players[currentPlayerIdx] || players[0];
  const currentBackground =
    (gameState === 'BETTING' || gameState === 'PLAYING') && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];
  const isSoloRoundOver = gameState === 'ROUND_OVER';
  const soloDealerEval = calculateBlackjackScore(dealerHand);

  return (
    <div className="bj-container" style={{ background: currentBackground }}>
      {renderFireworksAndChips()}

      {toast && (
        <div key={toast.id} className={`bj-toast ${toast.type}`}>
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
          <h1 className="setup-title">🎰 블랙잭 21 (단독게임 · 딜러 대결)</h1>

          <div className="setting-section">
            <label className="setting-label">💰 최소 베팅 칩 설정 (초기 지급 10,000칩)</label>
            <div className="piece-count-selector" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {[100, 200, 500].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`count-btn ${minBetOption === val ? 'active' : ''}`}
                  onClick={() => setMinBetOption(val)}
                >
                  {val}칩
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">
              ⏱️ 턴 제한시간 설정: <strong>{soloTimeoutSec}초 (기본 2분)</strong>
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700 }}>30초</span>
              <input
                type="range"
                min={30}
                max={180}
                step={10}
                value={soloTimeoutSec}
                style={{ flex: 1 }}
                onChange={(e) => setSoloTimeoutSec(Number(e.target.value))}
              />
              <span style={{ fontSize: '12px', fontWeight: 700 }}>180초</span>
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">🧭 플레이어 등록 (1~4명)</label>
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
            disabled={players.length < 1}
            onClick={goToMainReady}
          >
            ➡️ 순서 정하러 가기 ({players.length}명)
          </button>
        </div>
      )}

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
              🚀 블랙잭 시작!
            </button>
          </div>
        </div>
      )}

      {(gameState === 'BETTING' || gameState === 'PLAYING' || gameState === 'ROUND_OVER') &&
        currentPlayer && (
          <div className="play-wrapper compact-tablet-mode">
            <div className="game-header compact-header">
              <div className="net-level-timer-box">
                <span className="net-level-badge">{soloRoundNum}판째</span>
                {!isSoloRoundOver && (
                  <span className={`net-timer-badge ${soloRemainingSec <= 10 ? 'urgent' : ''}`}>
                    ⏱️ {soloRemainingSec}초
                  </span>
                )}
              </div>

              <div className="player-status-bar">
                {players.map((p, idx) => {
                  const isActive = !isSoloRoundOver && idx === currentPlayerIdx;
                  return (
                    <div
                      key={p.id}
                      className={`player-badge-card ${isActive ? 'active-turn-spotlight' : ''} ${
                        p.isBusted ? 'eliminated' : ''
                      }`}
                      style={{ borderColor: isActive ? p.color : 'transparent' }}
                    >
                      <div className="player-badge-top">
                        <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                          {getShortName(p.name)}
                        </span>
                        <strong className={isActive ? 'turn-hero-name' : ''}>
                          {isActive && '👉 '}
                          {p.name}
                        </strong>
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

            <div className="bj-table-board">
              {isSoloRoundOver ? (
                <div className="winner-celebration-top-bar">
                  <div className="winner-celebrate-title">{winnerAnnouncement}</div>
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
                      🔥 다음 게임 시작 (승수·칩 누적)
                    </button>
                  </div>
                </div>
              ) : (
                <div key={turnNotice} className="bj-notice-banner">
                  {turnNotice}
                </div>
              )}

              {/* 딜러 영역 (라운드 종료 전까지 뒷면 숨김, 종료 시 일제 공개) */}
              <div className="dealer-zone">
                <div className="dealer-header">
                  <span className="dealer-badge">🎩 딜러 (DEALER)</span>
                  {dealerHand.length > 0 && isSoloRoundOver && (
                    <span className="dealer-score-pill">
                      최종 {soloDealerEval.score}점{' '}
                      {soloDealerEval.score > 21 ? '(버스트!)' : ''}
                    </span>
                  )}
                </div>
                <div className="cards-row dealer-cards">
                  {dealerHand.length === 0 ? (
                    <span className="dealer-waiting-msg">전원 베팅 완료 시 카드가 배분됩니다</span>
                  ) : (
                    dealerHand.map((card) => renderCard(card, isSoloRoundOver))
                  )}
                </div>
              </div>

              {/* 플레이어 좌석 영역: 현재 차례 플레이어 패만 보이고, 상대 패는 라운드 종료 시 일제 공개 */}
              <div className="players-seats-grid">
                {players.map((p, idx) => {
                  const isTurn = !isSoloRoundOver && idx === currentPlayerIdx;
                  const canSeeFace = isSoloRoundOver || idx === currentPlayerIdx;
                  const pEval = calculateBlackjackScore(p.hand);

                  return (
                    <div
                      key={p.id}
                      className={`seat-hand-card ${isTurn ? 'seat-active-turn' : ''} ${
                        p.roundResult === 'WIN' || p.roundResult === 'BLACKJACK_WIN'
                          ? 'seat-winner-glow'
                          : ''
                      }`}
                    >
                      <div className="seat-header">
                        <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                          {getShortName(p.name)}
                        </span>
                        <strong className={isTurn ? 'seat-hero-name' : ''}>
                          {isTurn && '🔥 '}
                          {p.name}
                        </strong>
                        <span className="seat-bet-chip">
                          🪙 베팅: {p.currentBet.toLocaleString()}
                        </span>
                        {p.hand.length > 0 && canSeeFace && (
                          <span className="seat-score-tag">
                            {pEval.score}점 {p.isBlackjack ? '👑BJ' : ''}
                          </span>
                        )}
                      </div>

                      {p.roundResult !== 'NONE' && (
                        <div style={{ margin: '2px 0' }}>{renderResultBadge(p.roundResult)}</div>
                      )}

                      <div className="cards-row">
                        {p.hand.length === 0 ? (
                          <span className="bet-status-text">
                            {p.hasPlacedBet ? '✅ 베팅 완료!' : '⏳ 베팅 대기 중...'}
                          </span>
                        ) : (
                          p.hand.map((card) => renderCard(card, canSeeFace))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="bj-bottom-dock"
              style={{ borderTop: `4px solid ${currentPlayer.color}` }}
            >
              <div className="dock-top-status">
                <span
                  className="turn-owner-pill large-turn-pill"
                  style={{ backgroundColor: currentPlayer.color }}
                >
                  👉 {currentPlayer.name}님 차례 · 🏆{currentPlayer.wins}승 · 💰
                  {currentPlayer.chips.toLocaleString()}칩
                </span>
              </div>

              {gameState === 'BETTING' && (
                <div className="bet-control-panel">
                  <div className="bet-presets-row">
                    {[
                      minBetOption,
                      minBetOption * 2,
                      minBetOption * 5,
                      currentPlayer.chips,
                    ].map((amt, i) => {
                      const validAmt = Math.min(currentPlayer.chips, amt);
                      return (
                        <button
                          key={i}
                          type="button"
                          className={`preset-chip-btn ${
                            soloSelectedBet === validAmt ? 'active' : ''
                          }`}
                          onClick={() => setSoloSelectedBet(validAmt)}
                        >
                          {i === 3
                            ? `올인 (${validAmt.toLocaleString()})`
                            : `+${validAmt.toLocaleString()}칩`}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    className="btn btn-success"
                    onClick={() => handleSoloPlaceBet(soloSelectedBet)}
                  >
                    🪙 {Math.min(currentPlayer.chips, soloSelectedBet).toLocaleString()}칩 베팅하기!
                  </button>
                </div>
              )}

              {gameState === 'PLAYING' && (
                <div className="bj-actions-row">
                  <button type="button" className="bj-act-btn hit" onClick={handleSoloHit}>
                    🃏 히트 (카드 받기)
                  </button>
                  <button type="button" className="bj-act-btn stand" onClick={handleSoloStand}>
                    ✋ 스탠드 (멈추기)
                  </button>
                  <button
                    type="button"
                    className="bj-act-btn double"
                    disabled={
                      currentPlayer.hand.length !== 2 ||
                      currentPlayer.chips < currentPlayer.currentBet
                    }
                    onClick={handleSoloDouble}
                  >
                    🔥 더블 다운 (2배 베팅)
                  </button>
                </div>
              )}

              {isSoloRoundOver && (
                <div className="waiting-dock-msg">
                  🎉 라운드 종료! 모든 카드가 공개되었습니다. <strong>[다음 게임 시작]</strong>을 눌러 계속하세요!
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}