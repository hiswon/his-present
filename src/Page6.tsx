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
  score: number;      // 현재 레벨(판) 점수
  streak: number;     // 연속 정답 콤보
  totalWins: number;  // 총 승리한 판 수
  totalScore: number; // 전체 판의 누적 점수 합산
}

const LEVEL_WORD_COUNTS: Record<number, number> = {
  1: 10,
  2: 13,
  3: 16,
  4: 19,
  5: 22,
};

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
    { id: 121, en: 'Pig', kr: '돼지', emoji: '🐷' },
    { id: 122, en: 'Cow', kr: '소', emoji: '🐮' },
    { id: 123, en: 'Bus', kr: '버스', emoji: '🚌' },
    { id: 124, en: 'Egg', kr: '달걀', emoji: '🥚' },
    { id: 125, en: 'Cup', kr: '컵', emoji: '🥤' },
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
    { id: 221, en: 'Pizza', kr: '피자', emoji: '🍕' },
    { id: 222, en: 'Juice', kr: '주스', emoji: '🧃' },
    { id: 223, en: 'Smile', kr: '미소', emoji: '😊' },
    { id: 224, en: 'Heart', kr: '마음', emoji: '❤️' },
    { id: 225, en: 'Family', kr: '가족', emoji: '👨‍👩‍👧‍👦' },
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
    { id: 321, en: 'Smart', kr: '똑똑한', emoji: '🧠' },
    { id: 322, en: 'Brave', kr: '용감한', emoji: '🦸' },
    { id: 323, en: 'Kind', kr: '친절한', emoji: '😇' },
    { id: 324, en: 'Listen', kr: '듣다', emoji: '👂' },
    { id: 325, en: 'Speak', kr: '말하다', emoji: '🗣️' },
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
    { id: 421, en: 'Camera', kr: '카메라', emoji: '📷' },
    { id: 422, en: 'Computer', kr: '컴퓨터', emoji: '💻' },
    { id: 423, en: 'Bridge', kr: '다리', emoji: '🌉' },
    { id: 424, en: 'Castle', kr: '성', emoji: '🏰' },
    { id: 425, en: 'Secret', kr: '비밀', emoji: '🤫' },
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
    { id: 521, en: 'Universe', kr: '우주', emoji: '🌌' },
    { id: 522, en: 'Memory', kr: '기억', emoji: '🧩' },
    { id: 523, en: 'Success', kr: '성공', emoji: '🌟' },
    { id: 524, en: 'Harmony', kr: '조화', emoji: '🎶' },
    { id: 525, en: 'Miracle', kr: '기적', emoji: '✨' },
  ],
};

const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

