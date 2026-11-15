import { useState, useEffect, useRef } from 'react';
import './Page9.css';

type YutResultType = 'BACKDO' | 'DO' | 'GAE' | 'GEOL' | 'YUT' | 'MO';

interface YutThrow {
  id: number;
  type: YutResultType;
  label: string;
  steps: number;
  sticks: boolean[];
}

interface Piece {
  id: number; // 0 ~ 3
  pos: number; // -1: 대기석, 0~28: 보드 칸, 99: 골인
  prevPos: number | null;
}

interface Player {
  id: number;
  name: string;
  color: string;
  pieces: Piece[];
}

interface NodeCoord {
  id: number;
  x: number; // % 좌표 (board-wrapper 기준)
  y: number; // % 좌표
  isCorner?: boolean;
  isCenter?: boolean;
  label?: string;
}

// 이동 중인 말 애니메이션 상태
interface ActiveMoveAnim {
  playerIdx: number;
  pieceIds: number[];
  x: number;
  y: number;
  isImpact?: boolean;
}

// 잡혀서 대기석으로 밀려가는 말 애니메이션 상태
interface KnockbackAnim {
  playerIdx: number;
  pieceIds: number[];
  x: number;
  y: number;
  phase: 'HIT' | 'RETURN';
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
  'linear-gradient(135deg, #f3e8ff 0%, #faf5ff 100%, #e0e7ff 100%)',
];

const PIECE_COLORS = ['#ef4444', '#2563eb', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];
const PIECE_NAMES = ['첫말', '둘말', '셋말', '넷말'];
const PIECE_SHORT = ['첫', '둘', '셋', '넷'];

// 윷판 29칸 좌표 (오른쪽 90도 회전: 출발/골인이 우상단 88%, 12%)
const BOARD_NODES: NodeCoord[] = [
  { id: 0, x: 88, y: 12, isCorner: true, label: '출발/골인' },
  { id: 1, x: 72.8, y: 12 },
  { id: 2, x: 57.6, y: 12 },
  { id: 3, x: 42.4, y: 12 },
  { id: 4, x: 27.2, y: 12 },
  { id: 5, x: 12, y: 12, isCorner: true, label: '모서리' },
  { id: 6, x: 12, y: 27.2 },
  { id: 7, x: 12, y: 42.4 },
  { id: 8, x: 12, y: 57.6 },
  { id: 9, x: 12, y: 72.8 },
  { id: 10, x: 12, y: 88, isCorner: true, label: '모서리' },
  { id: 11, x: 27.2, y: 88 },
  { id: 12, x: 42.4, y: 88 },
  { id: 13, x: 57.6, y: 88 },
  { id: 14, x: 72.8, y: 88 },
  { id: 15, x: 88, y: 88, isCorner: true, label: '모서리' },
  { id: 16, x: 88, y: 72.8 },
  { id: 17, x: 88, y: 57.6 },
  { id: 18, x: 88, y: 42.4 },
  { id: 19, x: 88, y: 27.2 },
  // 대각선 및 중앙방
  { id: 20, x: 24.5, y: 24.5 },
  { id: 21, x: 37, y: 37 },
  { id: 22, x: 50, y: 50, isCorner: true, isCenter: true, label: '방' },
  { id: 23, x: 63, y: 63 },
  { id: 24, x: 75.5, y: 75.5 },
  { id: 25, x: 24.5, y: 75.5 },
  { id: 26, x: 37, y: 63 },
  { id: 27, x: 63, y: 37 },
  { id: 28, x: 75.5, y: 24.5 },
];

// 플레이어별 하단 대기석 기준 좌표 (board-stage-wrapper 기준 %)
function getWaitingCoord(playerIdx: number, totalPlayers: number): { x: number; y: number } {
  const cols = Math.min(totalPlayers, 3);
  const col = playerIdx % cols;
  const row = Math.floor(playerIdx / cols);
  const x = ((col + 0.5) / cols) * 100;
  const y = 109 + row * 11;
  return { x, y };
}

// 노드 ID 또는 특수 상태(-1 대기, 99 골인)의 좌표 반환
function getPositionCoord(
  pos: number,
  playerIdx: number,
  totalPlayers: number
): { x: number; y: number } {
  if (pos === -1) {
    return getWaitingCoord(playerIdx, totalPlayers);
  }
  if (pos === 99) {
    // 골인 지점(우상단 바깥쪽으로 빠져나가는 좌표)
    return { x: 96, y: 4 };
  }
  const node = BOARD_NODES.find((n) => n.id === pos);
  return node ? { x: node.x, y: node.y } : { x: 88, y: 12 };
}

