import { useState, useEffect } from 'react';
import './Page8.css';

type Suit = '♠' | '♥' | '♦' | '♣';

interface PokerCard {
  id: string;
  suit: Suit;
  rank: number; // 2 ~ 14 (11:J, 12:Q, 13:K, 14:A)
  label: string;
}

interface Player {
  id: number;
  name: string;
  chips: number;
  hand: PokerCard[];
  currentBet: number;
  folded: boolean;
  totalWins: number;
}

interface HandEvaluation {
  tier: number; // 1(하이카드) ~ 10(로열 플러시)
  name: string;
  tieBreakers: number[];
}

type GameState =
  | 'SETUP'
  | 'READY'
  | 'PASS_SCREEN'
  | 'BETTING_1'
  | 'DRAW'
  | 'BETTING_2'
  | 'SHOWDOWN'
  | 'GAME_OVER';

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS = [
  { rank: 2, label: '2' },
  { rank: 3, label: '3' },
  { rank: 4, label: '4' },
  { rank: 5, label: '5' },
  { rank: 6, label: '6' },
  { rank: 7, label: '7' },
  { rank: 8, label: '8' },
  { rank: 9, label: '9' },
  { rank: 10, label: '10' },
  { rank: 11, label: 'J' },
  { rank: 12, label: 'Q' },
  { rank: 13, label: 'K' },
  { rank: 14, label: 'A' },
];

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
  'linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%, #e0e7ff 100%)',
];

const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