export default function Page6() {
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'ROUND_OVER' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputName, setInputName] = useState('');
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);

  const [totalRounds, setTotalRounds] = useState<number>(1);
  const [currentRound, setCurrentRound] = useState<number>(1);

  const [turnLimitSec, setTurnLimitSec] = useState<number>(15);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(15);

  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [celebratingId, setCelebratingId] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

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

  const playMatchCelebrationSound = () => {
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
      const voices = window.speechSynthesis.getVoices();
      const hasKorean = voices.some((v) => v.lang.includes('ko'));
      const utterance = new SpeechSynthesisUtterance(hasKorean ? '정답!' : 'Correct! OK!');
      utterance.lang = hasKorean ? 'ko-KR' : 'en-US';
      utterance.rate = 1.1;
      utterance.pitch = 1.2;
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
    setPlayers([...players, { id: Date.now(), name: inputName.trim(), score: 0, streak: 0, totalWins: 0, totalScore: 0 }]);
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

  const setupRoundCards = (level: number) => {
    const safeLevel = Math.min(Math.max(level, 1), 5);
    const targetWordCount = LEVEL_WORD_COUNTS[safeLevel] || 10;
    const pool = [...WORD_POOLS[safeLevel]];
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
    setIsProcessing(false);
    setTimeLeftSec(turnLimitSec);
  };

  const goToMainReady = () => {
    if (players.length === 0) return;
    // 게임 시작 시 모든 누적 스코어 초기화
    setPlayers(players.map((p) => ({ ...p, score: 0, streak: 0, totalWins: 0, totalScore: 0 })));
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

  // 라운드 종료 시 현재 판의 최고 득점자에게 승리(totalWins) 1회 부여 후, 점수를 0으로 리셋하여 다음 판으로 이동
  const startNextRound = () => {
    setPlayers((prevPlayers) => {
      // 현재 판에서 가장 점수가 높은 사람(들) 찾기
      const maxScore = Math.max(...prevPlayers.map((p) => p.score));
      return prevPlayers.map((p) => {
        const wonThisRound = p.score === maxScore && maxScore > 0;
        return {
          ...p,
          totalWins: wonThisRound ? p.totalWins + 1 : p.totalWins,
          totalScore: p.totalScore + p.score, // 총 점수 합산에 누적
          score: 0, // 다음 레벨 시작 시 점수 0점 리셋
          streak: 0,
        };
      });
    });

    const nextRound = currentRound + 1;
    setCurrentRound(nextRound);
    setupRoundCards(nextRound);
    setGameState('PLAYING');
  };

  // 최종 게임 종료 처리 (마지막 판 점수 합산 및 승리 판수 누적 반영)
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

  // 1초 단위 타이머
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
          setIsProcessing(false);
          setPlayers((list) =>
            list.map((p, idx) => (idx === currentPlayerIdx ? { ...p, streak: 0 } : p))
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
        const currentPlayer = players[currentPlayerIdx];
        const earnedPoints = 10 + currentPlayer.streak * 5;
        const nextStreak = currentPlayer.streak + 1;

        setCelebratingId(card1.id);
        playMatchCelebrationSound();
        showToast(
          nextStreak > 1
            ? `🔥 ${nextStreak}연속 정답! +${earnedPoints}점`
            : `✨ 정답! +${earnedPoints}점`,
          'plus'
        );

        flipTimeoutRef.current = window.setTimeout(() => {
          setMatchedIds((prev) => [...prev, card1.id]);
          setPlayers((prev) =>
            prev.map((p, idx) =>
              idx === currentPlayerIdx
                ? { ...p, score: p.score + earnedPoints, streak: nextStreak }
                : p
            )
          );
          setCelebratingId(null);
          setFlippedCards([]);
          setIsProcessing(false);
          setTimeLeftSec(turnLimitSec);
        }, 1250);
      } else {
        speakEnglish(card2.en);
        showToast(`❌ 오답! -2점`, 'minus');

        flipTimeoutRef.current = window.setTimeout(() => {
          setPlayers((prev) =>
            prev.map((p, idx) =>
              idx === currentPlayerIdx
                ? { ...p, score: p.score - 2, streak: 0 }
                : p
            )
          );
          setFlippedCards([]);
          setCurrentPlayerIdx((prev) => (prev + 1) % players.length);
          setIsProcessing(false);
          setTimeLeftSec(turnLimitSec);
        }, 1200);
      }
    }
  };

  const currentLevelWordCount = LEVEL_WORD_COUNTS[Math.min(Math.max(currentRound, 1), 5)] || 10;

  useEffect(() => {
    if (gameState === 'PLAYING' && cards.length > 0 && matchedIds.length === currentLevelWordCount) {
      if (currentRound < totalRounds) {
        setGameState('ROUND_OVER');
      } else {
        finalizeGameResults();
        setGameState('GAME_OVER');
        playGrandCongratsFanfare();
      }
    }
  }, [matchedIds, gameState, cards.length, currentLevelWordCount, currentRound, totalRounds]);

  const timePercentage = Math.max(0, Math.min(100, (timeLeftSec / turnLimitSec) * 100));
  const isDangerTime = gameState === 'PLAYING' && timeLeftSec <= 5;

  // 최종 순위 정렬 기준: 1순위 '승리한 판 수(totalWins)' 많은 순, 2순위 '총 점수 합산(totalScore)' 높은 순
  const getSortedRankings = (isCurrentRoundRanking = false) => {
    return [...players].sort((a, b) => {
      if (isCurrentRoundRanking) {
        return b.score - a.score;
      }
      if (b.totalWins !== a.totalWins) {
        return b.totalWins - a.totalWins; // 승리한 판 수가 많은 사람 우선
      }
      return b.totalScore - a.totalScore; // 승리 판수가 같으면 총 점수 합산 비교
    });
  };

  return (
    <div className="game-container">
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
            <label className="setting-label">🏆 게임 판 수 선택 (레벨 및 단어 수 증가)</label>
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
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px', lineHeight: 1.5 }}>
              • 레벨별 단어: Lv.1(10) → Lv.2(13) → Lv.3(16) → Lv.4(19) → Lv.5(22)<br />
              • 다음 판으로 넘어가면 **점수는 0점부터 다시 시작**됩니다!<br />
              • 최종 우승: **많이 이긴 판 수** 기준 (동률 시 **총 점수 합산** 비교)
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">⏱️ 한 턴당 제한 시간 (초)</label>
            <div className="time-input-wrapper">
              <input
                type="number"
                min={5}
                max={120}
                className="time-input"
                value={turnLimitSec}
                onChange={(e) => setTurnLimitSec(Math.max(5, Number(e.target.value)))}
              />
              <span style={{ fontWeight: 600, color: '#475569' }}>초 (5초 전 빨간 경고)</span>
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

      {/* 2. 메인 순서 정하기 & 게임 진행 화면 */}
      {(gameState === 'READY' || gameState === 'PLAYING') && (
        <>
          <div className="game-header">
            <span className="level-badge">
              ⭐ Level {currentRound} ({currentLevelWordCount}단어 / {currentRound}/{totalRounds}판)
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
                      {p.streak > 1 && <span className="combo-badge">🔥{p.streak}연속</span>}
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
                  현재 차례: <strong style={{ color: '#2563eb' }}>{players[currentPlayerIdx]?.name}</strong>
                </span>
                <span className={isDangerTime ? 'timer-text-danger' : ''}>
                  {isDangerTime ? '🚨 서두르세요! ' : '남은 시간: '}
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
              const isFlipped = flippedCards.includes(index);
              const isMatched = matchedIds.includes(card.id);
              const isCelebrating = celebratingId === card.id;

              return (
                <div
                  key={card.uniqueId}
                  className={`card ${isFlipped ? 'flipped' : ''} ${isMatched ? 'matched' : ''} ${isCelebrating ? 'celebrating' : ''}`}
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
                    <div className="card-back-pattern">❓</div>
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

      {/* 3. 라운드(판) 클리어 모달 (현재 판 순위 표시 및 다음 판 점수 0점 리셋 알림) */}
      {gameState === 'ROUND_OVER' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-trophy">🎉</div>
            <h2>{currentRound}판 클리어!</h2>
            <p className="modal-subtext">
              다음 <strong>Level {currentRound + 1} ({LEVEL_WORD_COUNTS[currentRound + 1]}단어)</strong>부터는 <strong>점수가 0점부터</strong> 다시 시작됩니다!
            </p>

            <div className="rank-list">
              {getSortedRankings(true).map((p, rank) => (
                <div key={p.id} className={`rank-item ${rank === 0 ? 'winner' : ''}`}>
                  <span>
                    {rank === 0 ? '🥇 ' : `${rank + 1}위 `} {p.name}
                  </span>
                  <span>{p.score}점 (이긴 판: {p.totalWins}승)</span>
                </div>
              ))}
            </div>

            <button className="btn btn-success" onClick={startNextRound}>
              🚀 Level {currentRound + 1} 시작하기 ({currentRound + 1}/{totalRounds}판)
            </button>
          </div>
        </div>
      )}

      {/* 4. 최종 승리 결과 화려한 축하 모달 (Congratulations!) */}
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
            <p className="modal-subtext">
              많이 이긴 판 수 기준 (동률 시 총 점수 합산) 최종 순위입니다!
            </p>

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