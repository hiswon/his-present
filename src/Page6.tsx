import { useState, useEffect, useRef } from 'react';
import './Page6.css';

interface WordPair {
  id: number;
  en: string;
  kr: string;
  emoji: string;
}

interface CardItem extends WordPair {
  uniqueId: number;
}

interface Player {
  id: number;
  name: string;
  score: number;
  totalWins: number;
  totalScore: number;
}

// 플레이어별 순환 배경 파스텔톤 컬러 팔레트
const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)', // 연한 하늘/보라
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)', // 연한 핑크/노랑
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)', // 연한 민트/하늘
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)', // 연한 오렌지/핑크
  'linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%, #e0e7ff 100%)', // 연한 라벤더
];

const WORD_POOLS: Record<number, WordPair[]> = {
  1: [
    { id: 101, en: 'Apple', kr: '사과', emoji: '🍎' },
    { id: 102, en: 'Cat', kr: '고양이', emoji: '🐱' },
    { id: 103, en: 'Dog', kr: '강아지', emoji: '🐶' },
    { id: 104, en: 'Sun', kr: '태양', emoji: '☀️' },
    { id: 105, en: 'Book', kr: '책', emoji: '📖' },
    { id: 106, en: 'Tree', kr: '나무', emoji: '🌳' },
    { id: 107, en: 'Water', kr: '물', emoji: '💧' },
    { id: 108, en: 'Car', kr: '자동차', emoji: '🚗' },
    { id: 109, en: 'Fish', kr: '물고기', emoji: '🐟' },
    { id: 110, en: 'Bird', kr: '새', emoji: '🐦' },
    { id: 111, en: 'Flower', kr: '꽃', emoji: '🌸' },
    { id: 112, en: 'House', kr: '집', emoji: '🏠' },
    { id: 113, en: 'Star', kr: '별', emoji: '⭐' },
    { id: 114, en: 'Moon', kr: '달', emoji: '🌙' },
    { id: 115, en: 'Milk', kr: '우유', emoji: '🥛' },
    { id: 116, en: 'Ball', kr: '공', emoji: '⚽' },
    { id: 117, en: 'Hat', kr: '모자', emoji: '🧢' },
    { id: 118, en: 'Shoe', kr: '신발', emoji: '👟' },
    { id: 119, en: 'Bag', kr: '가방', emoji: '🎒' },
    { id: 120, en: 'Bed', kr: '침대', emoji: '🛏️' },
  ],
  2: [
    { id: 201, en: 'School', kr: '학교', emoji: '🏫' },
    { id: 202, en: 'Pencil', kr: '연필', emoji: '✏️' },
    { id: 203, en: 'Teacher', kr: '선생님', emoji: '👩‍🏫' },
    { id: 204, en: 'Friend', kr: '친구', emoji: '🤝' },
    { id: 205, en: 'Bread', kr: '빵', emoji: '🍞' },
    { id: 206, en: 'Banana', kr: '바나나', emoji: '🍌' },
    { id: 207, en: 'Rabbit', kr: '토끼', emoji: '🐰' },
    { id: 208, en: 'Tiger', kr: '호랑이', emoji: '🐯' },
    { id: 209, en: 'Lion', kr: '사자', emoji: '🦁' },
    { id: 210, en: 'Monkey', kr: '원숭이', emoji: '🐵' },
    { id: 211, en: 'Cloud', kr: '구름', emoji: '☁️' },
    { id: 212, en: 'Rain', kr: '비', emoji: '🌧️' },
    { id: 213, en: 'Snow', kr: '눈', emoji: '❄️' },
    { id: 214, en: 'River', kr: '강', emoji: '🏞️' },
    { id: 215, en: 'Ocean', kr: '바다', emoji: '🌊' },
    { id: 216, en: 'Train', kr: '기차', emoji: '🚆' },
    { id: 217, en: 'Clock', kr: '시계', emoji: '⏰' },
    { id: 218, en: 'Chair', kr: '의자', emoji: '🪑' },
    { id: 219, en: 'Table', kr: '탁자', emoji: '🪵' },
    { id: 220, en: 'Music', kr: '음악', emoji: '🎵' },
  ],
  3: [
    { id: 301, en: 'Happy', kr: '행복한', emoji: '😄' },
    { id: 302, en: 'Sad', kr: '슬픈', emoji: '😢' },
    { id: 303, en: 'Angry', kr: '화난', emoji: '😠' },
    { id: 304, en: 'Hungry', kr: '배고픈', emoji: '🤤' },
    { id: 305, en: 'Sleepy', kr: '졸린', emoji: '😴' },
    { id: 306, en: 'Fast', kr: '빠른', emoji: '⚡' },
    { id: 307, en: 'Slow', kr: '느린', emoji: '🐢' },
    { id: 308, en: 'Strong', kr: '강한', emoji: '💪' },
    { id: 309, en: 'Run', kr: '달리다', emoji: '🏃' },
    { id: 310, en: 'Swim', kr: '수영하다', emoji: '🏊' },
    { id: 311, en: 'Jump', kr: '점프하다', emoji: '🦘' },
    { id: 312, en: 'Dance', kr: '춤추다', emoji: '💃' },
    { id: 313, en: 'Sing', kr: '노래하다', emoji: '🎤' },
    { id: 314, en: 'Read', kr: '읽다', emoji: '📚' },
    { id: 315, en: 'Write', kr: '쓰다', emoji: '✍️' },
    { id: 316, en: 'Study', kr: '공부하다', emoji: '📝' },
    { id: 317, en: 'Clean', kr: '깨끗한', emoji: '✨' },
    { id: 318, en: 'Cold', kr: '추운', emoji: '🥶' },
    { id: 319, en: 'Hot', kr: '더운', emoji: '🥵' },
    { id: 320, en: 'Sweet', kr: '달콤한', emoji: '🍭' },
  ],
  4: [
    { id: 401, en: 'Doctor', kr: '의사', emoji: '👨‍⚕️' },
    { id: 402, en: 'Police', kr: '경찰', emoji: '👮' },
    { id: 403, en: 'Artist', kr: '예술가', emoji: '🎨' },
    { id: 404, en: 'Chef', kr: '요리사', emoji: '👨‍🍳' },
    { id: 405, en: 'Pilot', kr: '조종사', emoji: '👨‍✈️' },
    { id: 406, en: 'Hospital', kr: '병원', emoji: '🏥' },
    { id: 407, en: 'Library', kr: '도서관', emoji: '🏛️' },
    { id: 408, en: 'Airport', kr: '공항', emoji: '🛫' },
    { id: 409, en: 'Market', kr: '시장', emoji: '🏪' },
    { id: 410, en: 'Museum', kr: '박물관', emoji: '🏺' },
    { id: 411, en: 'Mountain', kr: '산', emoji: '⛰️' },
    { id: 412, en: 'Island', kr: '섬', emoji: '🏝️' },
    { id: 413, en: 'Desert', kr: '사막', emoji: '🏜️' },
    { id: 414, en: 'Forest', kr: '숲', emoji: '🌲' },
    { id: 415, en: 'Earth', kr: '지구', emoji: '🌍' },
    { id: 416, en: 'Space', kr: '우주', emoji: '🚀' },
    { id: 417, en: 'Season', kr: '계절', emoji: '🍂' },
    { id: 418, en: 'Weather', kr: '날씨', emoji: '⛅' },
    { id: 419, en: 'Holiday', kr: '휴일', emoji: '🎉' },
    { id: 420, en: 'Present', kr: '선물', emoji: '🎁' },
  ],
  5: [
    { id: 501, en: 'Adventure', kr: '모험', emoji: '🧭' },
    { id: 502, en: 'Science', kr: '과학', emoji: '🔬' },
    { id: 503, en: 'History', kr: '역사', emoji: '📜' },
    { id: 504, en: 'Future', kr: '미래', emoji: '🔮' },
    { id: 505, en: 'Nature', kr: '자연', emoji: '🌿' },
    { id: 506, en: 'Energy', kr: '에너지', emoji: '🔋' },
    { id: 507, en: 'Culture', kr: '문화', emoji: '🎭' },
    { id: 508, en: 'Language', kr: '언어', emoji: '💬' },
    { id: 509, en: 'Respect', kr: '존중', emoji: '🙇' },
    { id: 510, en: 'Promise', kr: '약속', emoji: '🤙' },
    { id: 511, en: 'Courage', kr: '용기', emoji: '🦁' },
    { id: 512, en: 'Wisdom', kr: '지혜', emoji: '🦉' },
    { id: 513, en: 'Victory', kr: '승리', emoji: '🏆' },
    { id: 514, en: 'Challenge', kr: '도전', emoji: '🧗' },
    { id: 515, en: 'Practice', kr: '연습', emoji: '🎯' },
    { id: 516, en: 'Discover', kr: '발견하다', emoji: '🔍' },
    { id: 517, en: 'Imagine', kr: '상상하다', emoji: '💭' },
    { id: 518, en: 'Protect', kr: '보호하다', emoji: '🛡️' },
    { id: 519, en: 'Journey', kr: '여행', emoji: '🧳' },
    { id: 520, en: 'Treasure', kr: '보물', emoji: '💎' },
  ],
};