// 52장 덱 생성 및 셔플
function createShuffledDeck(): PokerCard[] {
  const deck: PokerCard[] = [];
  for (const suit of SUITS) {
    for (const r of RANKS) {
      deck.push({
        id: `${suit}-${r.rank}-${Math.random()}`,
        suit,
        rank: r.rank,
        label: r.label,
      });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// 5장 포커 족보 판정 엔진
function evaluateHand(cards: PokerCard[]): HandEvaluation {
  if (cards.length < 5) return { tier: 0, name: '패 없음', tieBreakers: [] };

  const sorted = [...cards].sort((a, b) => b.rank - a.rank);
  const ranks = sorted.map((c) => c.rank);
  const suits = sorted.map((c) => c.suit);

  const isFlush = suits.every((s) => s === suits[0]);

  // 스트레이트 체크 (A-2-3-4-5 백스트레이트 포함)
  let isStraight = false;
  let straightHigh = ranks[0];
  const uniqueRanks = Array.from(new Set(ranks));
  if (uniqueRanks.length === 5) {
    if (ranks[0] - ranks[4] === 4) {
      isStraight = true;
      straightHigh = ranks[0];
    } else if (
      ranks[0] === 14 &&
      ranks[1] === 5 &&
      ranks[2] === 4 &&
      ranks[3] === 3 &&
      ranks[4] === 2
    ) {
      isStraight = true;
      straightHigh = 5;
    }
  }

  // 숫자별 빈도 계산
  const freqMap: Record<number, number> = {};
  ranks.forEach((r) => {
    freqMap[r] = (freqMap[r] || 0) + 1;
  });

  const groups = Object.entries(freqMap)
    .map(([rank, count]) => ({ rank: Number(rank), count }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      return b.rank - a.rank;
    });

  const rankName = (r: number) => RANKS.find((item) => item.rank === r)?.label || String(r);

  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return { tier: 10, name: '👑 로열 스트레이트 플러시', tieBreakers: [14] };
    }
    return {
      tier: 9,
      name: `🔥 ${rankName(straightHigh)} 스트레이트 플러시`,
      tieBreakers: [straightHigh],
    };
  }

  if (groups[0].count === 4) {
    return {
      tier: 8,
      name: `💎 ${rankName(groups[0].rank)} 포카드`,
      tieBreakers: [groups[0].rank, groups[1].rank],
    };
  }

  if (groups[0].count === 3 && groups[1].count === 2) {
    return {
      tier: 7,
      name: `🏠 풀하우스 (${rankName(groups[0].rank)} 풀 ${rankName(groups[1].rank)})`,
      tieBreakers: [groups[0].rank, groups[1].rank],
    };
  }

  if (isFlush) {
    return { tier: 6, name: `💧 ${suits[0]} 플러시`, tieBreakers: ranks };
  }

  if (isStraight) {
    return { tier: 5, name: `⚡ ${rankName(straightHigh)} 스트레이트`, tieBreakers: [straightHigh] };
  }

  if (groups[0].count === 3) {
    return {
      tier: 4,
      name: `🔱 ${rankName(groups[0].rank)} 트리플`,
      tieBreakers: [groups[0].rank, groups[1].rank, groups[2].rank],
    };
  }

  if (groups[0].count === 2 && groups[1].count === 2) {
    return {
      tier: 3,
      name: `✌️ 투페어 (${rankName(groups[0].rank)}, ${rankName(groups[1].rank)})`,
      tieBreakers: [groups[0].rank, groups[1].rank, groups[2].rank],
    };
  }

  if (groups[0].count === 2) {
    return {
      tier: 2,
      name: `☝️ ${rankName(groups[0].rank)} 원페어`,
      tieBreakers: [groups[0].rank, groups[1].rank, groups[2].rank, groups[3].rank],
    };
  }

  return {
    tier: 1,
    name: `🃏 ${rankName(ranks[0])} 하이카드`,
    tieBreakers: ranks,
  };
}

// 두 족보 비교 (a가 크면 양수, b가 크면 음수, 무승부면 0)
function compareHands(a: HandEvaluation, b: HandEvaluation): number {
  if (a.tier !== b.tier) return a.tier - b.tier;
  for (let i = 0; i < Math.min(a.tieBreakers.length, b.tieBreakers.length); i++) {
    if (a.tieBreakers[i] !== b.tieBreakers[i]) {
      return a.tieBreakers[i] - b.tieBreakers[i];
    }
  }
  return 0;
}

export default function Page8() {
  const [gameState, setGameState] = useState<GameState>('SETUP');
  const [nextPhaseAfterPass, setNextPhaseAfterPass] = useState<'BETTING_1' | 'DRAW' | 'BETTING_2'>('BETTING_1');

  // 게임 설정 상태
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputName, setInputName] = useState('');
  const [totalRounds, setTotalRounds] = useState<number>(3);
  const [startingChips, setStartingChips] = useState<number>(1000);
  const [anteAmount, setAnteAmount] = useState<number>(50);
  const [turnLimitSec, setTurnLimitSec] = useState<number>(20);

  // 진행 상태
  const [currentRound, setCurrentRound] = useState<number>(1);
  const [deck, setDeck] = useState<PokerCard[]>([]);
  const [pot, setPot] = useState<number>(0);
  const [highestBet, setHighestBet] = useState<number>(0);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [actedInPhase, setActedInPhase] = useState<number[]>([]);
  const [selectedDiscardIndices, setSelectedDiscardIndices] = useState<number[]>([]);
  const [timeLeftSec, setTimeLeftSec] = useState<number>(20);

  // 쇼다운 및 토스트 상태
  const [roundWinners, setRoundWinners] = useState<{ player: Player; evalResult: HandEvaluation }[]>([]);
  const [toast, setToast] = useState<{ id: number; text: string; type: 'plus' | 'minus' | 'info' } | null>(null);

  const showToast = (text: string, type: 'plus' | 'minus' | 'info' = 'info') => {
    setToast({ id: Date.now(), text, type });
  };

  // 효과음 & 음성 합성
  const playChipSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  const speakKorean = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playVictoryFanfare = () => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.1);
        gain.gain.setValueAtTime(0.2, ctx.currentTime + idx * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.1 + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.1);
        osc.stop(ctx.currentTime + idx * 0.1 + 0.3);
      });
    } catch {}
  };

  // 참가자 관리
  const addPlayer = () => {
    if (!inputName.trim() || players.length >= 6) return;
    setPlayers([
      ...players,
      {
        id: Date.now(),
        name: inputName.trim(),
        chips: startingChips,
        hand: [],
        currentBet: 0,
        folded: false,
        totalWins: 0,
      },
    ]);
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

  const goToMainReady = () => {
    if (players.length < 2) return;
    setPlayers(
      players.map((p) => ({
        ...p,
        chips: startingChips,
        hand: [],
        currentBet: 0,
        folded: false,
        totalWins: 0,
      }))
    );
    setCurrentRound(1);
    setGameState('READY');
  };

  // 라운드 시작 및 카드 분배
  const startRound = (roundNum: number, currentPlayersList: Player[]) => {
    const newDeck = createShuffledDeck();
    let totalPot = 0;

    const updatedPlayers = currentPlayersList.map((p) => {
      const actualAnte = Math.min(p.chips, anteAmount);
      totalPot += actualAnte;
      const dealtHand = newDeck.splice(0, 5);
      return {
        ...p,
        chips: p.chips - actualAnte,
        hand: dealtHand,
        currentBet: 0,
        folded: p.chips <= 0, // 파산한 플레이어는 자동 폴드 처리
      };
    });

    const firstActiveIdx = updatedPlayers.findIndex((p) => !p.folded);

    setDeck(newDeck);
    setPlayers(updatedPlayers);
    setPot(totalPot);
    setHighestBet(0);
    setCurrentRound(roundNum);
    setCurrentPlayerIdx(firstActiveIdx === -1 ? 0 : firstActiveIdx);
    setActedInPhase([]);
    setSelectedDiscardIndices([]);
    setRoundWinners([]);
    setNextPhaseAfterPass('BETTING_1');
    setGameState('PASS_SCREEN');
  };

  // 쇼다운 처리
  const resolveShowdown = (finalPlayers: Player[], finalPot: number) => {
    const activePlayers = finalPlayers.filter((p) => !p.folded);

    if (activePlayers.length === 1) {
      const soleWinner = activePlayers[0];
      const evalRes = evaluateHand(soleWinner.hand);
      setRoundWinners([{ player: soleWinner, evalResult: evalRes }]);
      setPlayers(
        finalPlayers.map((p) =>
          p.id === soleWinner.id
            ? { ...p, chips: p.chips + finalPot, totalWins: p.totalWins + 1 }
            : p
        )
      );
      playVictoryFanfare();
      speakKorean(`${soleWinner.name}님 기권승! ${finalPot}칩 획득!`);
      setGameState('SHOWDOWN');
      return;
    }

    const evaluatedList = activePlayers.map((p) => ({
      player: p,
      evalResult: evaluateHand(p.hand),
    }));

    evaluatedList.sort((a, b) => compareHands(b.evalResult, a.evalResult));

    const bestEval = evaluatedList[0].evalResult;
    const winners = evaluatedList.filter((item) => compareHands(item.evalResult, bestEval) === 0);
    const share = Math.floor(finalPot / winners.length);
    const winnerIds = new Set(winners.map((w) => w.player.id));

    setRoundWinners(winners);
    setPlayers(
      finalPlayers.map((p) =>
        winnerIds.has(p.id)
          ? { ...p, chips: p.chips + share, totalWins: p.totalWins + 1 }
          : p
      )
    );

    playVictoryFanfare();
    if (winners.length === 1) {
      speakKorean(`${winners[0].player.name}님 승리!`);
    } else {
      speakKorean('무승부! 상금을 나눕니다!');
    }
    setGameState('SHOWDOWN');
  };

  // 다음 활성 플레이어 찾기 및 단계 전환 로직
  const advanceTurnOrPhase = (
    updatedPlayers: Player[],
    updatedPot: number,
    updatedHighestBet: number,
    updatedActed: number[],
    currentPhase: 'BETTING_1' | 'DRAW' | 'BETTING_2'
  ) => {
    const activePlayers = updatedPlayers.filter((p) => !p.folded);

    // 1명만 남으면 즉시 승리
    if (activePlayers.length <= 1) {
      resolveShowdown(updatedPlayers, updatedPot);
      return;
    }

    // 현재 단계에서 모든 생존 플레이어가 행동을 마쳤고, 베팅 금액이 일치하는지 확인
    const allActed = activePlayers.every((p) => updatedActed.includes(p.id));
    const allBetsMatched =
      currentPhase === 'DRAW' ||
      activePlayers.every((p) => p.currentBet === updatedHighestBet || p.chips === 0);

    if (allActed && allBetsMatched) {
      if (currentPhase === 'BETTING_1') {
        const nextIdx = updatedPlayers.findIndex((p) => !p.folded);
        setPlayers(updatedPlayers);
        setPot(updatedPot);
        setCurrentPlayerIdx(nextIdx);
        setActedInPhase([]);
        setSelectedDiscardIndices([]);
        setNextPhaseAfterPass('DRAW');
        setGameState('PASS_SCREEN');
      } else if (currentPhase === 'DRAW') {
        const resetBetPlayers = updatedPlayers.map((p) => ({ ...p, currentBet: 0 }));
        const nextIdx = resetBetPlayers.findIndex((p) => !p.folded);
        setPlayers(resetBetPlayers);
        setPot(updatedPot);
        setHighestBet(0);
        setCurrentPlayerIdx(nextIdx);
        setActedInPhase([]);
        setNextPhaseAfterPass('BETTING_2');
        setGameState('PASS_SCREEN');
      } else {
        resolveShowdown(updatedPlayers, updatedPot);
      }
      return;
    }

    // 다음 순서 플레이어 탐색
    let nextIdx = (currentPlayerIdx + 1) % updatedPlayers.length;
    while (updatedPlayers[nextIdx].folded) {
      nextIdx = (nextIdx + 1) % updatedPlayers.length;
    }

    setPlayers(updatedPlayers);
    setPot(updatedPot);
    setHighestBet(updatedHighestBet);
    setActedInPhase(updatedActed);
    setCurrentPlayerIdx(nextIdx);
    setSelectedDiscardIndices([]);
    setNextPhaseAfterPass(currentPhase);
    setGameState('PASS_SCREEN');
  };

  // 베팅 액션 핸들러 (체크/콜, 레이즈, 폴드)
  const handleBetAction = (action: 'CHECK_CALL' | 'RAISE' | 'FOLD', raiseValue = 50) => {
    const phase = gameState as 'BETTING_1' | 'BETTING_2';
    const currentPlayer = players[currentPlayerIdx];
    const callNeed = Math.max(0, highestBet - currentPlayer.currentBet);

    playChipSound();

    if (action === 'FOLD') {
      showToast(`🏳️ ${currentPlayer.name} 다이 (Fold)`, 'minus');
      speakKorean('다이');
      const nextPlayers = players.map((p, i) =>
        i === currentPlayerIdx ? { ...p, folded: true } : p
      );
      const nextActed = [...actedInPhase, currentPlayer.id];
      advanceTurnOrPhase(nextPlayers, pot, highestBet, nextActed, phase);
      return;
    }

    if (action === 'CHECK_CALL') {
      const actualPay = Math.min(currentPlayer.chips, callNeed);
      const label = actualPay === 0 ? '체크 (Check)' : `콜 (+${actualPay}칩)`;
      showToast(`✅ ${currentPlayer.name} ${label}`, 'info');
      speakKorean(actualPay === 0 ? '체크' : '콜');

      const nextPlayers = players.map((p, i) =>
        i === currentPlayerIdx
          ? { ...p, chips: p.chips - actualPay, currentBet: p.currentBet + actualPay }
          : p
      );
      const nextActed = Array.from(new Set([...actedInPhase, currentPlayer.id]));
      advanceTurnOrPhase(nextPlayers, pot + actualPay, highestBet, nextActed, phase);
      return;
    }

    if (action === 'RAISE') {
      const totalAdd = Math.min(currentPlayer.chips, callNeed + raiseValue);
      const newPlayerBet = currentPlayer.currentBet + totalAdd;
      const newHighest = Math.max(highestBet, newPlayerBet);

      showToast(`🔥 ${currentPlayer.name} 레이즈! (+${totalAdd}칩)`, 'plus');
      speakKorean('레이즈!');

      const nextPlayers = players.map((p, i) =>
        i === currentPlayerIdx
          ? { ...p, chips: p.chips - totalAdd, currentBet: newPlayerBet }
          : p
      );
      // 레이즈가 발생하면 다른 플레이어들도 다시 응답해야 함
      advanceTurnOrPhase(nextPlayers, pot + totalAdd, newHighest, [currentPlayer.id], phase);
    }
  };

  // 카드 교체(Draw) 핸들러
  const toggleDiscardCard = (cardIdx: number) => {
    if (gameState !== 'DRAW') return;
    setSelectedDiscardIndices((prev) =>
      prev.includes(cardIdx) ? prev.filter((i) => i !== cardIdx) : [...prev, cardIdx]
    );
  };

  const confirmDrawCards = () => {
    const currentPlayer = players[currentPlayerIdx];
    const count = selectedDiscardIndices.length;
    const deckCopy = [...deck];

    const newHand = currentPlayer.hand.map((card, idx) => {
      if (selectedDiscardIndices.includes(idx) && deckCopy.length > 0) {
        return deckCopy.shift()!;
      }
      return card;
    });

    playChipSound();
    showToast(
      count === 0
        ? `🛡️ ${currentPlayer.name} 카드 유지 (Stay)`
        : `🔄 ${currentPlayer.name} 카드 ${count}장 교체`,
      'info'
    );
    speakKorean(count === 0 ? '스테이' : `${count}장 교체`);

    const nextPlayers = players.map((p, i) =>
      i === currentPlayerIdx ? { ...p, hand: newHand } : p
    );
    const nextActed = Array.from(new Set([...actedInPhase, currentPlayer.id]));

    setDeck(deckCopy);
    advanceTurnOrPhase(nextPlayers, pot, highestBet, nextActed, 'DRAW');
  };

  // 턴 제한시간 타이머 (타임오버 시 자동 체크 또는 폴드)
  useEffect(() => {
    if (gameState !== 'BETTING_1' && gameState !== 'DRAW' && gameState !== 'BETTING_2') return;

    setTimeLeftSec(turnLimitSec);
    const timer = window.setInterval(() => {
      setTimeLeftSec((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (gameState === 'DRAW') {
            confirmDrawCards();
          } else {
            const currentP = players[currentPlayerIdx];
            const needCall = highestBet > (currentP?.currentBet || 0);
            handleBetAction(needCall ? 'FOLD' : 'CHECK_CALL');
          }
          return turnLimitSec;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, currentPlayerIdx]);

  const handleNextRoundOrFinish = () => {
    const solventPlayers = players.filter((p) => p.chips > 0);
    if (currentRound >= totalRounds || solventPlayers.length < 2) {
      setGameState('GAME_OVER');
      playVictoryFanfare();
    } else {
      startRound(currentRound + 1, players);
    }
  };

  const currentPlayer = players[currentPlayerIdx];
  const currentEval = currentPlayer ? evaluateHand(currentPlayer.hand) : null;
  const callRequired = currentPlayer ? Math.max(0, highestBet - currentPlayer.currentBet) : 0;

  const currentBackground =
    gameState !== 'SETUP' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  const timePercentage = Math.max(0, Math.min(100, (timeLeftSec / turnLimitSec) * 100));
  const isDangerTime = timeLeftSec <= 5;

  const sortedFinalRankings = [...players].sort((a, b) => {
    if (b.chips !== a.chips) return b.chips - a.chips;
    return b.totalWins - a.totalWins;
  });

  return (
    <div className="poker-container" style={{ background: currentBackground }}>
      {toast && (
        <div key={toast.id} className={`poker-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* 1. 게임 설정 화면 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">♠️ 5-Card Draw 포커 설정</h1>

          <div className="setting-section">
            <label className="setting-label">🏆 총 라운드(판 수) 선택</label>
            <div className="option-grid-5">
              {[1, 2, 3, 5, 7].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`option-btn ${totalRounds === num ? 'active' : ''}`}
                  onClick={() => setTotalRounds(num)}
                >
                  {num}판
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">🪙 시작 칩 & 기본 참가비(Ante)</label>
            <div className="option-grid-3">
              {[
                { chips: 500, ante: 25, label: '500칩 (참가 25)' },
                { chips: 1000, ante: 50, label: '1,000칩 (참가 50)' },
                { chips: 3000, ante: 100, label: '3,000칩 (참가 100)' },
              ].map((preset) => (
                <button
                  key={preset.chips}
                  type="button"
                  className={`option-btn ${startingChips === preset.chips ? 'active' : ''}`}
                  onClick={() => {
                    setStartingChips(preset.chips);
                    setAnteAmount(preset.ante);
                  }}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">⏱️ 한 턴 제한 시간 (초)</label>
            <div className="time-input-wrapper">
              <input
                type="number"
                min={5}
                max={120}
                className="time-input"
                value={turnLimitSec}
                onChange={(e) => setTurnLimitSec(Math.max(5, Number(e.target.value)))}
              />
              <span style={{ fontWeight: 600, color: '#475569' }}>
                초 (초과 시 자동 체크/다이)
              </span>
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">👥 참가자 등록 (2 ~ 6명)</label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="플레이어 이름 입력"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              />
              <button className="btn btn-primary" onClick={addPlayer} disabled={players.length >= 6}>
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
            disabled={players.length < 2}
            onClick={goToMainReady}
          >
            ➡️ 순서 정하기 ({players.length}명)
          </button>
        </div>
      )}

      {/* 2. 순서 결정 화면 */}
      {gameState === 'READY' && (
        <div className="order-panel">
          <div className="order-header">
            <h3 style={{ margin: 0, fontSize: '18px' }}>📋 베팅 순서를 정해주세요</h3>
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
                  <strong style={{ color: '#2563eb', marginRight: '8px' }}>{idx + 1}번</strong>
                  {player.name} ({player.chips.toLocaleString()}칩)
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

          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
              ⚙️ 설정
            </button>
            <button
              className="btn btn-success"
              onClick={() => startRound(1, players)}
            >
              🃏 1라운드 카드 돌리기!
            </button>
          </div>
        </div>
      )}

      {/* 3. 플레이 진행 화면 */}
      {gameState !== 'SETUP' && gameState !== 'READY' && (
        <>
          <div className="game-header">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className="level-badge">
                🎰 Round {currentRound} / {totalRounds}
              </span>
              <span className="pot-badge">
                💰 POT: {pot.toLocaleString()}칩
              </span>
            </div>

            <div className="score-board">
              {players.map((p, idx) => (
                <div
                  key={p.id}
                  className={`score-card ${idx === currentPlayerIdx && gameState !== 'SHOWDOWN' ? 'active' : ''} ${p.folded ? 'folded' : ''}`}
                >
                  <div className="score-name">
                    <span>
                      {idx === currentPlayerIdx && gameState !== 'SHOWDOWN' ? '👉 ' : ''}
                      {p.name} {p.folded ? '(다이)' : ''}
                    </span>
                  </div>
                  <div className="score-val">{p.chips.toLocaleString()}칩</div>
                  {p.currentBet > 0 && !p.folded && (
                    <div className="bet-tag">베팅: {p.currentBet}</div>
                  )}
                </div>
              ))}
            </div>

            <button className="btn btn-primary" onClick={() => setGameState('SETUP')}>
              ⚙️ 설정
            </button>
          </div>

          {/* 패스 앤 플레이 가림막 (다른 사람 패 훔쳐보기 방지) */}
          {gameState === 'PASS_SCREEN' && currentPlayer && (
            <div className="pass-curtain">
              <div className="pass-icon">🙈</div>
              <h2>
                <span style={{ color: '#2563eb' }}>{currentPlayer.name}</span>님의 차례입니다!
              </h2>
              <p className="pass-desc">
                현재 단계:{' '}
                <strong>
                  {nextPhaseAfterPass === 'BETTING_1' && '1차 베팅'}
                  {nextPhaseAfterPass === 'DRAW' && '카드 교체 (Draw)'}
                  {nextPhaseAfterPass === 'BETTING_2' && '최종 베팅'}
                </strong>
                <br />
                다른 플레이어가 화면을 보지 않을 때 아래 버튼을 눌러주세요.
              </p>
              <button
                className="btn btn-success"
                style={{ maxWidth: '320px', margin: '0 auto' }}
                onClick={() => setGameState(nextPhaseAfterPass)}
              >
                👀 내 카드 확인하기
              </button>
            </div>
          )}

          {/* 실제 턴 진행 화면 (1차 베팅 / 카드 교체 / 2차 베팅) */}
          {(gameState === 'BETTING_1' || gameState === 'DRAW' || gameState === 'BETTING_2') &&
            currentPlayer && (
              <div className="table-area">
                <div className={`timer-container ${isDangerTime ? 'warning-flash' : ''}`}>
                  <div className="timer-info">
                    <span>
                      단계:{' '}
                      <strong style={{ color: '#4f46e5' }}>
                        {gameState === 'BETTING_1' && '1️⃣ 1차 베팅'}
                        {gameState === 'DRAW' && '2️⃣ 카드 교체 (바꿀 카드를 터치하세요)'}
                        {gameState === 'BETTING_2' && '3️⃣ 최종 베팅'}
                      </strong>
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

                {/* 현재 내 족보 실시간 안내 */}
                <div className="hand-status-bar">
                  <span className="player-turn-label">🎴 {currentPlayer.name}님의 패</span>
                  <span className="hand-rank-pill">{currentEval?.name}</span>
                </div>

                {/* 5장의 포커 카드 */}
                <div className="hand-grid">
                  {currentPlayer.hand.map((card, idx) => {
                    const isRed = card.suit === '♥' || card.suit === '♦';
                    const isSelected = selectedDiscardIndices.includes(idx);

                    return (
                      <div
                        key={card.id}
                        className={`poker-card ${isRed ? 'red' : 'black'} ${isSelected ? 'selected-discard' : ''}`}
                        onClick={() => toggleDiscardCard(idx)}
                      >
                        {isSelected && <div className="discard-badge">교체</div>}
                        <div className="card-corner top">
                          <span>{card.label}</span>
                          <span>{card.suit}</span>
                        </div>
                        <div className="card-center-suit">{card.suit}</div>
                        <div className="card-corner bottom">
                          <span>{card.label}</span>
                          <span>{card.suit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* 단계별 컨트롤 버튼 */}
                {(gameState === 'BETTING_1' || gameState === 'BETTING_2') && (
                  <div className="action-panel">
                    <button
                      className="btn btn-danger"
                      onClick={() => handleBetAction('FOLD')}
                    >
                      🏳️ 다이 (Fold)
                    </button>

                    <button
                      className="btn btn-primary"
                      onClick={() => handleBetAction('CHECK_CALL')}
                    >
                      {callRequired === 0
                        ? '✅ 체크 (0칩)'
                        : `📞 콜 (${Math.min(currentPlayer.chips, callRequired)}칩)`}
                    </button>

                    <button
                      className="btn btn-warning"
                      disabled={currentPlayer.chips <= callRequired}
                      onClick={() => handleBetAction('RAISE', anteAmount)}
                    >
                      🔥 레이즈 (+{anteAmount}칩)
                    </button>

                    <button
                      className="btn btn-dark"
                      disabled={currentPlayer.chips <= callRequired + anteAmount}
                      onClick={() => handleBetAction('RAISE', anteAmount * 3)}
                    >
                      💥 빅 레이즈 (+{anteAmount * 3}칩)
                    </button>
                  </div>
                )}

                {gameState === 'DRAW' && (
                  <div className="action-panel">
                    <button
                      className="btn btn-success"
                      style={{ maxWidth: '360px' }}
                      onClick={confirmDrawCards}
                    >
                      {selectedDiscardIndices.length === 0
                        ? '🛡️ 카드 바꾸지 않고 유지 (Stay)'
                        : `🔄 선택한 ${selectedDiscardIndices.length}장 카드 교체하기`}
                    </button>
                  </div>
                )}
              </div>
            )}

          {/* 4. 쇼다운 (라운드 결과 공개) 화면 */}
          {gameState === 'SHOWDOWN' && (
            <div className="showdown-panel">
              <div className="modal-trophy">🏆</div>
              <h2 style={{ margin: '0 0 6px' }}>
                {roundWinners.map((w) => w.player.name).join(', ')}님 라운드 승리!
              </h2>
              <p style={{ color: '#475569', marginBottom: '18px', fontWeight: 600 }}>
                승리 족보: <strong style={{ color: '#2563eb' }}>{roundWinners[0]?.evalResult.name}</strong> (팟 {pot.toLocaleString()}칩 획득)
              </p>

              <div className="showdown-list">
                {players.map((p) => {
                  const ev = evaluateHand(p.hand);
                  const isWinner = roundWinners.some((w) => w.player.id === p.id);

                  return (
                    <div
                      key={p.id}
                      className={`showdown-row ${isWinner ? 'winner' : ''} ${p.folded ? 'folded' : ''}`}
                    >
                      <div className="showdown-player-info">
                        <strong>
                          {isWinner ? '👑 ' : ''}
                          {p.name}
                        </strong>
                        <span className="showdown-rank-text">
                          {p.folded ? '🏳️ 다이 (기권)' : ev.name}
                        </span>
                      </div>

                      <div className="mini-hand">
                        {p.hand.map((c) => {
                          const isRed = c.suit === '♥' || c.suit === '♦';
                          return (
                            <span
                              key={c.id}
                              className={`mini-card ${isRed ? 'red' : 'black'}`}
                            >
                              {c.suit}
                              {c.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              <button
                className="btn btn-success"
                style={{ marginTop: '18px' }}
                onClick={handleNextRoundOrFinish}
              >
                {currentRound >= totalRounds || players.filter((p) => p.chips > 0).length < 2
                  ? '👑 최종 우승 결과 보기'
                  : `🚀 Round ${currentRound + 1} 시작하기`}
              </button>
            </div>
          )}
        </>
      )}

      {/* 5. 최종 게임 종료 축하 모달 */}
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
            <div className="congrats-banner">✨ POKER CHAMPION! ✨</div>
            <h2 style={{ margin: '4px 0 8px', color: '#0f172a' }}>최종 순위 발표</h2>
            <p className="modal-subtext">보유 칩 기준 최종 랭킹입니다!</p>

            <div className="rank-list">
              {sortedFinalRankings.map((p, rank) => (
                <div key={p.id} className={`rank-item ${rank === 0 ? 'winner' : ''}`}>
                  <span>
                    {rank === 0 ? '🥇 👑 ' : `${rank + 1}위 `} {p.name}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 800 }}>
                    🪙 {p.chips.toLocaleString()}칩 ({p.totalWins}승)
                  </span>
                </div>
              ))}
            </div>

            <button className="btn btn-success" onClick={goToMainReady}>
              🔄 새 게임 시작하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}