function getNextStep(curr: number, isStartOfMove: boolean): number {
  if (curr === 99) return 99;
  if (curr === -1) return 1;

  if (isStartOfMove) {
    if (curr === 5) return 20;
    if (curr === 10) return 25;
    if (curr === 22) return 27;
  }

  if (curr === 20) return 21;
  if (curr === 21) return 22;
  if (curr === 22) return 23;
  if (curr === 23) return 24;
  if (curr === 24) return 15;

  if (curr === 25) return 26;
  if (curr === 26) return 22;
  if (curr === 27) return 28;
  if (curr === 28) return 0;

  if (curr === 19) return 0;
  if (curr === 0) return 99;

  return curr + 1;
}

function getBackdoStep(curr: number, prevPos: number | null): number {
  if (curr <= 0 || curr === 99) return curr;
  if (curr === 1) return 0;
  if (curr === 20) return 5;
  if (curr === 21) return 20;
  if (curr === 25) return 10;
  if (curr === 26) return 25;
  if (curr === 22) return prevPos === 26 ? 26 : 21;
  if (curr === 23) return 22;
  if (curr === 24) return 23;
  if (curr === 27) return 22;
  if (curr === 28) return 27;
  if (curr === 15) return prevPos === 24 ? 24 : 14;
  return curr - 1;
}

// 이동 경로(거쳐가는 모든 칸 목록) 및 최종 목적지 계산
function calculateMovePath(
  piece: Piece,
  steps: number
): { path: number[]; dest: number; lastPrev: number | null } {
  if (steps === -1) {
    if (piece.pos === -1) return { path: [], dest: -1, lastPrev: null };
    const backPos = getBackdoStep(piece.pos, piece.prevPos);
    return { path: [backPos], dest: backPos, lastPrev: null };
  }

  const path: number[] = [];
  let curr = piece.pos;
  let prev = piece.prevPos;

  // 대기석(-1)에서 출발 시 0번(출발점)을 거쳐 1번으로 진입하는 경로 연출
  if (curr === -1) {
    path.push(0);
  }

  for (let i = 0; i < steps; i++) {
    if (curr === 99) break;
    const next = getNextStep(curr, i === 0);
    prev = curr;
    curr = next;
    path.push(curr);
  }
  return { path, dest: curr, lastPrev: prev };
}

