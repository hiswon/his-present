import { useState, useRef, useEffect, useCallback } from 'react';
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
  rank: number; // 1(A), 2~10, 11(J), 12(Q), 13(K)
  isFaceUp: boolean;
}

type PlayerStatus = 'BETTING' | 'PLAYING' | 'STAND' | 'BUST' | 'BLACKJACK';

interface BlackjackPlayer {
  id: string;
  name: string;
  color: string;
  hand: BlackjackCard[];
  chips: number;
  wins: number;
  currentBet: number;
  status: PlayerStatus;
  roundOutcome?: string;
}

interface CoinChipVisual {
  id: string;
  colorClass: 'gold' | 'red' | 'blue' | 'black';
  label: string;
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
  dealerHand: BlackjackCard[];
  waitlist: WaitlistPlayer[];
  spectators: SpectatorPlayer[];
  baseTimeout: number;
  minBet: number;
  roundNumber: number;
  deck: BlackjackCard[];
  currentPlayerIdx: number;
  turnDeadline: number | null;
  winnerSummary: string;
  turnNotice: string; // 턴이 바뀔 때마다 리셋되는 안내 텍스트
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
const INITIAL_CHIPS = 10000;

function pickRandomPhrase(phrases: string[]): string {
  return phrases[Math.floor(Math.random() * phrases.length)];
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
  if (rank === 1) return 'A';
  if (rank === 11) return 'J';
  if (rank === 12) return 'Q';
  if (rank === 13) return 'K';
  return String(rank);
}

function getCenterCardGraphic(card: BlackjackCard): string {
  const sym = getSuitSymbol(card.suit);
  if (card.rank === 11) return `🤴${sym}`;
  if (card.rank === 12) return `👸${sym}`;
  if (card.rank === 13) return `👑${sym}`;
  return sym;
}

function isRedSuit(suit: Suit): boolean {
  return suit === 'HEART' || suit === 'DIAMOND';
}

function createBlackjackDeck(): BlackjackCard[] {
  const suits: Suit[] = ['SPADE', 'HEART', 'DIAMOND', 'CLUB'];
  const deck: BlackjackCard[] = [];
  // 리얼 카지노 감성을 위해 2덱 셔플
  for (let d = 0; d < 2; d++) {
    for (const suit of suits) {
      for (let r = 1; r <= 13; r++) {
        deck.push({
          id: `${d}-${suit}-${r}-${Math.random().toString(36).slice(2, 6)}`,
          suit,
          rank: r,
          isFaceUp: true,
        });
      }
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

/**
 * 블랙잭 점수 계산 (A는 1 또는 11 중 유리한 값 자동 선택)
 */
function calculateBlackjackScore(cards: BlackjackCard[], onlyFaceUp = false): {
  score: number;
  isSoft: boolean;
  isBlackjack: boolean;
} {
  const targetCards = onlyFaceUp ? cards.filter((c) => c.isFaceUp) : cards;
  let total = 0;
  let aceCount = 0;

  for (const c of targetCards) {
    if (c.rank === 1) {
      aceCount += 1;
      total += 11;
    } else if (c.rank >= 10) {
      total += 10;
    } else {
      total += c.rank;
    }
  }

  while (total > 21 && aceCount > 0) {
    total -= 10;
    aceCount -= 1;
  }

  const isBlackjack = !onlyFaceUp && targetCards.length === 2 && total === 21;
  return {
    score: total,
    isSoft: aceCount > 0,
    isBlackjack,
  };
}

/**
 * 금액을 코인 칩 비주얼 배열로 변환
 */
function buildCoinVisuals(totalBet: number): CoinChipVisual[] {
  if (totalBet <= 0) return [];
  const chips: CoinChipVisual[] = [];
  let rem = totalBet;

  const denoms: Array<{ val: number; colorClass: CoinChipVisual['colorClass']; label: string }> = [
    { val: 1000, colorClass: 'black', label: '1K' },
    { val: 500, colorClass: 'gold', label: '500' },
    { val: 100, colorClass: 'red', label: '100' },
    { val: 50, colorClass: 'blue', label: '50' },
  ];

  for (const d of denoms) {
    while (rem >= d.val && chips.length < 14) {
      chips.push({
        id: `coin-${d.val}-${chips.length}`,
        colorClass: d.colorClass,
        label: d.label,
      });
      rem -= d.val;
    }
  }
  return chips;
}

function createDefaultBlackjackRoom(roomId: number): NetBlackjackRoomData {
  return {
    roomId,
    status: 'EMPTY',
    players: [],
    dealerHand: [],
    waitlist: [],
    spectators: [],
    baseTimeout: 20,
    minBet: 200,
    roundNumber: 1,
    deck: [],
    currentPlayerIdx: 0,
    turnDeadline: null,
    winnerSummary: '',
    turnNotice: '',
    waitingSince: null,
  };
}

/**
 * 우승 시 폭죽 파티클 컴포넌트
 */
function FireworksOverlay() {
  const bursts = [
    { left: '20%', top: '24%', color: '#facc15' },
    { left: '50%', top: '18%', color: '#f43f5e' },
    { left: '80%', top: '26%', color: '#38bdf8' },
    { left: '34%', top: '38%', color: '#4ade80' },
    { left: '68%', top: '35%', color: '#c084fc' },
  ];

  const angles = Array.from({ length: 12 }, (_, i) => (i * 360) / 12);

  return (
    <div className="fireworks-stage">
      {bursts.map((b, bIdx) => (
        <div
          key={bIdx}
          className="firework-rocket"
          style={{ left: b.left, top: b.top }}
        >
          {angles.map((deg, aIdx) => {
            const rad = (deg * Math.PI) / 180;
            const dist = 75 + (bIdx % 2) * 25;
            const tx = `${Math.round(Math.cos(rad) * dist)}px`;
            const ty = `${Math.round(Math.sin(rad) * dist)}px`;
            return (
              <span
                key={aIdx}
                className="firework-spark"
                style={
                  {
                    backgroundColor: b.color,
                    boxShadow: `0 0 8px ${b.color}`,
                    animationDelay: `${bIdx * 0.22}s`,
                    '--tx': tx,
                    '--ty': ty,
                  } as React.CSSProperties
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
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
  const [remainingSeconds, setRemainingSeconds] = useState<number>(0);
  const [waitingCountdownSec, setWaitingCountdownSec] = useState<number>(420);
  const timeoutHandledRef = useRef<number | null>(null);
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
      status: 'BETTING',
    },
    {
      id: '2',
      name: '고니',
      color: PIECE_COLORS[1],
      hand: [],
      chips: INITIAL_CHIPS,
      wins: 0,
      currentBet: 0,
      status: 'BETTING',
    },
  ]);
  const [dealerHand, setDealerHand] = useState<BlackjackCard[]>([]);
  const [inputName, setInputName] = useState('');
  const [minBetOption, setMinBetOption] = useState<number>(200);
  const [soloRoundNum, setSoloRoundNum] = useState<number>(1);
  const [soloTurnSeconds, setSoloTurnSeconds] = useState<number>(20);

  const [deck, setDeck] = useState<BlackjackCard[]>([]);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [turnNotice, setTurnNotice] = useState<string>('');
  const [winnerBannerText, setWinnerBannerText] = useState<string>('');

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'success' | 'danger' | 'celebrate';
  } | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);

  const showToast = useCallback(
    (text: string, type: 'info' | 'success' | 'danger' | 'celebrate' = 'info') => {
      setToast({ id: Date.now(), text, type });
    },
    []
  );

  const speakKorean = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.14;
      utterance.pitch = 1.06;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  const playSound = useCallback((kind: 'card' | 'coin' | 'bust' | 'win' | 'tick') => {
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
        card: [520, 680],
        coin: [987.77, 1318.51, 1567.98],
        bust: [293.66, 220.0, 164.81],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98],
        tick: [880],
      };

      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = kind === 'bust' ? 'sawtooth' : kind === 'coin' ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.065);
        gain.gain.setValueAtTime(kind === 'tick' ? 0.18 : 0.14, ctx.currentTime + idx * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.065 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.065);
        osc.stop(ctx.currentTime + idx * 0.065 + 0.22);
      });
    } catch {
      // 오디오 자동재생 제한 무시
    }
  }, []);

  /**
   * 턴이 바뀔 때마다 상단 텍스트를 새로 리셋하고 음성으로도 상황 안내
   */
  const announceTurnReset = useCallback(
    (message: string, soundKind?: 'card' | 'coin' | 'bust' | 'win') => {
      setTurnNotice(message);
      if (soundKind) playSound(soundKind);
      speakKorean(message);
    },
    [playSound, speakKorean]
  );

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
  // 단독게임(SOLO) 20초 턴 타이머 & 10초 이하 카운트다운 시각/소리
  // =========================================================================
  useEffect(() => {
    if (appMode !== 'SOLO' || (gameState !== 'BETTING' && gameState !== 'PLAYING')) {
      lastCountdownSpokenRef.current = null;
      return;
    }

    const interval = window.setInterval(() => {
      setSoloTurnSeconds((prev) => {
        if (prev <= 1) {
          return 20;
        }
        const nextVal = prev - 1;
        if (nextVal <= 10 && lastCountdownSpokenRef.current !== nextVal) {
          lastCountdownSpokenRef.current = nextVal;
          playSound('tick');
          speakKorean(String(nextVal));
        }
        return nextVal;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [appMode, gameState, playSound, speakKorean]);

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
            currentBet: typeof p.currentBet === 'number' ? p.currentBet : 0,
          })),
          dealerHand: rData.dealerHand || [],
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

  // 넷게임 상단 안내가 변경될 때마다 음성으로 안내
  const prevNetNoticeRef = useRef<string>('');
  useEffect(() => {
    if (activeNetRoom?.turnNotice && activeNetRoom.turnNotice !== prevNetNoticeRef.current) {
      prevNetNoticeRef.current = activeNetRoom.turnNotice;
      speakKorean(activeNetRoom.turnNotice);
    }
  }, [activeNetRoom?.turnNotice, speakKorean]);

  // 넷게임 타이머 및 10초 이하 카운트다운 시각/소리
  useEffect(() => {
    if (appMode !== 'NET_ROOM' || !activeNetRoom) {
      setRemainingSeconds(0);
      setWaitingCountdownSec(420);
      lastCountdownSpokenRef.current = null;
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
        (activeNetRoom.status === 'BETTING' || activeNetRoom.status === 'PLAYING') &&
        activeNetRoom.turnDeadline
      ) {
        const diff = Math.max(0, Math.ceil((activeNetRoom.turnDeadline - now) / 1000));
        setRemainingSeconds(diff);

        // 10초 이하일 때 매초 소리와 음성 카운트다운
        if (diff > 0 && diff <= 10 && lastCountdownSpokenRef.current !== diff) {
          lastCountdownSpokenRef.current = diff;
          playSound('tick');
          speakKorean(String(diff));
        }

        if (diff === 0 && timeoutHandledRef.current !== activeNetRoom.turnDeadline) {
          timeoutHandledRef.current = activeNetRoom.turnDeadline;
          handleNetTurnTimeout(activeNetRoom);
        }
      } else {
        setRemainingSeconds(0);
        lastCountdownSpokenRef.current = null;
      }
    }, 300);

    return () => window.clearInterval(timer);
  }, [appMode, activeNetRoom, playSound, speakKorean, showToast]);

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
          room.status = 'WAITING';
          room.players.push({
            id: mySessionId,
            name: trimmedName,
            color: PIECE_COLORS[idx],
            hand: [],
            chips: INITIAL_CHIPS,
            wins: 0,
            currentBet: 0,
            status: 'BETTING',
          });
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
        showToast('⏳ 다음 판 예약자로 등록되었습니다!', 'info');
      }
    } catch (err) {
      console.error(err);
      alert('방 입장 중 오류가 발생했습니다.');
    }
  };

  const updateRoomSettings = async (newMinBet: number, newTimeout: number) => {
    if (!activeNetRoom) return;
    const clampedTimeout = Math.min(60, Math.max(15, newTimeout));
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      minBet: newMinBet,
      baseTimeout: clampedTimeout,
      waitingSince: Date.now(),
    });
  };

  const handleStartNetGameFromLobby = async () => {
    if (!activeNetRoom) return;
    const currentPlayers = activeNetRoom.players || [];
    if (currentPlayers.length < 1) return;

    const initializedPlayers: BlackjackPlayer[] = currentPlayers.map((p, idx) => ({
      ...p,
      color: PIECE_COLORS[idx % PIECE_COLORS.length],
      hand: [],
      chips: p.chips > 0 ? p.chips : INITIAL_CHIPS,
      currentBet: 0,
      status: 'BETTING',
      roundOutcome: undefined,
    }));

    const firstPlayer = initializedPlayers[0];
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await update(roomRef, {
      status: 'BETTING',
      roundNumber: 1,
      players: initializedPlayers,
      dealerHand: [],
      deck: createBlackjackDeck(),
      currentPlayerIdx: 0,
      turnDeadline: Date.now() + activeNetRoom.baseTimeout * 1000,
      winnerSummary: '',
      turnNotice: `🪙 [1라운드 베팅] ${firstPlayer.name}님 차례입니다! 행운의 코인을 걸어주세요!`,
      waitingSince: null,
    });
  };

  /**
   * 넷게임 코인 베팅 & 확정
   */
  const handleNetAddBet = async (amount: number) => {
    if (!activeNetRoom || activeNetRoom.status !== 'BETTING') return;
    const idx = activeNetRoom.currentPlayerIdx % activeNetRoom.players.length;
    const currP = activeNetRoom.players[idx];
    if (!currP || currP.id !== mySessionId) return;

    playSound('coin');
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;
      if (r.status !== 'BETTING') return r;
      const pIdx = r.currentPlayerIdx % r.players.length;
      const actor = r.players[pIdx];
      if (!actor || actor.id !== mySessionId) return r;

      const add = Math.min(actor.chips, amount);
      r.players[pIdx] = {
        ...actor,
        chips: actor.chips - add,
        currentBet: actor.currentBet + add,
      };
      return r;
    });
  };

  const handleNetConfirmBet = async () => {
    if (!activeNetRoom || activeNetRoom.status !== 'BETTING') return;
    const idx = activeNetRoom.currentPlayerIdx % activeNetRoom.players.length;
    const currP = activeNetRoom.players[idx];
    if (!currP || currP.id !== mySessionId) return;

    playSound('card');
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;
      if (r.status !== 'BETTING') return r;

      const pIdx = r.currentPlayerIdx % r.players.length;
      const actor = r.players[pIdx];
      if (!actor || actor.id !== mySessionId) return r;

      // 최소 베팅 미달 시 자동 보충
      let finalBet = actor.currentBet;
      let finalChips = actor.chips;
      if (finalBet === 0) {
        const autoAdd = Math.min(finalChips, r.minBet);
        finalBet += autoAdd;
        finalChips -= autoAdd;
      }

      r.players[pIdx] = {
        ...actor,
        chips: finalChips,
        currentBet: finalBet,
        status: 'PLAYING',
      };

      // 다음 베팅 플레이어 확인
      if (pIdx + 1 < r.players.length) {
        const nextIdx = pIdx + 1;
        r.currentPlayerIdx = nextIdx;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = `🪙 ${r.players[nextIdx].name}님 차례입니다! 얼마를 베팅하시겠어요?`;
        return r;
      }

      // 전원 베팅 완료 -> 카드 2장씩 배분 시작
      const deckCopy = r.deck && r.deck.length >= 20 ? [...r.deck] : createBlackjackDeck();
      const d1 = { ...deckCopy.shift()!, isFaceUp: true };
      const d2 = { ...deckCopy.shift()!, isFaceUp: false }; // 딜러 두 번째 카드는 히든
      r.dealerHand = [d1, d2];

      r.players = r.players.map((p) => {
        const c1 = { ...deckCopy.shift()!, isFaceUp: true };
        const c2 = { ...deckCopy.shift()!, isFaceUp: true };
        const hand = [c1, c2];
        const evalRes = calculateBlackjackScore(hand);
        return {
          ...p,
          hand,
          status: evalRes.isBlackjack ? 'BLACKJACK' : 'PLAYING',
        };
      });

      r.deck = deckCopy;
      const firstActiveIdx = r.players.findIndex((p) => p.status === 'PLAYING');

      if (firstActiveIdx === -1) {
        // 전원 블랙잭인 경우 즉시 딜러 턴 및 정산
        return settleNetRound(r);
      }

      r.status = 'PLAYING';
      r.currentPlayerIdx = firstActiveIdx;
      r.turnDeadline = Date.now() + r.baseTimeout * 1000;
      r.turnNotice = `🃏 카드 배분 완료! ${r.players[firstActiveIdx].name}님 차례입니다. 히트 또는 스탠드!`;
      return r;
    });
  };

  /**
   * 넷게임 라운드 최종 정산 헬퍼
   */
  const settleNetRound = (room: NetBlackjackRoomData): NetBlackjackRoomData => {
    const deckCopy = [...(room.deck || [])];
    const revealedDealer = room.dealerHand.map((c) => ({ ...c, isFaceUp: true }));

    // 생존 플레이어가 있으면 딜러는 17 이상이 될 때까지 히트
    const hasNonBustPlayer = room.players.some((p) => p.status !== 'BUST');
    if (hasNonBustPlayer) {
      while (calculateBlackjackScore(revealedDealer).score < 17 && deckCopy.length > 0) {
        revealedDealer.push({ ...deckCopy.shift()!, isFaceUp: true });
      }
    }

    const dealerEval = calculateBlackjackScore(revealedDealer);
    const winners: string[] = [];

    room.players = room.players.map((p) => {
      const pEval = calculateBlackjackScore(p.hand);
      if (p.status === 'BUST' || pEval.score > 21) {
        return { ...p, roundOutcome: `💥 버스트 패배 (-${p.currentBet})` };
      }
      if (p.status === 'BLACKJACK' && !dealerEval.isBlackjack) {
        const payout = Math.floor(p.currentBet * 2.5);
        winners.push(p.name);
        return {
          ...p,
          chips: p.chips + payout,
          wins: (p.wins || 0) + 1,
          roundOutcome: `👑 블랙잭 2.5배 승리! (+${payout})`,
        };
      }
      if (dealerEval.score > 21 || pEval.score > dealerEval.score) {
        const payout = p.currentBet * 2;
        winners.push(p.name);
        return {
          ...p,
          chips: p.chips + payout,
          wins: (p.wins || 0) + 1,
          roundOutcome: `🎉 승리! (+${payout})`,
        };
      }
      if (pEval.score === dealerEval.score) {
        return {
          ...p,
          chips: p.chips + p.currentBet,
          roundOutcome: `🤝 무승부 (원금 반환)`,
        };
      }
      return { ...p, roundOutcome: `😢 딜러 승 (-${p.currentBet})` };
    });

    const summary =
      winners.length > 0
        ? `${winners.join(', ')}님이 이겼습니다!`
        : `딜러(${dealerEval.score}점)가 승리했습니다!`;

    if (winners.length > 0) {
      saveHallOfFameRecord('NET', {
        name: winners.join(', '),
        scoreOrLevel: `${room.roundNumber}라운드 승리`,
      });
    }

    room.deck = deckCopy;
    room.dealerHand = revealedDealer;
    room.status = 'ROUND_OVER';
    room.winnerSummary = summary;
    room.turnDeadline = null;
    room.turnNotice = `🎊 ${summary}`;
    return room;
  };

  const handleNetPlayAction = async (action: 'HIT' | 'STAND' | 'DOUBLE') => {
    if (!activeNetRoom || activeNetRoom.status !== 'PLAYING') return;
    const idx = activeNetRoom.currentPlayerIdx % activeNetRoom.players.length;
    const currP = activeNetRoom.players[idx];
    if (!currP || currP.id !== mySessionId) return;

    if (action === 'DOUBLE') playSound('coin');
    else playSound('card');

    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;
      if (r.status !== 'PLAYING') return r;

      const pIdx = r.currentPlayerIdx % r.players.length;
      const actor = r.players[pIdx];
      if (!actor || actor.id !== mySessionId) return r;

      const deckCopy = [...(r.deck || [])];
      let updatedActor = { ...actor };

      if (action === 'HIT') {
        const drawn = deckCopy.shift();
        if (drawn) updatedActor.hand = [...updatedActor.hand, { ...drawn, isFaceUp: true }];
        const ev = calculateBlackjackScore(updatedActor.hand);
        if (ev.score > 21) {
          updatedActor.status = 'BUST';
        } else if (ev.score === 21) {
          updatedActor.status = 'STAND';
        }
      } else if (action === 'DOUBLE') {
        const extraBet = Math.min(updatedActor.chips, updatedActor.currentBet);
        updatedActor.chips -= extraBet;
        updatedActor.currentBet += extraBet;
        const drawn = deckCopy.shift();
        if (drawn) updatedActor.hand = [...updatedActor.hand, { ...drawn, isFaceUp: true }];
        const ev = calculateBlackjackScore(updatedActor.hand);
        updatedActor.status = ev.score > 21 ? 'BUST' : 'STAND';
      } else if (action === 'STAND') {
        updatedActor.status = 'STAND';
      }

      r.players[pIdx] = updatedActor;
      r.deck = deckCopy;

      if (updatedActor.status === 'PLAYING') {
        const scoreNow = calculateBlackjackScore(updatedActor.hand).score;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = pickRandomPhrase([
          `🔥 ${updatedActor.name}님 현재 ${scoreNow}점! 한 장 더 받으실까요?`,
          `⚡ 좋은 흐름이에요 ${updatedActor.name}님! (${scoreNow}점) 히트 또는 스탠드!`,
        ]);
        return r;
      }

      // 다음 PLAYING 플레이어 찾기
      const nextIdx = r.players.findIndex((p, i) => i > pIdx && p.status === 'PLAYING');
      if (nextIdx !== -1) {
        r.currentPlayerIdx = nextIdx;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = `🎯 ${r.players[nextIdx].name}님 차례입니다! 카드를 확인하고 결정하세요!`;
        return r;
      }

      return settleNetRound(r);
    });
  };

  const handleNetTurnTimeout = async (room: NetBlackjackRoomData) => {
    const roomRef = ref(db, `blackjack_rooms/room_${room.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;

      if (r.status === 'BETTING') {
        const pIdx = r.currentPlayerIdx % r.players.length;
        const actor = r.players[pIdx];
        const add = actor.currentBet === 0 ? Math.min(actor.chips, r.minBet) : 0;
        r.players[pIdx] = {
          ...actor,
          chips: actor.chips - add,
          currentBet: actor.currentBet + add,
          status: 'PLAYING',
        };
        if (pIdx + 1 < r.players.length) {
          r.currentPlayerIdx = pIdx + 1;
          r.turnDeadline = Date.now() + r.baseTimeout * 1000;
          r.turnNotice = `⏰ 시간 초과로 기본 베팅 처리! 다음은 ${r.players[pIdx + 1].name}님 차례입니다.`;
          return r;
        }
        const deckCopy = createBlackjackDeck();
        r.dealerHand = [
          { ...deckCopy.shift()!, isFaceUp: true },
          { ...deckCopy.shift()!, isFaceUp: false },
        ];
        r.players = r.players.map((p) => {
          const hand = [
            { ...deckCopy.shift()!, isFaceUp: true },
            { ...deckCopy.shift()!, isFaceUp: true },
          ];
          const ev = calculateBlackjackScore(hand);
          return { ...p, hand, status: ev.isBlackjack ? 'BLACKJACK' : 'PLAYING' };
        });
        r.deck = deckCopy;
        const firstActive = r.players.findIndex((p) => p.status === 'PLAYING');
        if (firstActive === -1) return settleNetRound(r);
        r.status = 'PLAYING';
        r.currentPlayerIdx = firstActive;
        r.turnDeadline = Date.now() + r.baseTimeout * 1000;
        r.turnNotice = `🃏 ${r.players[firstActive].name}님 차례입니다!`;
        return r;
      }

      if (r.status === 'PLAYING') {
        const pIdx = r.currentPlayerIdx % r.players.length;
        r.players[pIdx] = { ...r.players[pIdx], status: 'STAND' };
        const nextIdx = r.players.findIndex((p, i) => i > pIdx && p.status === 'PLAYING');
        if (nextIdx !== -1) {
          r.currentPlayerIdx = nextIdx;
          r.turnDeadline = Date.now() + r.baseTimeout * 1000;
          r.turnNotice = `⏰ 자동 스탠드 처리! 다음은 ${r.players[nextIdx].name}님 차례입니다.`;
          return r;
        }
        return settleNetRound(r);
      }

      return r;
    });
  };

  const handleStartNextNetRound = async () => {
    if (!activeNetRoom) return;
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;
      const nextRound = (r.roundNumber || 1) + 1;

      const waiters: BlackjackPlayer[] = (r.waitlist || []).slice(0, Math.max(0, 4 - r.players.length)).map((w) => ({
        id: w.id,
        name: w.name,
        color: PIECE_COLORS[0],
        hand: [],
        chips: INITIAL_CHIPS,
        wins: 0,
        currentBet: 0,
        status: 'BETTING',
      }));

      const nextParticipants = [...r.players, ...waiters].map((p, idx) => ({
        ...p,
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        hand: [],
        chips: p.chips > 0 ? p.chips : INITIAL_CHIPS,
        currentBet: 0,
        status: 'BETTING' as PlayerStatus,
        roundOutcome: undefined,
      }));

      r.status = 'BETTING';
      r.roundNumber = nextRound;
      r.players = nextParticipants;
      r.waitlist = (r.waitlist || []).slice(waiters.length);
      r.dealerHand = [];
      r.deck = createBlackjackDeck();
      r.currentPlayerIdx = 0;
      r.turnDeadline = Date.now() + r.baseTimeout * 1000;
      r.winnerSummary = '';
      r.turnNotice = `🪙 [${nextRound}라운드 베팅] ${nextParticipants[0].name}님 차례입니다! 코인을 걸어주세요!`;
      return r;
    });
  };

  const handleLeaveNetRoom = async () => {
    if (!activeNetRoom) {
      setAppMode('NET_LOBBY');
      return;
    }
    const roomRef = ref(db, `blackjack_rooms/room_${activeNetRoom.roomId}`);
    await runTransaction(roomRef, (roomData) => {
      if (!roomData) return roomData;
      const r = roomData as NetBlackjackRoomData;
      const fp = (r.players || []).filter((p) => p.id !== mySessionId);
      const fw = (r.waitlist || []).filter((w) => w.id !== mySessionId);
      const fs = (r.spectators || []).filter((s) => s.id !== mySessionId);
      if (fp.length === 0 && fs.length === 0) return createDefaultBlackjackRoom(r.roomId);
      r.players = fp;
      r.waitlist = fw;
      r.spectators = fs;
      if (fp.length > 0) r.currentPlayerIdx = r.currentPlayerIdx % fp.length;
      return r;
    });
    setSelectedRoomId(null);
    setAppMode('NET_LOBBY');
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
        status: 'BETTING',
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

  const startSoloBettingPhase = (isNextRound = false) => {
    const nextRound = isNextRound ? soloRoundNum + 1 : 1;
    setSoloRoundNum(nextRound);

    const resetPlayers: BlackjackPlayer[] = players.map((p, idx) => ({
      ...p,
      color: PIECE_COLORS[idx % PIECE_COLORS.length],
      hand: [],
      chips: p.chips > 0 ? p.chips : INITIAL_CHIPS,
      currentBet: 0,
      status: 'BETTING',
      roundOutcome: undefined,
    }));

    setPlayers(resetPlayers);
    setDealerHand([]);
    setDeck(createBlackjackDeck());
    setCurrentPlayerIdx(0);
    setWinnerBannerText('');
    setSoloTurnSeconds(20);
    lastCountdownSpokenRef.current = null;
    setGameState('BETTING');

    const msg = pickRandomPhrase([
      `🪙 [${nextRound}라운드] ${resetPlayers[0].name}님 차례입니다! 행운의 코인을 걸어주세요!`,
      `🎰 새 판이 시작됐어요! ${resetPlayers[0].name}님, 베팅 금액을 선택하세요!`,
    ]);
    announceTurnReset(msg, 'coin');
  };

  const handleSoloAddBet = (amount: number) => {
    if (gameState !== 'BETTING') return;
    const actor = players[currentPlayerIdx];
    const add = Math.min(actor.chips, amount);
    if (add <= 0) {
      showToast('보유 코인이 부족합니다!', 'danger');
      return;
    }

    playSound('coin');
    setPlayers((prev) =>
      prev.map((p, i) =>
        i === currentPlayerIdx
          ? { ...p, chips: p.chips - add, currentBet: p.currentBet + add }
          : p
      )
    );
  };

  const handleSoloConfirmBet = () => {
    if (gameState !== 'BETTING') return;
    const actor = players[currentPlayerIdx];
    let updatedPlayers = [...players];

    if (actor.currentBet === 0) {
      const autoAdd = Math.min(actor.chips, minBetOption);
      updatedPlayers[currentPlayerIdx] = {
        ...actor,
        chips: actor.chips - autoAdd,
        currentBet: autoAdd,
        status: 'PLAYING',
      };
    } else {
      updatedPlayers[currentPlayerIdx] = { ...actor, status: 'PLAYING' };
    }

    setSoloTurnSeconds(20);
    lastCountdownSpokenRef.current = null;

    if (currentPlayerIdx + 1 < updatedPlayers.length) {
      const nextIdx = currentPlayerIdx + 1;
      setPlayers(updatedPlayers);
      setCurrentPlayerIdx(nextIdx);
      const nextMsg = pickRandomPhrase([
        `🪙 다음은 ${updatedPlayers[nextIdx].name}님 차례입니다! 얼마를 베팅하시겠어요?`,
        `💰 ${updatedPlayers[nextIdx].name}님, 승부의 코인을 쌓아주세요!`,
      ]);
      announceTurnReset(nextMsg, 'coin');
      return;
    }

    // 전원 베팅 완료 -> 카드 배분
    const deckCopy = [...deck];
    const newDealerHand: BlackjackCard[] = [
      { ...deckCopy.shift()!, isFaceUp: true },
      { ...deckCopy.shift()!, isFaceUp: false },
    ];

    const dealtPlayers = updatedPlayers.map((p) => {
      const hand = [
        { ...deckCopy.shift()!, isFaceUp: true },
        { ...deckCopy.shift()!, isFaceUp: true },
      ];
      const ev = calculateBlackjackScore(hand);
      return {
        ...p,
        hand,
        status: (ev.isBlackjack ? 'BLACKJACK' : 'PLAYING') as PlayerStatus,
      };
    });

    setDeck(deckCopy);
    setDealerHand(newDealerHand);
    setPlayers(dealtPlayers);

    const firstPlayableIdx = dealtPlayers.findIndex((p) => p.status === 'PLAYING');
    if (firstPlayableIdx === -1) {
      finishSoloRound(dealtPlayers, newDealerHand, deckCopy);
      return;
    }

    setCurrentPlayerIdx(firstPlayableIdx);
    setGameState('PLAYING');
    const score = calculateBlackjackScore(dealtPlayers[firstPlayableIdx].hand).score;
    const startMsg = pickRandomPhrase([
      `🃏 카드 배분 완료! ${dealtPlayers[firstPlayableIdx].name}님 (${score}점) 차례입니다!`,
      `✨ ${dealtPlayers[firstPlayableIdx].name}님 차례! 현재 ${score}점, 히트할까요 스탠드할까요?`,
    ]);
    announceTurnReset(startMsg, 'card');
  };

  const finishSoloRound = (
    currentPlayers: BlackjackPlayer[],
    currentDealerHand: BlackjackCard[],
    currentDeck: BlackjackCard[]
  ) => {
    const deckCopy = [...currentDeck];
    const revealedDealer = currentDealerHand.map((c) => ({ ...c, isFaceUp: true }));

    const hasAlivePlayer = currentPlayers.some((p) => p.status !== 'BUST');
    if (hasAlivePlayer) {
      while (calculateBlackjackScore(revealedDealer).score < 17 && deckCopy.length > 0) {
        revealedDealer.push({ ...deckCopy.shift()!, isFaceUp: true });
      }
    }

    const dealerEval = calculateBlackjackScore(revealedDealer);
    const winners: string[] = [];

    const settledPlayers = currentPlayers.map((p) => {
      const pEval = calculateBlackjackScore(p.hand);
      if (p.status === 'BUST' || pEval.score > 21) {
        return { ...p, roundOutcome: `💥 버스트 패배 (-${p.currentBet.toLocaleString()})` };
      }
      if (p.status === 'BLACKJACK' && !dealerEval.isBlackjack) {
        const payout = Math.floor(p.currentBet * 2.5);
        winners.push(p.name);
        return {
          ...p,
          chips: p.chips + payout,
          wins: p.wins + 1,
          roundOutcome: `👑 블랙잭 2.5배 승리! (+${payout.toLocaleString()})`,
        };
      }
      if (dealerEval.score > 21 || pEval.score > dealerEval.score) {
        const payout = p.currentBet * 2;
        winners.push(p.name);
        return {
          ...p,
          chips: p.chips + payout,
          wins: p.wins + 1,
          roundOutcome: `🎉 승리! (+${payout.toLocaleString()})`,
        };
      }
      if (pEval.score === dealerEval.score) {
        return {
          ...p,
          chips: p.chips + p.currentBet,
          roundOutcome: `🤝 무승부 (원금 반환)`,
        };
      }
      return { ...p, roundOutcome: `😢 딜러 승 (-${p.currentBet.toLocaleString()})` };
    });

    const bannerText =
      winners.length > 0
        ? `${winners.join(', ')}님이 이겼습니다!`
        : `딜러(${dealerEval.score}점)가 이겼습니다!`;

    setDeck(deckCopy);
    setDealerHand(revealedDealer);
    setPlayers(settledPlayers);
    setWinnerBannerText(bannerText);
    setGameState('ROUND_OVER');

    if (winners.length > 0) {
      announceTurnReset(`🎊 축하합니다! ${bannerText} 🎊`, 'win');
      saveHallOfFameRecord('SOLO', {
        name: winners.join(', '),
        scoreOrLevel: `${soloRoundNum}라운드 승리`,
      });
    } else {
      announceTurnReset(`🃏 딜러가 ${dealerEval.score}점으로 이번 라운드를 가져갑니다!`, 'bust');
    }
  };

  const handleSoloPlayAction = (action: 'HIT' | 'STAND' | 'DOUBLE') => {
    if (gameState !== 'PLAYING') return;
    const actor = players[currentPlayerIdx];
    const deckCopy = [...deck];
    let updatedActor = { ...actor };

    if (action === 'HIT') {
      const drawn = deckCopy.shift();
      if (drawn) updatedActor.hand = [...updatedActor.hand, { ...drawn, isFaceUp: true }];
      const ev = calculateBlackjackScore(updatedActor.hand);
      if (ev.score > 21) {
        updatedActor.status = 'BUST';
      } else if (ev.score === 21) {
        updatedActor.status = 'STAND';
      }
    } else if (action === 'DOUBLE') {
      const extraBet = Math.min(updatedActor.chips, updatedActor.currentBet);
      updatedActor.chips -= extraBet;
      updatedActor.currentBet += extraBet;
      const drawn = deckCopy.shift();
      if (drawn) updatedActor.hand = [...updatedActor.hand, { ...drawn, isFaceUp: true }];
      const ev = calculateBlackjackScore(updatedActor.hand);
      updatedActor.status = ev.score > 21 ? 'BUST' : 'STAND';
    } else if (action === 'STAND') {
      updatedActor.status = 'STAND';
    }

    const updatedPlayers = players.map((p, i) => (i === currentPlayerIdx ? updatedActor : p));
    setDeck(deckCopy);
    setPlayers(updatedPlayers);
    setSoloTurnSeconds(20);
    lastCountdownSpokenRef.current = null;

    if (updatedActor.status === 'PLAYING') {
      const scoreNow = calculateBlackjackScore(updatedActor.hand).score;
      const hitMsg = pickRandomPhrase([
        `🔥 나이스 히트! ${updatedActor.name}님 현재 ${scoreNow}점입니다. 계속 가실까요?`,
        `⚡ 심장이 쫄깃하네요! ${updatedActor.name}님 ${scoreNow}점, 다음 선택은?`,
      ]);
      announceTurnReset(hitMsg, 'card');
      return;
    }

    const nextIdx = updatedPlayers.findIndex((p, i) => i > currentPlayerIdx && p.status === 'PLAYING');
    if (nextIdx !== -1) {
      const prevResultNote =
        updatedActor.status === 'BUST'
          ? `💥 ${updatedActor.name}님 21 초과 버스트! `
          : action === 'DOUBLE'
          ? `🚀 더블다운 완료! `
          : '';
      const nextScore = calculateBlackjackScore(updatedPlayers[nextIdx].hand).score;
      setCurrentPlayerIdx(nextIdx);
      announceTurnReset(
        `${prevResultNote}다음은 ${updatedPlayers[nextIdx].name}님(${nextScore}점) 차례입니다!`,
        updatedActor.status === 'BUST' ? 'bust' : 'card'
      );
      return;
    }

    finishSoloRound(updatedPlayers, dealerHand, deckCopy);
  };

  // =========================================================================
  // 리얼 트럼프 카드 렌더링 헬퍼
  // =========================================================================
  const renderRealCard = (card: BlackjackCard, forceVisible = false, mini = false) => {
    const visible = card.isFaceUp || forceVisible;
    const red = isRedSuit(card.suit);
    const rankStr = getRankLabel(card.rank);
    const suitStr = getSuitSymbol(card.suit);

    if (!visible) {
      return (
        <div key={card.id} className={`bj-real-card face-down ${mini ? 'mini' : ''}`}>
          <div className="card-back-classic">♠</div>
        </div>
      );
    }

    return (
      <div
        key={card.id}
        className={`bj-real-card ${red ? 'red' : 'black'} ${mini ? 'mini' : ''}`}
      >
        <div className="card-corner-top">
          <span className="corner-rank">{rankStr}</span>
          <span className="corner-suit">{suitStr}</span>
        </div>
        <div className="card-center-art">{getCenterCardGraphic(card)}</div>
        <div className="card-corner-bottom">
          <span className="corner-rank">{rankStr}</span>
          <span className="corner-suit">{suitStr}</span>
        </div>
      </div>
    );
  };

  // =========================================================================
  // 1. 홈 화면 (HOME)
  // =========================================================================
  if (appMode === 'HOME') {
    return (
      <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0] }}>
        <div className="setup-card home-entry-card">
          <div className="home-castle-icon">🃏👑🪙</div>
          <h1 className="setup-title">로열 블랙잭 (ROYAL BLACKJACK)</h1>
          <p className="home-subtitle">21을 향한 짜릿한 승부! 코인을 쌓고 딜러를 이겨라!</p>

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
              <span className="mode-desc">1~4명이 함께 즐기는 리얼 블랙잭</span>
            </button>

            <button
              type="button"
              className="mode-select-btn net"
              onClick={() => setAppMode('NET_LOBBY')}
            >
              <span className="mode-icon">🌐</span>
              <strong>넷게임</strong>
              <span className="mode-desc">온라인 4개 방 실시간 대전 · 승수/코인 누적</span>
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
            <h2 style={{ margin: 0, color: '#0f172a' }}>🏅 블랙잭 명예의 전당</h2>
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
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px' }}>
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
                    <div key={rec.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', background: '#fff', padding: '6px 8px', borderRadius: '6px' }}>
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
              🌐 블랙잭 넷게임 (4개 테이블)
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
                statusBadgeText = isFull ? `🟠 대기중 (만석 4/4)` : `🟡 대기중 (${roomPlayers.length}/4명)`;
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
                    <span className="room-number-title">🃏 제 {room.roomId} 블랙잭룸</span>
                    <span className={`room-status-pill ${statusClass}`}>{statusBadgeText}</span>
                  </div>

                  <div className="room-rules-info">
                    <span>🪙 최소 베팅: {room.minBet.toLocaleString()}코인</span>
                    <span>⏱️ 턴 제한: {room.baseTimeout}초</span>
                  </div>

                  <div className="room-members-box">
                    <div className="room-members-label">참가자 ({roomPlayers.length}/4):</div>
                    <div className="room-members-chips">
                      {roomPlayers.length === 0 ? (
                        <span className="empty-member-text">첫 번째 도전자 대기 중</span>
                      ) : (
                        roomPlayers.map((p, idx) => (
                          <span key={p.id} className="member-chip" style={{ borderColor: PIECE_COLORS[idx] }}>
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
                      ⏳ 다음 판 예약 ({roomWaitlist.length}명): {roomWaitlist.map((w) => w.name).join(', ')}
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
              <h2 style={{ margin: '0 0 8px' }}>🃏 제 {joinModalRoom.roomId} 블랙잭룸 입장</h2>
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
  // 4. 넷게임 방 내부 (NET_ROOM)
  // =========================================================================
  if (appMode === 'NET_ROOM') {
    if (!activeNetRoom) {
      return (
        <div className="bj-container" style={{ background: PLAYER_BG_COLORS[0], display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="setup-card" style={{ textAlign: 'center' }}>
            <h2>⏳ 방 정보를 불러오는 중...</h2>
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
              🃏 블랙잭 대기실 {amISpectator ? '👀 [관망모드]' : ''}
            </h1>

            <div className="setting-section">
              <label className="setting-label">
                🪙 최소 베팅 코인 설정 {isHost ? '(방장 설정 가능)' : '(방장이 설정 중)'}
              </label>
              <div className="piece-count-selector">
                {[100, 200, 500].map((val) => (
                  <button
                    key={val}
                    type="button"
                    disabled={!isHost}
                    className={`count-btn ${activeNetRoom.minBet === val ? 'active' : ''}`}
                    onClick={() => updateRoomSettings(val, activeNetRoom.baseTimeout)}
                  >
                    {val}코인
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">
                ⏱️ 턴 제한시간: <strong>{activeNetRoom.baseTimeout}초</strong>
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
                  onChange={(e) => updateRoomSettings(activeNetRoom.minBet, Number(e.target.value))}
                />
                <span style={{ fontSize: '12px', fontWeight: 700 }}>60초</span>
              </div>
            </div>

            <div className="setting-section">
              <label className="setting-label">🧭 입장한 플레이어 (초기 {INITIAL_CHIPS.toLocaleString()}코인 지급)</label>
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
                      {p.wins || 0}승 · {(p.chips ?? INITIAL_CHIPS).toLocaleString()}코인
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="btn btn-success"
              disabled={roomPlayers.length < 1}
              onClick={handleStartNetGameFromLobby}
            >
              🚀 블랙잭 게임 시작! ({roomPlayers.length}/4명)
            </button>
          </div>
        </div>
      );
    }

    const netCurrIdx = (activeNetRoom.currentPlayerIdx || 0) % roomPlayers.length;
    const netCurrPlayer = roomPlayers[netCurrIdx];
    const isMyTurn =
      (activeNetRoom.status === 'BETTING' || activeNetRoom.status === 'PLAYING') &&
      netCurrPlayer?.id === mySessionId &&
      !amISpectator;

    const myPlayerObj = roomPlayers.find((p) => p.id === mySessionId);
    const dealerEval = calculateBlackjackScore(
      activeNetRoom.dealerHand,
      activeNetRoom.status !== 'ROUND_OVER'
    );
    const totalTablePot = roomPlayers.reduce((acc, p) => acc + (p.currentBet || 0), 0);
    const potCoins = buildCoinVisuals(totalTablePot);

    return (
      <div
        className="bj-container"
        style={{ background: PLAYER_BG_COLORS[netCurrIdx % PLAYER_BG_COLORS.length] }}
      >
        {activeNetRoom.status === 'ROUND_OVER' && <FireworksOverlay />}

        {toast && (
          <div key={toast.id} className={`bj-toast ${toast.type}`}>
            {toast.text}
          </div>
        )}

        {/* 10초 이하 거대 카운트다운 */}
        {remainingSeconds > 0 && remainingSeconds <= 10 && activeNetRoom.status !== 'ROUND_OVER' && (
          <div className="countdown-urgent-overlay">
            <div className="countdown-circle-number">{remainingSeconds}</div>
            <span className="countdown-sub-label">⏰ 서두르세요!</span>
          </div>
        )}

        <div className="play-wrapper compact-tablet-mode">
          <div className="game-header compact-header">
            <div className="net-level-timer-box">
              <span className="net-level-badge">
                {activeNetRoom.roundNumber}판째 {amISpectator ? '👀[관망]' : ''}
              </span>
              {activeNetRoom.status !== 'ROUND_OVER' && (
                <span className={`net-timer-badge ${remainingSeconds <= 10 ? 'urgent' : ''}`}>
                  ⏱️ {remainingSeconds}초
                </span>
              )}
            </div>

            <div className="player-status-bar">
              {roomPlayers.map((p, idx) => {
                const isActive = activeNetRoom.status !== 'ROUND_OVER' && idx === netCurrIdx;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${isActive ? 'active-turn-float' : ''} ${
                      p.status === 'BUST' ? 'eliminated' : ''
                    }`}
                    style={{ borderColor: isActive ? p.color : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong className={isActive ? 'turn-floating-name' : ''}>
                        {p.name}
                        {p.id === mySessionId ? '(나)' : ''}
                      </strong>
                      <span className="win-count-pill">🏆{p.wins || 0}승</span>
                      <span className="badge-score">🪙{(p.chips ?? 0).toLocaleString()}</span>
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
                ? '⏳ 다음 판 예약 대기 중입니다!'
                : `⏳ 다음 판 예약자 (${roomWaitlist.length}명): ${roomWaitlist.map((w) => w.name).join(', ')}`}
            </div>
          )}

          <div className="bj-table-board">
            {activeNetRoom.status === 'ROUND_OVER' ? (
              <div className="winner-celebration-top-bar">
                <div className="winner-celebrate-title">
                  🎊🎉 축하합니다! <strong>{activeNetRoom.winnerSummary}</strong> 🎉🎊
                </div>
                <div className="winner-celebrate-stats">
                  {roomPlayers.map((p) => (
                    <span key={p.id} className="stat-chip">
                      {p.name}: {p.roundOutcome}
                    </span>
                  ))}
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
                    🔥 다음 라운드 시작 (승수·코인 누적)
                  </button>
                </div>
              </div>
            ) : (
              <div key={activeNetRoom.turnNotice} className="bj-notice-banner">
                {activeNetRoom.turnNotice}
              </div>
            )}

            {/* 딜러 카드 구역 */}
            <div className="dealer-zone">
              <div className="dealer-header">
                <span>🎩 딜러 (DEALER)</span>
                {activeNetRoom.dealerHand.length > 0 && (
                  <span className="dealer-score-pill">
                    {activeNetRoom.status === 'ROUND_OVER'
                      ? `최종 ${dealerEval.score}점`
                      : `오픈 ${dealerEval.score}점`}
                  </span>
                )}
              </div>
              <div className="cards-row">
                {activeNetRoom.dealerHand.map((card) =>
                  renderRealCard(card, activeNetRoom.status === 'ROUND_OVER')
                )}
              </div>
            </div>

            {/* 중앙 베팅 코인 스택 */}
            <div className="center-bet-pot-zone">
              <div className="coin-stack-display">
                {potCoins.length === 0 ? (
                  <span className="pot-amount-text">🪙 베팅 대기 중</span>
                ) : (
                  <>
                    {potCoins.map((c) => (
                      <span key={c.id} className={`casino-coin ${c.colorClass}`}>
                        {c.label}
                      </span>
                    ))}
                    <span className="pot-amount-text">
                      총 베팅: {totalTablePot.toLocaleString()} 코인
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* 참가자 카드 현황 */}
            <div className="opponents-zone">
              {roomPlayers.map((p, idx) => {
                const isActive = activeNetRoom.status !== 'ROUND_OVER' && idx === netCurrIdx;
                const pEval = calculateBlackjackScore(p.hand);
                return (
                  <div
                    key={p.id}
                    className={`opponent-hand-card ${isActive ? 'active-turn-card' : ''} ${
                      p.roundOutcome?.includes('승리') ? 'winner-highlight-card' : ''
                    }`}
                  >
                    <div className="opp-header">
                      <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                        {getShortName(p.name)}
                      </span>
                      <strong className={isActive ? 'turn-floating-name' : ''}>{p.name}</strong>
                      <span className="opp-stat-mini">
                        베팅 🪙{p.currentBet.toLocaleString()}
                      </span>
                      {p.hand.length > 0 && (
                        <span
                          className={`status-tag ${
                            p.status === 'BUST'
                              ? 'bust'
                              : p.status === 'BLACKJACK'
                              ? 'blackjack'
                              : p.status === 'STAND'
                              ? 'stand'
                              : 'win'
                          }`}
                        >
                          {p.status === 'BUST'
                            ? `💥 버스트(${pEval.score})`
                            : p.status === 'BLACKJACK'
                            ? '👑 블랙잭(21)'
                            : `${pEval.score}점`}
                        </span>
                      )}
                    </div>

                    <div className="cards-row">
                      {p.hand.map((card) => renderRealCard(card, true, true))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 하단 내 손패 및 컨트롤 */}
          {(myPlayerObj || netCurrPlayer) && (
            <div
              className="bj-bottom-dock"
              style={{ borderTop: `4px solid ${(myPlayerObj || netCurrPlayer).color}` }}
            >
              {(() => {
                const owner = myPlayerObj || netCurrPlayer;
                const myEval = calculateBlackjackScore(owner.hand);
                return (
                  <>
                    <div className="dock-top-status">
                      <span
                        className={`turn-owner-pill ${isMyTurn ? 'floating-pill' : ''}`}
                        style={{ backgroundColor: owner.color }}
                      >
                        {owner.name} · 🏆{owner.wins || 0}승 · 🪙{owner.chips.toLocaleString()}코인 (베팅:{' '}
                        {owner.currentBet.toLocaleString()})
                      </span>

                      <span className="step-status-badge">
                        {owner.hand.length > 0
                          ? `내 점수: ${myEval.score}점 ${myEval.isBlackjack ? '👑블랙잭!' : ''}`
                          : isMyTurn
                          ? '코인을 베팅한 뒤 확정 버튼을 누르세요!'
                          : `${netCurrPlayer?.name}님의 차례를 기다리는 중...`}
                      </span>
                    </div>

                    {isMyTurn && activeNetRoom.status === 'BETTING' && (
                      <div className="action-controls-row">
                        <button
                          type="button"
                          className="bj-action-btn bet-coin"
                          disabled={owner.chips < activeNetRoom.minBet}
                          onClick={() => handleNetAddBet(activeNetRoom.minBet)}
                        >
                          🪙 +{activeNetRoom.minBet} 코인
                        </button>
                        <button
                          type="button"
                          className="bj-action-btn bet-coin"
                          disabled={owner.chips < activeNetRoom.minBet * 2}
                          onClick={() => handleNetAddBet(activeNetRoom.minBet * 2)}
                        >
                          🪙 +{activeNetRoom.minBet * 2} 코인
                        </button>
                        <button
                          type="button"
                          className="bj-action-btn bet-coin"
                          disabled={owner.chips < 1000}
                          onClick={() => handleNetAddBet(1000)}
                        >
                          🪙 +1,000 코인
                        </button>
                        <button
                          type="button"
                          className="bj-action-btn hit"
                          onClick={handleNetConfirmBet}
                        >
                          ✅ 베팅 확정!
                        </button>
                      </div>
                    )}

                    {isMyTurn && activeNetRoom.status === 'PLAYING' && (
                      <div className="action-controls-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                        <button
                          type="button"
                          className="bj-action-btn hit"
                          onClick={() => handleNetPlayAction('HIT')}
                        >
                          🃏 히트 (1장 받기)
                        </button>
                        <button
                          type="button"
                          className="bj-action-btn stand"
                          onClick={() => handleNetPlayAction('STAND')}
                        >
                          ✋ 스탠드 (멈춤)
                        </button>
                        <button
                          type="button"
                          className="bj-action-btn double"
                          disabled={owner.hand.length !== 2 || owner.chips < owner.currentBet}
                          onClick={() => handleNetPlayAction('DOUBLE')}
                        >
                          🚀 더블다운 (2배)
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
  // 5. 단독게임(SOLO) SETUP / READY / BETTING / PLAYING / ROUND_OVER
  // =========================================================================
  const currentPlayer = players[currentPlayerIdx];
  const currentBackground =
    (gameState === 'BETTING' || gameState === 'PLAYING') && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  const soloDealerEval = calculateBlackjackScore(dealerHand, gameState !== 'ROUND_OVER');
  const soloTotalPot = players.reduce((acc, p) => acc + p.currentBet, 0);
  const soloPotCoins = buildCoinVisuals(soloTotalPot);

  return (
    <div className="bj-container" style={{ background: currentBackground }}>
      {gameState === 'ROUND_OVER' && winnerBannerText.includes('이겼습니다') && <FireworksOverlay />}

      {toast && (
        <div key={toast.id} className={`bj-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* 10초 이하 카운트다운 시각 경고 */}
      {(gameState === 'BETTING' || gameState === 'PLAYING') && soloTurnSeconds <= 10 && (
        <div className="countdown-urgent-overlay">
          <div className="countdown-circle-number">{soloTurnSeconds}</div>
          <span className="countdown-sub-label">⏰ 제한시간 카운트다운!</span>
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
          <h1 className="setup-title">🃏 로열 블랙잭 (단독게임)</h1>

          <div className="setting-section">
            <label className="setting-label">🪙 최소 베팅 단위 설정 (초기 지급 10,000코인)</label>
            <div className="piece-count-selector">
              {[100, 200, 500].map((val) => (
                <button
                  key={val}
                  type="button"
                  className={`count-btn ${minBetOption === val ? 'active' : ''}`}
                  onClick={() => setMinBetOption(val)}
                >
                  {val}코인
                </button>
              ))}
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
            onClick={() => setGameState('READY')}
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
            <button type="button" className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
              ⬅️ 설정으로
            </button>
            <button
              type="button"
              className="btn btn-success"
              onClick={() => startSoloBettingPhase(false)}
            >
              🚀 블랙잭 시작!
            </button>
          </div>
        </div>
      )}

      {/* BETTING / PLAYING / ROUND_OVER 화면 */}
      {(gameState === 'BETTING' || gameState === 'PLAYING' || gameState === 'ROUND_OVER') &&
        currentPlayer && (
          <div className="play-wrapper compact-tablet-mode">
            <div className="game-header compact-header">
              <div className="net-level-timer-box">
                <span className="net-level-badge">{soloRoundNum}라운드</span>
                {gameState !== 'ROUND_OVER' && (
                  <span className={`net-timer-badge ${soloTurnSeconds <= 10 ? 'urgent' : ''}`}>
                    ⏱️ {soloTurnSeconds}초
                  </span>
                )}
              </div>

              <div className="player-status-bar">
                {players.map((p, idx) => {
                  const isActive = gameState !== 'ROUND_OVER' && idx === currentPlayerIdx;
                  return (
                    <div
                      key={p.id}
                      className={`player-badge-card ${isActive ? 'active-turn-float' : ''} ${
                        p.status === 'BUST' ? 'eliminated' : ''
                      }`}
                      style={{ borderColor: isActive ? p.color : 'transparent' }}
                    >
                      <div className="player-badge-top">
                        <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                          {getShortName(p.name)}
                        </span>
                        <strong className={isActive ? 'turn-floating-name' : ''}>{p.name}</strong>
                        <span className="win-count-pill">🏆{p.wins}승</span>
                        <span className="badge-score">🪙{p.chips.toLocaleString()}</span>
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
              {gameState === 'ROUND_OVER' ? (
                <div className="winner-celebration-top-bar">
                  <div className="winner-celebrate-title">
                    🎊🎉 축하합니다! <strong>{winnerBannerText}</strong> 🎉🎊
                  </div>
                  <div className="winner-celebrate-stats">
                    {players.map((p) => (
                      <span key={p.id} className="stat-chip">
                        {p.name}: {p.roundOutcome}
                      </span>
                    ))}
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
                      onClick={() => startSoloBettingPhase(true)}
                    >
                      🔥 다음 라운드 시작 (승수·코인 누적)
                    </button>
                  </div>
                </div>
              ) : (
                /* 턴이 바뀔 때마다 key 변경과 함께 새로 리셋되는 상단 텍스트 안내 */
                <div key={turnNotice} className="bj-notice-banner">
                  {turnNotice}
                </div>
              )}

              {/* 딜러 카드 구역 */}
              <div className="dealer-zone">
                <div className="dealer-header">
                  <span>🎩 딜러 (DEALER)</span>
                  {dealerHand.length > 0 && (
                    <span className="dealer-score-pill">
                      {gameState === 'ROUND_OVER'
                        ? `최종 ${soloDealerEval.score}점`
                        : `오픈 ${soloDealerEval.score}점`}
                    </span>
                  )}
                </div>
                <div className="cards-row">
                  {dealerHand.map((card) => renderRealCard(card, gameState === 'ROUND_OVER'))}
                </div>
              </div>

              {/* 중앙 코인 베팅 애니메이션 구역 */}
              <div className="center-bet-pot-zone">
                <div className="coin-stack-display">
                  {soloPotCoins.length === 0 ? (
                    <span className="pot-amount-text">🪙 아래 코인 버튼을 눌러 베팅하세요!</span>
                  ) : (
                    <>
                      {soloPotCoins.map((c) => (
                        <span key={c.id} className={`casino-coin ${c.colorClass}`}>
                          {c.label}
                        </span>
                      ))}
                      <span className="pot-amount-text">
                        총 베팅 코인: {soloTotalPot.toLocaleString()}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* 모든 플레이어 카드 구역 */}
              <div className="opponents-zone">
                {players.map((p, idx) => {
                  const isActive = gameState !== 'ROUND_OVER' && idx === currentPlayerIdx;
                  const pEval = calculateBlackjackScore(p.hand);
                  return (
                    <div
                      key={p.id}
                      className={`opponent-hand-card ${isActive ? 'active-turn-card' : ''} ${
                        p.roundOutcome?.includes('승리') ? 'winner-highlight-card' : ''
                      }`}
                    >
                      <div className="opp-header">
                        <span className="squircle-dot mini" style={{ backgroundColor: p.color }}>
                          {getShortName(p.name)}
                        </span>
                        <strong className={isActive ? 'turn-floating-name' : ''}>{p.name}</strong>
                        <span className="opp-stat-mini">
                          베팅 🪙{p.currentBet.toLocaleString()}
                        </span>
                        {p.hand.length > 0 && (
                          <span
                            className={`status-tag ${
                              p.status === 'BUST'
                                ? 'bust'
                                : p.status === 'BLACKJACK'
                                ? 'blackjack'
                                : p.status === 'STAND'
                                ? 'stand'
                                : 'win'
                            }`}
                          >
                            {p.status === 'BUST'
                              ? `💥 버스트(${pEval.score})`
                              : p.status === 'BLACKJACK'
                              ? '👑 블랙잭(21)'
                              : `${pEval.score}점`}
                          </span>
                        )}
                      </div>

                      <div className="cards-row">
                        {p.hand.map((card) => renderRealCard(card, true, true))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 하단 현재 플레이어 손패 및 컨트롤 도크 */}
            <div
              className="bj-bottom-dock"
              style={{ borderTop: `4px solid ${currentPlayer.color}` }}
            >
              <div className="dock-top-status">
                <span
                  className={`turn-owner-pill ${gameState !== 'ROUND_OVER' ? 'floating-pill' : ''}`}
                  style={{ backgroundColor: currentPlayer.color }}
                >
                  {currentPlayer.name} · 🏆{currentPlayer.wins}승 · 🪙
                  {currentPlayer.chips.toLocaleString()}코인 (베팅:{' '}
                  {currentPlayer.currentBet.toLocaleString()})
                </span>

                <span className="step-status-badge">
                  {gameState === 'BETTING'
                    ? '🪙 코인을 클릭해 베팅 후 [베팅 확정]을 누르세요'
                    : `현재 점수: ${calculateBlackjackScore(currentPlayer.hand).score}점`}
                </span>
              </div>

              {currentPlayer.hand.length > 0 && (
                <div className="my-hand-area">
                  <div className="cards-row my-cards">
                    {currentPlayer.hand.map((card) => renderRealCard(card, true, false))}
                  </div>
                </div>
              )}

              {gameState === 'BETTING' && (
                <div className="action-controls-row">
                  <button
                    type="button"
                    className="bj-action-btn bet-coin"
                    disabled={currentPlayer.chips < minBetOption}
                    onClick={() => handleSoloAddBet(minBetOption)}
                  >
                    🪙 +{minBetOption} 코인
                  </button>
                  <button
                    type="button"
                    className="bj-action-btn bet-coin"
                    disabled={currentPlayer.chips < minBetOption * 2}
                    onClick={() => handleSoloAddBet(minBetOption * 2)}
                  >
                    🪙 +{minBetOption * 2} 코인
                  </button>
                  <button
                    type="button"
                    className="bj-action-btn bet-coin"
                    disabled={currentPlayer.chips < 1000}
                    onClick={() => handleSoloAddBet(1000)}
                  >
                    🪙 +1,000 코인
                  </button>
                  <button
                    type="button"
                    className="bj-action-btn hit"
                    onClick={handleSoloConfirmBet}
                  >
                    ✅ 베팅 확정!
                  </button>
                </div>
              )}

              {gameState === 'PLAYING' && currentPlayer.status === 'PLAYING' && (
                <div className="action-controls-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  <button
                    type="button"
                    className="bj-action-btn hit"
                    onClick={() => handleSoloPlayAction('HIT')}
                  >
                    🃏 히트 (1장 더)
                  </button>
                  <button
                    type="button"
                    className="bj-action-btn stand"
                    onClick={() => handleSoloPlayAction('STAND')}
                  >
                    ✋ 스탠드 (멈춤)
                  </button>
                  <button
                    type="button"
                    className="bj-action-btn double"
                    disabled={
                      currentPlayer.hand.length !== 2 ||
                      currentPlayer.chips < currentPlayer.currentBet
                    }
                    onClick={() => handleSoloPlayAction('DOUBLE')}
                  >
                    🚀 더블다운 (2배)
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}