const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

// 정답/오답 시 랜덤 출력할 격려 및 재밌는 대사들
const CORRECT_VOICES = [
  '와! 대단하다!',
  '정답! 오케이!',
  '대단해! 정답!',
  '정답! 멋지네요!',
  '와우! 정답!',
  '훌륭해! 최고!',
  '완전좋아!',
  '와 천재다!',
  '어메이징!',
];

const INCORRECT_VOICES = [
  '아쉬워요, 다음 기회에!',
  '괜찮아요, 힘내세요!',
  '아깝다! 다음에 맞추면 돼요!',
  '조금만 더 집중해봐요!',
  '화이팅! 다음엔 할 수 있어요!',
  '뭐지?','심각하네...',
  '울고싶다','우울하다...',
  '하면되요','답답하다','괜찮아요',
];

export default function Page6() {
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputName, setInputName] = useState('');
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);

  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [currentRound, setCurrentRound] = useState<number>(1);

  const [turnLimitSec, setTurnLimitSec] = useState<number>(10);
  const [cardIncrementPerLevel, setCardIncrementPerLevel] = useState<number>(1);
  const [useOpenOneCard, setUseOpenOneCard] = useState<boolean>(false);

  const [timeLeftSec, setTimeLeftSec] = useState<number>(10);

  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [celebratingId, setCelebratingId] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exposedPenaltyCardIdx, setExposedPenaltyCardIdx] = useState<number | null>(null);

  const [scoreToast, setScoreToast] = useState<{ id: number; text: string; type: 'plus' | 'minus' } | null>(null);
  const flipTimeoutRef = useRef<number | null>(null);

  const showToast = (text: string, type: 'plus' | 'minus') => {
    setScoreToast({ id: Date.now(), text, type });
  };

  const speakEnglish = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.95;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 랜덤 정답 음성 및 효과음 재생
  const playRandomCorrectVoiceAndSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.08);
        osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
      });
    } catch {}

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const randomText = CORRECT_VOICES[Math.floor(Math.random() * CORRECT_VOICES.length)];
      const utterance = new SpeechSynthesisUtterance(randomText);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      utterance.pitch = 1.2;
      window.speechSynthesis.speak(utterance);
    }
  };

  // 랜덤 오답 격려 음성 재생
  const playRandomIncorrectVoice = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const randomText = INCORRECT_VOICES[Math.floor(Math.random() * INCORRECT_VOICES.length)];
      const utterance = new SpeechSynthesisUtterance(randomText);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playGrandCongratsFanfare = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const fanfare = [
        { freq: 523.25, time: 0, dur: 0.15 },
        { freq: 523.25, time: 0.16, dur: 0.15 },
        { freq: 523.25, time: 0.32, dur: 0.15 },
        { freq: 659.25, time: 0.48, dur: 0.35 },
        { freq: 587.33, time: 0.85, dur: 0.25 },
        { freq: 659.25, time: 1.12, dur: 0.25 },
        { freq: 783.99, time: 1.4, dur: 0.6 },
      ];
      fanfare.forEach((n) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);
        gain.gain.setValueAtTime(0.22, ctx.currentTime + n.time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + n.time);
        osc.stop(ctx.currentTime + n.time + n.dur);
      });
    } catch {}

    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('Congratulations! You are the champion!');
      utterance.lang = 'en-US';
      utterance.rate = 1.0;
      utterance.pitch = 1.15;
      window.speechSynthesis.speak(utterance);
    }
  };

  const addPlayer = () => {
    if (!inputName.trim()) return;
    setPlayers([...players, { id: Date.now(), name: inputName.trim(), score: 0, totalWins: 0, totalScore: 0 }]);
    setInputName('');
  };

  const removePlayer = (id: number) => {
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

  const calculateTargetWordCount = (level: number) => {
    const basePairs = 10;
    const count = basePairs + (level - 1) * cardIncrementPerLevel;
    return Math.min(count, 20);
  };

  const setupRoundCards = (level: number) => {
    const targetWordCount = calculateTargetWordCount(level);
    const pool = [...(WORD_POOLS[level] || WORD_POOLS[1])];
    const selectedWords = pool.sort(() => Math.random() - 0.5).slice(0, targetWordCount);

    const pairedCards: CardItem[] = [];
    selectedWords.forEach((word) => {
      pairedCards.push({ ...word, uniqueId: Math.random() });
      pairedCards.push({ ...word, uniqueId: Math.random() });
    });

    const shuffledCards = pairedCards.sort(() => Math.random() - 0.5);
    setCards(shuffledCards);
    setMatchedIds([]);
    setFlippedCards([]);
    setCelebratingId(null);
    setExposedPenaltyCardIdx(null);
    setIsProcessing(false);
    setTimeLeftSec(turnLimitSec);
  };

  const goToMainReady = () => {
    if (players.length === 0) return;
    setPlayers(players.map((p) => ({ ...p, score: 0, totalWins: 0, totalScore: 0 })));
    setCurrentRound(1);
    setCurrentPlayerIdx(0);
    setupRoundCards(1);
    setGameState('READY');
  };

  const confirmOrderAndStart = () => {
    setCurrentPlayerIdx(0);
    setTimeLeftSec(turnLimitSec);
    setGameState('PLAYING');
  };

  const startNextRound = () => {
    setPlayers((prevPlayers) => {
      const maxScore = Math.max(...prevPlayers.map((p) => p.score));
      return prevPlayers.map((p) => {
        const wonThisRound = p.score === maxScore && maxScore > 0;
        return {
          ...p,
          totalWins: wonThisRound ? p.totalWins + 1 : p.totalWins,
          totalScore: p.totalScore + p.score,
          score: 0,
        };
      });
    });

    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    setupRoundCards(nextRound);
    setGameState('PLAYING');
  };

  const finalizeGameResults = () => {
    setPlayers((prevPlayers) => {
      const maxScore = Math.max(...prevPlayers.map((p) => p.score));
      return prevPlayers.map((p) => {
        const wonThisRound = p.score === maxScore && maxScore > 0;
        return {
          ...p,
          totalWins: wonThisRound ? p.totalWins + 1 : p.totalWins,
          totalScore: p.totalScore + p.score,
        };
      });
    });
  };

  // 타임오버 시 -3점 및 턴 이동
  useEffect(() => {
    if (gameState !== 'PLAYING' || players.length === 0) return;

    const timer = window.setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          if (flipTimeoutRef.current) {
            clearTimeout(flipTimeoutRef.current);
          }
          setFlippedCards([]);
          setCelebratingId(null);
          setExposedPenaltyCardIdx(null);
          setIsProcessing(false);
          showToast(`⏰ 타임오버! -3점`, 'minus');

          setPlayers((list) =>
            list.map((p, idx) => (idx === currentPlayerIdx ? { ...p, score: p.score - 3 } : p))
          );
          setCurrentPlayerIdx((idx) => (idx + 1) % players.length);
          return turnLimitSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, players.length, turnLimitSec, currentPlayerIdx]);

  const handleCardClick = (index: number) => {
    if (
      gameState !== 'PLAYING' ||
      isProcessing ||
      flippedCards.includes(index) ||
      matchedIds.includes(cards[index].id)
    ) {
      return;
    }

    const nextFlipped = [...flippedCards, index];
    setFlippedCards(nextFlipped);

    if (nextFlipped.length === 1) {
      speakEnglish(cards[index].en);
    } else if (nextFlipped.length === 2) {
      setIsProcessing(true);
      const [firstIdx, secondIdx] = nextFlipped;
      const card1 = cards[firstIdx];
      const card2 = cards[secondIdx];

      if (card1.id === card2.id) {
        const earnedPoints = 10;
        setCelebratingId(card1.id);
        playRandomCorrectVoiceAndSound(); // 재밌는 정답 보이스 재생
        showToast(`✨ 정답! +${earnedPoints}점`, 'plus');

        flipTimeoutRef.current = window.setTimeout(() => {
          setMatchedIds((prev) => [...prev, card1.id]);
          setPlayers((prev) =>
            prev.map((p, idx) =>
              idx === currentPlayerIdx ? { ...p, score: p.score + earnedPoints } : p
            )
          );
          setCelebratingId(null);
          setFlippedCards([]);
          setExposedPenaltyCardIdx(null);
          setIsProcessing(false);
          setTimeLeftSec(turnLimitSec);
        }, 1250);
      } else {
        speakEnglish(card2.en);
        showToast(`❌ 오답! -2점`, 'minus');
        playRandomIncorrectVoice(); // 격려 오답 보이스 재생

        let newPenaltyIdx: number | null = null;
        if (useOpenOneCard) {
          const unmatchableIndices = cards
            .map((c, i) => (!matchedIds.includes(c.id) && i !== firstIdx && i !== secondIdx ? i : -1))
            .filter((i) => i !== -1);
          if (unmatchableIndices.length > 0) {
            newPenaltyIdx = unmatchableIndices[Math.floor(Math.random() * unmatchableIndices.length)];
          }
        }

        flipTimeoutRef.current = window.setTimeout(() => {
          setPlayers((prev) =>
            prev.map((p, idx) =>
              idx === currentPlayerIdx ? { ...p, score: p.score - 2 } : p
            )
          );
          setFlippedCards([]);
          setExposedPenaltyCardIdx(newPenaltyIdx);
          setCurrentPlayerIdx((prev) => (prev + 1) % players.length);
          setIsProcessing(false);
          setTimeLeftSec(turnLimitSec);
        }, 1200);
      }
    }
  };

  const currentTargetWordCount = calculateTargetWordCount(currentRound);

  useEffect(() => {
    if (gameState === 'PLAYING' && cards.length > 0 && matchedIds.length === currentTargetWordCount) {
      if (currentRound < totalRounds) {
        setGameState('ROUND_OVER');
      } else {
        finalizeGameResults();
        setGameState('GAME_OVER');
        playGrandCongratsFanfare();
      }
    }
  }, [matchedIds, gameState, cards.length, currentTargetWordCount, currentRound, totalRounds]);

  const timePercentage = Math.max(0, Math.min(100, (timeLeftSec / turnLimitSec) * 100));
  const isDangerTime = gameState === 'PLAYING' && timeLeftSec <= 4;

  const getSortedRankings = (isCurrentRoundRanking = false) => {
    return [...players].sort((a, b) => {
      if (isCurrentRoundRanking) {
        return b.score - a.score;
      }
      if (b.totalWins !== a.totalWins) {
        return b.totalWins - a.totalWins;
      }
      return b.totalScore - a.totalScore;
    });
  };

  // 현재 차례 플레이어에게 부여된 고유 파스텔톤 배경 색상 계산
  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  return (
    <div className="game-container" style={{ background: currentBackground }}>
      {scoreToast && gameState === 'PLAYING' && (
        <div key={scoreToast.id} className={`score-toast ${scoreToast.type}`}>
          {scoreToast.text}
        </div>
      )}

      {/* 1. 설정 화면 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">🎴 영단어 메모리 게임 설정</h1>

          <div className="setting-section">
            <label className="setting-label">🏆 게임 판 수 선택</label>
            <div className="round-selector">
              {[
                { val: 1, label: '단판' },
                { val: 2, label: '두판' },
                { val: 3, label: '세판' },
                { val: 4, label: '네판' },
                { val: 5, label: '다섯판' },
              ].map((item) => (
                <button
                  key={item.val}
                  type="button"
                  className={`round-btn ${totalRounds === item.val ? 'active' : ''}`}
                  onClick={() => setTotalRounds(item.val)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">📈 레벨별 카드 증가량 설정 (0 ~ 5)</label>
            <div className="round-selector">
              {[0, 1, 2, 3, 4, 5].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`round-btn ${cardIncrementPerLevel === num ? 'active' : ''}`}
                  onClick={() => setCardIncrementPerLevel(num)}
                >
                  +{num}쌍
                </button>
              ))}
            </div>
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
              • 0 선택 시: 레벨이 올라도 항상 기본 20장(10단어)<br />
              • 1~5 선택 시: 레벨업마다 해당 쌍수만큼 카드 증가 (최대 40장)
            </div>
          </div>

          <div className="setting-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-input"
                checked={useOpenOneCard}
                onChange={(e) => setUseOpenOneCard(e.target.checked)}
              />
              🃏 오픈 원카드 규칙 사용 (틀리면 다음 턴에 카드 1장 잠시 오픈)
            </label>
          </div>

          <div className="setting-section">
            <label className="setting-label">⏱️ 한 턴당 제한 시간 (초)</label>
            <div className="time-input-wrapper">
              <input
                type="number"
                min={3}
                max={120}
                className="time-input"
                value={turnLimitSec}
                onChange={(e) => setTurnLimitSec(Math.max(3, Number(e.target.value)))}
              />
              <span style={{ fontWeight: 600, color: '#475569' }}>초 (타임오버 시 -3점)</span>
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">👥 참가자 등록</label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="참가자 이름 입력"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              />
              <button className="btn btn-primary" onClick={addPlayer}>
                ➕ 추가
              </button>
            </div>

            <div className="player-list">
              {players.map((player) => (
                <div key={player.id} className="player-item">
                  <span>👤 {player.name}</span>
                  <button className="btn-delete" onClick={() => removePlayer(player.id)}>
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            className="btn btn-success"
            disabled={players.length === 0}
            onClick={goToMainReady}
          >
            ➡️ 메인 화면으로 이동 ({players.length}명)
          </button>
        </div>
      )}

      {/* 2. 메인 화면 */}
      {(gameState === 'READY' || gameState === 'PLAYING') && (
        <>
          <div className="game-header">
            <span className="level-badge">
              ⭐ Level {currentRound} ({currentTargetWordCount * 2}장 / {currentRound}/{totalRounds}판)
            </span>

            {gameState === 'PLAYING' && (
              <div className="score-board">
                {players.map((p, idx) => (
                  <div
                    key={p.id}
                    className={`score-card ${idx === currentPlayerIdx ? 'active' : ''}`}
                  >
                    <div className="score-name">
                      <span>
                        {idx === currentPlayerIdx ? '👉 ' : ''}
                        {p.name}
                      </span>
                    </div>
                    <div className="score-val">{p.score}점</div>
                  </div>
                ))}
              </div>
            )}

            <button className="btn btn-primary" onClick={() => setGameState('SETUP')}>
              ⚙️ 설정으로
            </button>
          </div>

          {gameState === 'READY' && (
            <div className="order-panel">
              <div className="order-header">
                <h3 style={{ margin: 0, fontSize: '18px' }}>📋 참가자 진행 순서를 정해주세요</h3>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '13px' }}
                  onClick={shufflePlayersOrder}
                >
                  🎲 순서 랜덤 섞기
                </button>
              </div>

              <div className="order-list">
                {players.map((player, idx) => (
                  <div key={player.id} className="order-item">
                    <span>
                      <strong style={{ color: '#2563eb', marginRight: '8px' }}>{idx + 1}번째</strong>
                      {player.name}
                    </span>
                    <div className="order-controls">
                      <button
                        className="order-btn"
                        disabled={idx === 0}
                        onClick={() => movePlayerOrder(idx, 'UP')}
                      >
                        ▲
                      </button>
                      <button
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

              <button className="btn btn-success" onClick={confirmOrderAndStart}>
                🚀 이 순서로 게임 시작!
              </button>
            </div>
          )}

          {gameState === 'PLAYING' && (
            <div className={`timer-container ${isDangerTime ? 'warning-flash' : ''}`}>
              <div className="timer-info">
                <span>
                  현재 차례: <strong style={{ color: '#2563eb' }}>{players[currentPlayerIdx]?.name}</strong> (턴 바뀜 배경색 적용됨!)
                </span>
                <span className={isDangerTime ? 'timer-text-danger' : ''}>
                  {isDangerTime ? '🚨 타임오버 임박! ' : '남은 시간: '}
                  {timeLeftSec}초
                </span>
              </div>
              <div className="timer-bar-bg">
                <div
                  className={`timer-bar-fill ${isDangerTime ? 'danger' : ''}`}
                  style={{ width: `${timePercentage}%` }}
                />
              </div>
            </div>
          )}

          <div
            className="grid-container"
            style={{
              opacity: gameState === 'READY' ? 0.55 : 1,
              pointerEvents: gameState === 'READY' ? 'none' : 'auto',
            }}
          >
            {cards.map((card, index) => {
              const isFlipped = flippedCards.includes(index) || (exposedPenaltyCardIdx === index && !matchedIds.includes(card.id));
              const isMatched = matchedIds.includes(card.id);
              const isCelebrating = celebratingId === card.id;
              const isPenaltyExposed = exposedPenaltyCardIdx === index;

              return (
                <div
                  key={card.uniqueId}
                  className={`card ${isFlipped ? 'flipped' : ''} ${isMatched ? 'matched' : ''} ${isCelebrating ? 'celebrating' : ''} ${isPenaltyExposed ? 'penalty-exposed' : ''}`}
                  onClick={() => handleCardClick(index)}
                >
                  {isCelebrating && (
                    <div className="stars-orbit">
                      <span className="star-particle star-1">⭐</span>
                      <span className="star-particle star-2">⭐</span>
                      <span className="star-particle star-3">⭐</span>
                      <span className="star-particle star-4">⭐</span>
                      <span className="star-particle star-5">⭐</span>
                    </div>
                  )}

                  <div className="card-face card-back">
                    <div className="card-back-pattern">{isPenaltyExposed ? '👀' : '❓'}</div>
                  </div>

                  <div className="card-face card-front">
                    <button
                      className="tts-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakEnglish(card.en);
                      }}
                      title="다시 듣기"
                    >
                      🔊
                    </button>
                    <div className="card-emoji">{card.emoji}</div>
                    <div className="card-en">{card.en}</div>
                    <div className="card-kr">{card.kr}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* 3. 라운드 종료 모달 */}
      {gameState === 'ROUND_OVER' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-trophy">🎉</div>
            <h2>{currentRound}판 클리어!</h2>
            <p className="modal-subtext">
              다음 <strong>Level {currentRound + 1}</strong>부터는 <strong>점수가 0점부터</strong> 다시 시작됩니다!
            </p>

            <div className="rank-list">
              {getSortedRankings(true).map((p, rank) => (
                <div key={p.id} className={`rank-item ${rank === 0 ? 'winner' : ''}`}>
                  <span>
                    {rank === 0 ? '🥇 ' : `${rank + 1}위 `} {p.name}
                  </span>
                  <span>{p.score}점 (누적승수: {p.totalWins}승)</span>
                </div>
              ))}
            </div>

            <button className="btn btn-success" onClick={startNextRound}>
              🚀 Level {currentRound + 1} 시작하기 ({currentRound + 1}/{totalRounds}판)
            </button>
          </div>
        </div>
      )}

      {/* 4. 최종 승리 결과 축하 모달 */}
      {gameState === 'GAME_OVER' && (
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

          <div className="modal-content grand-finale">
            <div className="modal-trophy">👑🏆👑</div>
            <div className="congrats-banner">✨ CONGRATULATIONS! ✨</div>
            <h2 style={{ margin: '4px 0 8px', color: '#0f172a' }}>축하합니다! 최종 우승!</h2>
            <p className="modal-subtext">누적승수 및 총 점수 합산 최종 순위입니다!</p>

            <div className="rank-list">
              {getSortedRankings(false).map((p, rank) => (
                <div key={p.id} className={`rank-item ${rank === 0 ? 'winner' : ''}`}>
                  <span>
                    {rank === 0 ? '🥇 👑 ' : `${rank + 1}위 `} {p.name}
                  </span>
                  <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                    🏆 {p.totalWins}승 (총합 {p.totalScore}점)
                  </span>
                </div>
              ))}
            </div>

            <button className="btn btn-success" onClick={goToMainReady}>
              🔄 다시 하기 (순서 정하기)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}