export default function Page9() {
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputName, setInputName] = useState('');
  const [pieceCount, setPieceCount] = useState<number>(4);
  const [useBackdo, setUseBackdo] = useState<boolean>(true);

  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [throwsLeft, setThrowsLeft] = useState<number>(1);
  const [pendingMoves, setPendingMoves] = useState<YutThrow[]>([]);
  const [selectedMoveId, setSelectedMoveId] = useState<number | null>(null);
  const [isThrowing, setIsThrowing] = useState<boolean>(false);
  const [lastSticks, setLastSticks] = useState<boolean[]>([false, false, false, false]);
  const [winner, setWinner] = useState<Player | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'catch' | 'bonus' | 'celebrate';
  } | null>(null);

  // 경로 이동 및 잡기 밀려남 애니메이션 상태
  const [activeMoveAnim, setActiveMoveAnim] = useState<ActiveMoveAnim | null>(null);
  const [knockbackAnim, setKnockbackAnim] = useState<KnockbackAnim | null>(null);
  const isAnimatingRef = useRef(false);

  const showToast = (
    text: string,
    type: 'info' | 'catch' | 'bonus' | 'celebrate' = 'info'
  ) => {
    setToast({ id: Date.now(), text, type });
  };

  const speakKorean = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 1.1;
      utterance.pitch = 1.1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playSound = (kind: 'throw' | 'step' | 'catch' | 'goal' | 'win') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      const notesMap: Record<typeof kind, number[]> = {
        throw: [330, 440, 550],
        step: [523.25],
        catch: [392, 587.33, 880],
        goal: [523.25, 659.25, 783.99, 1046.5],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      };
      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(0.16, ctx.currentTime + idx * 0.07);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.07);
        osc.stop(ctx.currentTime + idx * 0.07 + 0.22);
      });
    } catch {}
  };

  const addPlayer = () => {
    if (!inputName.trim()) return;
    if (players.length >= 6) {
      showToast('최대 6명까지 참가할 수 있습니다.', 'info');
      return;
    }
    const nextColor = PIECE_COLORS[players.length % PIECE_COLORS.length];
    setPlayers([
      ...players,
      {
        id: Date.now() + Math.random(),
        name: inputName.trim(),
        color: nextColor,
        pieces: [],
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
    if (players.length < 2) {
      showToast('최소 2명 이상의 참가자를 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startGame = () => {
    const initialized = players.map((p, idx) => ({
      ...p,
      color: PIECE_COLORS[idx % PIECE_COLORS.length],
      pieces: Array.from({ length: pieceCount }, (_, i) => ({
        id: i,
        pos: -1,
        prevPos: null,
      })),
    }));
    setPlayers(initialized);
    setCurrentPlayerIdx(0);
    setThrowsLeft(1);
    setPendingMoves([]);
    setSelectedMoveId(null);
    setActiveMoveAnim(null);
    setKnockbackAnim(null);
    isAnimatingRef.current = false;
    setWinner(null);
    setGameState('PLAYING');
    showToast(`${initialized[0].name}님 차례입니다! 윷을 던져주세요.`, 'info');
  };

  const advanceTurn = (updatedPlayers: Player[]) => {
    const nextIdx = (currentPlayerIdx + 1) % updatedPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    setThrowsLeft(1);
    setPendingMoves([]);
    setSelectedMoveId(null);
    showToast(`👉 다음 차례: ${updatedPlayers[nextIdx].name}님!`, 'info');
  };

  const handleThrowYut = () => {
    if (isThrowing || throwsLeft <= 0 || gameState !== 'PLAYING' || isAnimatingRef.current) return;

    setIsThrowing(true);
    playSound('throw');

    window.setTimeout(() => {
      const sticks = Array.from({ length: 4 }, () => Math.random() < 0.55);
      const bellyCount = sticks.filter(Boolean).length;

      let type: YutResultType = 'DO';
      let label = '도 (1칸)';
      let steps = 1;
      let isBonus = false;

      if (bellyCount === 0) {
        type = 'MO';
        label = '모 (5칸 + 1번 더!)';
        steps = 5;
        isBonus = true;
      } else if (bellyCount === 4) {
        type = 'YUT';
        label = '윷 (4칸 + 1번 더!)';
        steps = 4;
        isBonus = true;
      } else if (bellyCount === 3) {
        type = 'GEOL';
        label = '걸 (3칸)';
        steps = 3;
      } else if (bellyCount === 2) {
        type = 'GAE';
        label = '개 (2칸)';
        steps = 2;
      } else if (bellyCount === 1) {
        if (useBackdo && sticks[0]) {
          type = 'BACKDO';
          label = '백도 (-1칸)';
          steps = -1;
        } else {
          type = 'DO';
          label = '도 (1칸)';
          steps = 1;
        }
      }

      setLastSticks(sticks);
      setIsThrowing(false);

      const newThrow: YutThrow = {
        id: Date.now() + Math.random(),
        type,
        label,
        steps,
        sticks,
      };

      const nextThrowsLeft = throwsLeft - 1 + (isBonus ? 1 : 0);
      const nextPending = [...pendingMoves, newThrow];

      setThrowsLeft(nextThrowsLeft);
      setPendingMoves(nextPending);
      if (!selectedMoveId) {
        setSelectedMoveId(newThrow.id);
      }

      const spokenWord =
        type === 'BACKDO'
          ? '백도!'
          : type === 'DO'
          ? '도!'
          : type === 'GAE'
          ? '개!'
          : type === 'GEOL'
          ? '걸!'
          : type === 'YUT'
          ? '윷! 한 번 더!'
          : '모! 한 번 더!';

      speakKorean(spokenWord);
      showToast(`🎲 ${spokenWord}`, isBonus ? 'bonus' : 'info');

      if (nextThrowsLeft === 0) {
        const currentPlayer = players[currentPlayerIdx];
        const hasPieceOnBoard = currentPlayer.pieces.some((p) => p.pos >= 0 && p.pos < 99);
        const allMovesAreBackdo = nextPending.every((m) => m.steps === -1);

        if (allMovesAreBackdo && !hasPieceOnBoard) {
          window.setTimeout(() => {
            showToast('😢 백도가 나왔지만 움직일 말이 없어 턴이 넘어갑니다!', 'info');
            advanceTurn(players);
          }, 1100);
        }
      }
    }, 850);
  };

  // 한 칸씩 이동 경로를 따라가는 순차 애니메이션 실행
  const handleSelectPieceToMove = async (pieceId: number) => {
    if (gameState !== 'PLAYING' || isThrowing || isAnimatingRef.current) return;

    const currentMove = pendingMoves.find((m) => m.id === selectedMoveId) || pendingMoves[0];
    if (!currentMove) {
      showToast('먼저 윷을 던져주세요!', 'info');
      return;
    }

    const currentPlayer = players[currentPlayerIdx];
    const targetPiece = currentPlayer.pieces.find((p) => p.id === pieceId);
    if (!targetPiece || targetPiece.pos === 99) return;

    if (currentMove.steps === -1 && targetPiece.pos === -1) {
      showToast('대기 중인 말은 백도로 이동할 수 없습니다. 판 위의 말을 터치하세요!', 'info');
      return;
    }

    const startPos = targetPiece.pos;
    const { path, dest, lastPrev } = calculateMovePath(targetPiece, currentMove.steps);

    // 같은 칸에 업힌 내 말들 모두 함께 이동
    const movingPieceIds =
      startPos >= 0
        ? currentPlayer.pieces.filter((p) => p.pos === startPos).map((p) => p.id)
        : [targetPiece.id];

    isAnimatingRef.current = true;

    // 1단계: 시작 좌표에 애니메이션 말 배치
    const startCoord = getPositionCoord(startPos, currentPlayerIdx, players.length);
    setActiveMoveAnim({
      playerIdx: currentPlayerIdx,
      pieceIds: movingPieceIds,
      x: startCoord.x,
      y: startCoord.y,
    });

    await new Promise((r) => setTimeout(r, 60));

    // 2단계: 이동 경로(path)의 각 칸을 하나씩 차례대로 이동
    for (let i = 0; i < path.length; i++) {
      const stepNode = path[i];
      const coord = getPositionCoord(stepNode, currentPlayerIdx, players.length);
      playSound('step');
      setActiveMoveAnim({
        playerIdx: currentPlayerIdx,
        pieceIds: movingPieceIds,
        x: coord.x,
        y: coord.y,
      });
      await new Promise((r) => setTimeout(r, 230));
    }

    // 3단계: 도착 칸에 상대 말이 있는지 확인 후 '툭 치고 밀려나는' 충돌 애니메이션 연출
    let caughtOpponent = false;
    let caughtPlayerIdx = -1;
    let caughtPieceIds: number[] = [];

    if (dest >= 0 && dest < 99) {
      players.forEach((p, idx) => {
        if (idx !== currentPlayerIdx) {
          const enemyPiecesOnDest = p.pieces.filter((pc) => pc.pos === dest);
          if (enemyPiecesOnDest.length > 0) {
            caughtOpponent = true;
            caughtPlayerIdx = idx;
            caughtPieceIds = enemyPiecesOnDest.map((pc) => pc.id);
          }
        }
      });
    }

    if (caughtOpponent && caughtPlayerIdx !== -1) {
      const destCoord = getPositionCoord(dest, currentPlayerIdx, players.length);
      const waitCoord = getWaitingCoord(caughtPlayerIdx, players.length);

      // 공격 말이 툭 부딪히는 모션
      playSound('catch');
      setActiveMoveAnim({
        playerIdx: currentPlayerIdx,
        pieceIds: movingPieceIds,
        x: destCoord.x,
        y: destCoord.y,
        isImpact: true,
      });

      // 상대 말이 옆으로 튕겼다가 하단 대기석으로 쭉 밀려 복귀
      setKnockbackAnim({
        playerIdx: caughtPlayerIdx,
        pieceIds: caughtPieceIds,
        x: destCoord.x + (waitCoord.x > destCoord.x ? 5 : -5),
        y: destCoord.y - 5,
        phase: 'HIT',
      });

      await new Promise((r) => setTimeout(r, 240));

      setKnockbackAnim({
        playerIdx: caughtPlayerIdx,
        pieceIds: caughtPieceIds,
        x: waitCoord.x,
        y: waitCoord.y,
        phase: 'RETURN',
      });

      await new Promise((r) => setTimeout(r, 460));
      setKnockbackAnim(null);
    }

    // 4단계: 실제 게임 데이터 확정 반영
    const scoredGoal = dest === 99;
    const updatedPlayers = players.map((player, pIdx) => {
      if (pIdx === currentPlayerIdx) {
        return {
          ...player,
          pieces: player.pieces.map((p) =>
            movingPieceIds.includes(p.id)
              ? { ...p, pos: dest, prevPos: dest === 99 ? null : lastPrev }
              : p
          ),
        };
      } else if (caughtOpponent && pIdx === caughtPlayerIdx) {
        return {
          ...player,
          pieces: player.pieces.map((p) =>
            caughtPieceIds.includes(p.id) ? { ...p, pos: -1, prevPos: null } : p
          ),
        };
      }
      return player;
    });

    const remainingMoves = pendingMoves.filter((m) => m.id !== currentMove.id);
    const nextThrowsLeft = throwsLeft + (caughtOpponent ? 1 : 0);

    setActiveMoveAnim(null);
    setPlayers(updatedPlayers);
    setPendingMoves(remainingMoves);
    setSelectedMoveId(remainingMoves.length > 0 ? remainingMoves[0].id : null);
    setThrowsLeft(nextThrowsLeft);
    isAnimatingRef.current = false;

    const updatedCurrentPlayer = updatedPlayers[currentPlayerIdx];
    const allFinished = updatedCurrentPlayer.pieces.every((p) => p.pos === 99);

    if (allFinished) {
      setWinner(updatedCurrentPlayer);
      setGameState('GAME_OVER');
      playSound('win');
      speakKorean(`축하합니다! ${updatedCurrentPlayer.name}님이 승리했습니다!`);
      return;
    }

    if (caughtOpponent) {
      speakKorean('상대 말을 잡았습니다! 대단해요!');
      showToast('💥 상대 말을 툭 쳐서 잡았습니다! 🌟❤️ 보너스 턴!', 'catch');
    } else if (scoredGoal) {
      playSound('goal');
      speakKorean('말이 완주했습니다! 최고예요!');
      showToast(`🎉 ${PIECE_NAMES[targetPiece.id]} 완주 성공! 💖✨`, 'celebrate');
    } else {
      showToast(`✨ 이동 완료!`, 'celebrate');
    }

    if (nextThrowsLeft === 0 && remainingMoves.length === 0) {
      window.setTimeout(() => {
        advanceTurn(updatedPlayers);
      }, 450);
    } else if (nextThrowsLeft === 0 && remainingMoves.length > 0) {
      const hasPieceOnBoard = updatedCurrentPlayer.pieces.some((p) => p.pos >= 0 && p.pos < 99);
      const allMovesAreBackdo = remainingMoves.every((m) => m.steps === -1);
      if (allMovesAreBackdo && !hasPieceOnBoard) {
        window.setTimeout(() => {
          showToast('😢 남은 백도를 쓸 수 있는 말이 없어 턴이 넘어갑니다!', 'info');
          advanceTurn(updatedPlayers);
        }, 900);
      }
    }
  };

  const activeMove = pendingMoves.find((m) => m.id === selectedMoveId) || pendingMoves[0] || null;
  const currentPlayer = players[currentPlayerIdx];

  const previewDestinations = new Set<number>();
  if (gameState === 'PLAYING' && activeMove && currentPlayer && !activeMoveAnim) {
    currentPlayer.pieces.forEach((p) => {
      if (p.pos === 99) return;
      if (activeMove.steps === -1 && p.pos === -1) return;
      const { dest } = calculateMovePath(p, activeMove.steps);
      if (dest >= 0 && dest < 99) previewDestinations.add(dest);
    });
  }

  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === 'Space' &&
        gameState === 'PLAYING' &&
        throwsLeft > 0 &&
        !isThrowing &&
        !isAnimatingRef.current
      ) {
        e.preventDefault();
        handleThrowYut();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  // 물리적으로 겹쳐 보이는 둥근 사각형 말 스택 렌더러
  const renderPhysicalPieceStack = (
    player: Player,
    pieceIds: number[],
    selectable: boolean,
    onClick?: () => void,
    extraClass = ''
  ) => {
    return (
      <div
        className={`physical-stack-group ${selectable ? 'selectable' : ''} ${extraClass}`}
        onClick={selectable ? onClick : undefined}
        title={`${player.name}의 ${pieceIds.map((id) => PIECE_NAMES[id]).join(', ')}`}
      >
        {pieceIds.map((pid, idx) => (
          <div
            key={pid}
            className="yut-piece-rect"
            style={{
              backgroundColor: player.color,
              transform: `translate(${idx * 5}px, ${-idx * 5}px)`,
              zIndex: idx + 1,
            }}
          >
            <span>{PIECE_SHORT[pid]}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="yut-container" style={{ background: currentBackground }}>
      {toast && gameState === 'PLAYING' && (
        <div key={toast.id} className={`yut-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* 설정 화면 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">🎯 전통 윷놀이 게임 설정</h1>

          <div className="setting-section">
            <label className="setting-label">♟️ 참가자별 말 개수 선택 (1말 ~ 4말)</label>
            <div className="piece-count-selector">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`count-btn ${pieceCount === num ? 'active' : ''}`}
                  onClick={() => setPieceCount(num)}
                >
                  {num}말
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="checkbox-label">
              <input
                type="checkbox"
                className="checkbox-input"
                checked={useBackdo}
                onChange={(e) => setUseBackdo(e.target.checked)}
              />
              🔙 백도(뒷도) 규칙 사용 (특수 표시 윷 1개만 뒤집히면 -1칸 후퇴)
            </label>
          </div>

          <div className="setting-section">
            <label className="setting-label">👥 참가자 등록 (2~6명)</label>
            <div className="input-group">
              <input
                type="text"
                className="player-input"
                placeholder="참가자 이름 입력 후 추가"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
              />
              <button className="btn btn-primary" onClick={addPlayer}>
                ➕ 추가
              </button>
            </div>

            <div className="player-list">
              {players.map((player, idx) => (
                <div key={player.id} className="player-item">
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span
                      className="color-dot"
                      style={{ backgroundColor: PIECE_COLORS[idx % PIECE_COLORS.length] }}
                    />
                    {player.name}
                  </span>
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
            ➡️ 순서 정하러 가기 ({players.length}명)
          </button>
        </div>
      )}

      {/* 순서 정하기 화면 */}
      {gameState === 'READY' && (
        <div className="order-panel">
          <div className="order-header">
            <h2 style={{ margin: 0, fontSize: '20px' }}>📋 참가자 진행 순서를 정해주세요</h2>
            <button
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
                    className="color-dot"
                    style={{ backgroundColor: PIECE_COLORS[idx % PIECE_COLORS.length] }}
                  />
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

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
              ⬅️ 설정으로
            </button>
            <button className="btn btn-success" onClick={startGame}>
              🚀 윷놀이 시작! ({pieceCount}말 · {useBackdo ? '백도 포함' : '백도 없음'})
            </button>
          </div>
        </div>
      )}

      {/* 메인 윷놀이 플레이 화면 */}
      {gameState === 'PLAYING' && currentPlayer && (
        <div className="play-wrapper">
          <div className="game-header">
            <div className="rule-badge">
              🎯 {pieceCount}말 경기 · {useBackdo ? '백도 ON' : '백도 OFF'}
            </div>

            <div className="player-status-bar">
              {players.map((p, idx) => {
                const finishedCount = p.pieces.filter((pc) => pc.pos === 99).length;
                return (
                  <div
                    key={p.id}
                    className={`player-badge-card ${idx === currentPlayerIdx ? 'active' : ''}`}
                    style={{ borderColor: idx === currentPlayerIdx ? p.color : 'transparent' }}
                  >
                    <div className="player-badge-top">
                      <span className="color-dot" style={{ backgroundColor: p.color }} />
                      <strong>{p.name}</strong>
                      {idx === currentPlayerIdx && <span className="turn-tag">차례</span>}
                    </div>
                    <div className="player-badge-sub">
                      골인: {finishedCount} / {pieceCount}말
                    </div>
                  </div>
                );
              })}
            </div>

            <button className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
              ⚙️ 설정
            </button>
          </div>

          <div className="main-stage">
            {/* 왼쪽: 윷판 + 윷판 바로 밑 전체 참가자 대기석 */}
            <div className="board-column">
              <div className="board-stage-wrapper">
                <div className="board-section">
                  <div className="yut-board">
                    <svg className="board-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
                      <rect
                        x="12"
                        y="12"
                        width="76"
                        height="76"
                        fill="none"
                        stroke="#b45309"
                        strokeWidth="0.9"
                      />
                      <line x1="12" y1="12" x2="88" y2="88" stroke="#b45309" strokeWidth="0.8" />
                      <line x1="88" y1="12" x2="12" y2="88" stroke="#b45309" strokeWidth="0.8" />
                    </svg>

                    {/* 29개 둥근 윷칸 */}
                    {BOARD_NODES.map((node) => {
                      const isPreview = previewDestinations.has(node.id);
                      return (
                        <div
                          key={node.id}
                          className={`board-node ${node.isCorner ? 'corner' : ''} ${
                            node.isCenter ? 'center' : ''
                          } ${isPreview ? 'preview-target' : ''}`}
                          style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        >
                          {node.label && <span className="node-label">{node.label}</span>}
                        </div>
                      );
                    })}

                    {/* 보드 위에 정지해 있는 말들 (둥근 사각형 + 물리적 겹침) */}
                    {BOARD_NODES.map((node) => {
                      const stacksOnNode = players
                        .map((player, pIdx) => ({
                          player,
                          pIdx,
                          pieces: player.pieces.filter((pc) => {
                            // 현재 이동 애니메이션 중인 말은 중복 표시 방지
                            if (
                              activeMoveAnim &&
                              activeMoveAnim.playerIdx === pIdx &&
                              activeMoveAnim.pieceIds.includes(pc.id)
                            ) {
                              return false;
                            }
                            return pc.pos === node.id;
                          }),
                        }))
                        .filter((item) => item.pieces.length > 0);

                      if (stacksOnNode.length === 0) return null;

                      return (
                        <div
                          key={`pieces-${node.id}`}
                          className="node-pieces-wrapper"
                          style={{ left: `${node.x}%`, top: `${node.y}%` }}
                        >
                          {stacksOnNode.map(({ player, pIdx, pieces }) => {
                            const isMyTurn = pIdx === currentPlayerIdx;
                            const canMove = isMyTurn && activeMove !== null && !activeMoveAnim;
                            const ids = pieces.map((pc) => pc.id);

                            return (
                              <div key={player.id}>
                                {renderPhysicalPieceStack(player, ids, canMove, () =>
                                  handleSelectPieceToMove(ids[0])
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 5. 윷판 바로 밑 전체 참가자 통합 대기석 */}
                <div className="bottom-waiting-dock">
                  <div className="dock-header">🏠 참가자 대기석 (말을 터치하여 출발!)</div>
                  <div className="dock-players-grid">
                    {players.map((player, pIdx) => {
                      const isMyTurn = pIdx === currentPlayerIdx;
                      const waitingPieces = player.pieces.filter((pc) => {
                        if (
                          activeMoveAnim &&
                          activeMoveAnim.playerIdx === pIdx &&
                          activeMoveAnim.pieceIds.includes(pc.id)
                        ) {
                          return false;
                        }
                        if (
                          knockbackAnim &&
                          knockbackAnim.playerIdx === pIdx &&
                          knockbackAnim.pieceIds.includes(pc.id)
                        ) {
                          return false;
                        }
                        return pc.pos === -1;
                      });

                      const finishedPieces = player.pieces.filter((pc) => pc.pos === 99);

                      return (
                        <div
                          key={player.id}
                          className={`dock-player-box ${isMyTurn ? 'active-turn' : ''}`}
                          style={{ borderColor: isMyTurn ? player.color : '#e2e8f0' }}
                        >
                          <div className="dock-player-name">
                            <span
                              className="color-dot"
                              style={{ backgroundColor: player.color }}
                            />
                            <span>{player.name}</span>
                            {finishedPieces.length > 0 && (
                              <span className="dock-goal-badge">
                                🏆{finishedPieces.length}
                              </span>
                            )}
                          </div>

                          <div className="dock-pieces-row">
                            {waitingPieces.length === 0 ? (
                              <span className="dock-empty-text">대기 말 없음</span>
                            ) : (
                              waitingPieces.map((pc) => {
                                const canDepart =
                                  isMyTurn &&
                                  activeMove !== null &&
                                  activeMove.steps > 0 &&
                                  !activeMoveAnim;
                                return (
                                  <button
                                    key={pc.id}
                                    type="button"
                                    disabled={!canDepart}
                                    className={`yut-piece-rect dock-piece ${
                                      canDepart ? 'selectable' : ''
                                    }`}
                                    style={{ backgroundColor: player.color }}
                                    onClick={() => handleSelectPieceToMove(pc.id)}
                                    title={`${player.name}의 ${PIECE_NAMES[pc.id]} 출발`}
                                  >
                                    <span>{PIECE_SHORT[pc.id]}</span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 3 & 4. 경로를 따라 쭉 이동하는 오버레이 말 & 잡혀서 밀려나는 오버레이 말 */}
                {activeMoveAnim && (
                  <div
                    className={`moving-overlay-piece ${
                      activeMoveAnim.isImpact ? 'impact-hit' : ''
                    }`}
                    style={{
                      left: `${activeMoveAnim.x}%`,
                      top: `${activeMoveAnim.y}%`,
                    }}
                  >
                    {renderPhysicalPieceStack(
                      players[activeMoveAnim.playerIdx],
                      activeMoveAnim.pieceIds,
                      false
                    )}
                  </div>
                )}

                {knockbackAnim && (
                  <div
                    className={`knockback-overlay-piece ${
                      knockbackAnim.phase === 'HIT' ? 'phase-hit' : 'phase-return'
                    }`}
                    style={{
                      left: `${knockbackAnim.x}%`,
                      top: `${knockbackAnim.y}%`,
                    }}
                  >
                    {renderPhysicalPieceStack(
                      players[knockbackAnim.playerIdx],
                      knockbackAnim.pieceIds,
                      false
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 오른쪽: 컨트롤 패널 */}
            <div className="control-section">
              <div
                className="turn-banner"
                style={{ borderLeft: `6px solid ${currentPlayer.color}` }}
              >
                <div style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>
                  현재 공격 차례
                </div>
                <div style={{ fontSize: '22px', fontWeight: 900, color: '#0f172a' }}>
                  {currentPlayer.name}님
                </div>
              </div>

              <div className="yut-box">
                <div className={`yut-drone-stage ${isThrowing ? 'drone-action' : ''}`}>
                  <div className="yut-sticks-row">
                    {lastSticks.map((isBelly, idx) => (
                      <div
                        key={idx}
                        className={`yut-stick-long ${isBelly ? 'belly' : 'back'} ${
                          isThrowing ? 'spinning' : ''
                        }`}
                      >
                        {isBelly ? (
                          <div className="stick-marks-long">
                            <span>✕</span>
                            <span>✕</span>
                            {idx === 0 && useBackdo && <span className="backdo-tag">🔙</span>}
                            <span>✕</span>
                          </div>
                        ) : (
                          <div className="stick-back-pattern-long">|||||</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  className="btn-throw"
                  disabled={throwsLeft <= 0 || isThrowing || Boolean(activeMoveAnim)}
                  onClick={handleThrowYut}
                >
                  {isThrowing
                    ? '🎲 윷 공중 회전 중...'
                    : throwsLeft > 0
                    ? `🎲 윷 던지기 (남은 기회: ${throwsLeft}회)`
                    : '👇 이동할 말을 터치하세요'}
                </button>
              </div>

              <div className="moves-box">
                <div className="box-title">📋 이동할 윷 결과 ({pendingMoves.length}개)</div>
                {pendingMoves.length === 0 ? (
                  <div className="empty-hint">윷을 던지면 이동 칸수가 여기에 표시됩니다.</div>
                ) : (
                  <div className="move-chips">
                    {pendingMoves.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className={`move-chip ${activeMove?.id === m.id ? 'selected' : ''} ${
                          m.steps === -1 ? 'backdo' : ''
                        }`}
                        onClick={() => setSelectedMoveId(m.id)}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="pieces-box">
                <div className="box-title">
                  ♟️ {currentPlayer.name}님의 말 상태 (버튼으로도 선택 가능)
                </div>
                <div className="my-pieces-grid">
                  {currentPlayer.pieces.map((pc) => {
                    const isWaiting = pc.pos === -1;
                    const isFinished = pc.pos === 99;
                    const isDisabled =
                      !activeMove ||
                      isFinished ||
                      Boolean(activeMoveAnim) ||
                      (activeMove.steps === -1 && isWaiting);

                    const stackedCount =
                      pc.pos >= 0 && pc.pos < 99
                        ? currentPlayer.pieces.filter((other) => other.pos === pc.pos).length
                        : 1;

                    return (
                      <button
                        key={pc.id}
                        type="button"
                        disabled={isDisabled}
                        className={`my-piece-btn ${!isDisabled ? 'ready' : ''} ${
                          isFinished ? 'finished' : ''
                        }`}
                        onClick={() => handleSelectPieceToMove(pc.id)}
                      >
                        <span
                          className="piece-avatar"
                          style={{
                            backgroundColor: isFinished ? '#94a3b8' : currentPlayer.color,
                          }}
                        >
                          {PIECE_NAMES[pc.id]}
                        </span>
                        <div className="piece-status-info">
                          <strong>{PIECE_NAMES[pc.id]}</strong>
                          <span>
                            {isFinished
                              ? '🏆 완주 완료'
                              : isWaiting
                              ? '🏠 하단 대기석'
                              : `📍 ${pc.pos}번 칸${
                                  stackedCount > 1 ? ` (${stackedCount}개 업힘)` : ''
                                }`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 최종 승리 축하 모달 */}
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

          <div className="modal-content grand-finale">
            <div className="modal-trophy">👑🏆👑</div>
            <div className="congrats-banner">✨ CONGRATULATIONS! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟💖
            </h2>
            <p className="modal-subtext">
              모든 말({pieceCount}말)을 가장 먼저 완주시켰습니다!
            </p>

            <div className="rank-list">
              {players.map((p) => {
                const done = p.pieces.filter((pc) => pc.pos === 99).length;
                const isChamp = p.id === winner.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="color-dot" style={{ backgroundColor: p.color }} />
                      {isChamp ? '🥇 ' : ''}
                      {p.name}
                    </span>
                    <span>
                      완주: {done} / {pieceCount}말
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="btn btn-secondary" onClick={() => setGameState('SETUP')}>
                ⚙️ 설정 변경
              </button>
              <button className="btn btn-success" onClick={startGame}>
                🔄 바로 다시 하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}