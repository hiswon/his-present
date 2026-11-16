import { useState, useRef } from 'react';
import './Page10.css';

// 방향: [상(Top), 우(Right), 하(Bottom), 좌(Left)]
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
  rotation: number; // 0, 1, 2, 3 (x 90deg)
  fixed: boolean;
  treasure?: TreasureItem;
  startCornerOf?: number;
}

interface LabyrinthPlayer {
  id: number;
  name: string;
  color: string;
  row: number;
  col: number;
  startRow: number;
  startCol: number;
  targetStack: TreasureItem[];
  collected: TreasureItem[];
}

interface PushArrow {
  id: string;
  dir: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
  index: number; // 1, 3, 5
  oppositeId: string;
}

interface ShiftAnimState {
  dir: 'DOWN' | 'UP' | 'RIGHT' | 'LEFT';
  index: number;
  incomingTile: BoardTile;
}

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
];

const PIECE_COLORS = ['#ef4444', '#2563eb', '#10b981', '#f59e0b'];
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const TREASURE_ITEMS: TreasureItem[] = [
  { id: 't1', name: '황금 왕관', emoji: '👑' },
  { id: 't2', name: '푸른 다이아', emoji: '💎' },
  { id: 't3', name: '마법 반지', emoji: '💍' },
  { id: 't4', name: '고대 보물상자', emoji: '🧰' },
  { id: 't5', name: '황금 열쇠', emoji: '🗝️' },
  { id: 't6', name: '전설의 검', emoji: '⚔️' },
  { id: 't7', name: '수호 방패', emoji: '🛡️' },
  { id: 't8', name: '수정 구슬', emoji: '🔮' },
  { id: 't9', name: '마법 램프', emoji: '🪔' },
  { id: 't10', name: '고대 두루마리', emoji: '📜' },
  { id: 't11', name: '황금 성배', emoji: '🏆' },
  { id: 't12', name: '불사조 깃털', emoji: '🪶' },
  { id: 't13', name: '신비한 나침반', emoji: '🧭' },
  { id: 't14', name: '황금 모래시계', emoji: '⏳' },
  { id: 't15', name: '드래곤 알', emoji: '🥚' },
  { id: 't16', name: '마법 지팡이', emoji: '🪄' },
  { id: 't17', name: '고대 망원경', emoji: '🔭' },
  { id: 't18', name: '왕실 루비', emoji: '❤️‍🔥' },
  { id: 't19', name: '해적 금화', emoji: '🪙' },
  { id: 't20', name: '별빛 등불', emoji: '🏮' },
  { id: 't21', name: '고대 가면', emoji: '🎭' },
  { id: 't22', name: '천사의 하프', emoji: '🪕' },
  { id: 't23', name: '성스러운 책', emoji: '📕' },
  { id: 't24', name: '황금 사과', emoji: '🍎' },
];

const SHIFT_CHEERS = [
  '오케이! 길이 열렸어요!',
  '좋아! 멋진 한 수예요!',
  '나이스! 미로가 움직입니다!',
  '훌륭해요! 길이 이어졌어요!',
];

const MOVE_CHEERS = [
  '원더풀! 멋지게 이동했어요!',
  '좋아! 보물에 가까워졌어요!',
  '오케이! 순조롭게 전진합니다!',
  '굿! 훌륭한 선택이에요!',
];

const START_CORNERS = [
  { row: 0, col: 0, rotation: 1 },
  { row: 0, col: 6, rotation: 2 },
  { row: 6, col: 6, rotation: 3 },
  { row: 6, col: 0, rotation: 0 },
];

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
  const startKey = `${startRow},${startCol}`;
  paths.set(startKey, [{ r: startRow, c: startCol }]);

  const queue: { r: number; c: number }[] = [{ r: startRow, c: startCol }];
  const deltas = [
    { dr: -1, dc: 0, dirIdx: 0, oppIdx: 2 },
    { dr: 0, dc: 1, dirIdx: 1, oppIdx: 3 },
    { dr: 1, dc: 0, dirIdx: 2, oppIdx: 0 },
    { dr: 0, dc: -1, dirIdx: 3, oppIdx: 1 },
  ];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currTile = board[curr.r][curr.c];
    const currDirs = getOpenDirections(currTile.shape, currTile.rotation);
    const currPath = paths.get(`${curr.r},${curr.c}`)!;

    for (const { dr, dc, dirIdx, oppIdx } of deltas) {
      if (!currDirs[dirIdx]) continue;
      const nr = curr.r + dr;
      const nc = curr.c + dc;
      if (nr < 0 || nr >= 7 || nc < 0 || nc >= 7) continue;

      const nextKey = `${nr},${nc}`;
      if (paths.has(nextKey)) continue;

      const nextTile = board[nr][nc];
      const nextDirs = getOpenDirections(nextTile.shape, nextTile.rotation);
      if (nextDirs[oppIdx]) {
        paths.set(nextKey, [...currPath, { r: nr, c: nc }]);
        queue.push({ r: nr, c: nc });
      }
    }
  }

  return paths;
}

function createInitialBoard(treasurePool: TreasureItem[]): {
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

  const movableShapes: TileShape[] = [
    ...Array(12).fill('I'),
    ...Array(16).fill('L'),
    ...Array(6).fill('T'),
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
      const cornerIdx = START_CORNERS.findIndex((sc) => sc.row === r && sc.col === c);
      if (cornerIdx !== -1) {
        return {
          uid: `tile-${r}-${c}`,
          shape: 'L',
          rotation: START_CORNERS[cornerIdx].rotation,
          fixed: true,
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
          treasure: treasureMap.get(`${r},${c}`),
        };
      }

      const shape = shuffledShapes[shapeCursor++];
      return {
        uid: `tile-${r}-${c}`,
        shape,
        rotation: Math.floor(Math.random() * 4),
        fixed: false,
        treasure: treasureMap.get(`${r},${c}`),
      };
    })
  );

  const spare: BoardTile = {
    uid: 'tile-spare',
    shape: shuffledShapes[shapeCursor] || 'L',
    rotation: 0,
    fixed: false,
  };

  return { board, spare };
}

export default function Page10() {
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<LabyrinthPlayer[]>([
    {
      id: 1,
      name: '탐험가 1',
      color: PIECE_COLORS[0],
      row: 0,
      col: 0,
      startRow: 0,
      startCol: 0,
      targetStack: [],
      collected: [],
    },
    {
      id: 2,
      name: '탐험가 2',
      color: PIECE_COLORS[1],
      row: 0,
      col: 6,
      startRow: 0,
      startCol: 6,
      targetStack: [],
      collected: [],
    },
    {
      id: 3,
      name: '탐험가 3',
      color: PIECE_COLORS[2],
      row: 6,
      col: 6,
      startRow: 6,
      startCol: 6,
      targetStack: [],
      collected: [],
    },
    {
      id: 4,
      name: '탐험가 4',
      color: PIECE_COLORS[3],
      row: 6,
      col: 0,
      startRow: 6,
      startCol: 0,
      targetStack: [],
      collected: [],
    },
  ]);

  const [inputName, setInputName] = useState('');
  const [cardsPerPlayer, setCardsPerPlayer] = useState<number>(4);

  const [board, setBoard] = useState<BoardTile[][]>([]);
  const [spareTile, setSpareTile] = useState<BoardTile | null>(null);
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<'SHIFT' | 'MOVE'>('SHIFT');
  const [forbiddenArrowId, setForbiddenArrowId] = useState<string | null>(null);
  const [lastPushedArrowId, setLastPushedArrowId] = useState<string | null>(null);
  const [shiftAnim, setShiftAnim] = useState<ShiftAnimState | null>(null);
  const [winner, setWinner] = useState<LabyrinthPlayer | null>(null);

  const [toast, setToast] = useState<{
    id: number;
    text: string;
    type: 'info' | 'treasure' | 'bonus' | 'celebrate';
  } | null>(null);

  const isAnimatingRef = useRef(false);

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
      utterance.rate = 1.12;
      utterance.pitch = 1.08;
      window.speechSynthesis.speak(utterance);
    }
  };

  const playSound = (kind: 'rotate' | 'shift' | 'step' | 'treasure' | 'win') => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
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
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.065);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.065 + 0.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + idx * 0.065);
        osc.stop(ctx.currentTime + idx * 0.065 + 0.2);
      });
    } catch {}
  };

  const addPlayer = () => {
    if (!inputName.trim()) return;
    if (players.length >= 4) {
      showToast('어메이징 라비린스는 최대 4명까지 참가할 수 있습니다.', 'info');
      return;
    }
    const idx = players.length;
    const corner = START_CORNERS[idx];
    setPlayers([
      ...players,
      {
        id: Date.now() + Math.random(),
        name: inputName.trim(),
        color: PIECE_COLORS[idx % PIECE_COLORS.length],
        row: corner.row,
        col: corner.col,
        startRow: corner.row,
        startCol: corner.col,
        targetStack: [],
        collected: [],
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
    const totalNeeded = players.length * cardsPerPlayer;
    const shuffledItems = [...TREASURE_ITEMS].sort(() => Math.random() - 0.5);
    const selectedPool = shuffledItems.slice(0, totalNeeded);

    const { board: initialBoard, spare } = createInitialBoard(selectedPool);

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
      };
    });

    setBoard(initialBoard);
    setSpareTile(spare);
    setPlayers(initializedPlayers);
    setCurrentPlayerIdx(0);
    setTurnPhase('SHIFT');
    setForbiddenArrowId(null);
    setLastPushedArrowId(null);
    setShiftAnim(null);
    setWinner(null);
    isAnimatingRef.current = false;
    setGameState('PLAYING');

    const firstTarget = initializedPlayers[0].targetStack[0];
    showToast(
      `🧭 ${initializedPlayers[0].name}님 차례! [${firstTarget.emoji} ${firstTarget.name}] 보물을 찾으세요!`,
      'info'
    );
  };

  const rotateSpareTile = (delta: number) => {
    if (!spareTile || turnPhase !== 'SHIFT' || isAnimatingRef.current) return;
    playSound('rotate');
    setSpareTile({
      ...spareTile,
      rotation: (spareTile.rotation + delta + 4) % 4,
    });
  };

  // 화살표 클릭 시 쭉~ 밀리는 슬라이드 애니메이션 후 보드 갱신
  const handlePushTile = async (arrow: PushArrow) => {
    if (
      gameState !== 'PLAYING' ||
      turnPhase !== 'SHIFT' ||
      !spareTile ||
      isAnimatingRef.current
    ) {
      return;
    }

    if (arrow.id === forbiddenArrowId) {
      showToast('🚫 방금 상대가 밀어낸 반대 방향으로는 바로 되밀 수 없습니다!', 'info');
      return;
    }

    isAnimatingRef.current = true;
    playSound('shift');

    // 슬라이드 애니메이션 시작
    setShiftAnim({
      dir: arrow.dir,
      index: arrow.index,
      incomingTile: spareTile,
    });

    await new Promise((r) => setTimeout(r, 420));

    const nextBoard = board.map((row) => [...row]);
    let pushedOutTile: BoardTile;

    if (arrow.dir === 'DOWN') {
      const c = arrow.index;
      pushedOutTile = nextBoard[6][c];
      for (let r = 6; r > 0; r--) nextBoard[r][c] = nextBoard[r - 1][c];
      nextBoard[0][c] = spareTile;
    } else if (arrow.dir === 'UP') {
      const c = arrow.index;
      pushedOutTile = nextBoard[0][c];
      for (let r = 0; r < 6; r++) nextBoard[r][c] = nextBoard[r + 1][c];
      nextBoard[6][c] = spareTile;
    } else if (arrow.dir === 'RIGHT') {
      const r = arrow.index;
      pushedOutTile = nextBoard[r][6];
      for (let c = 6; c > 0; c--) nextBoard[r][c] = nextBoard[r][c - 1];
      nextBoard[r][0] = spareTile;
    } else {
      const r = arrow.index;
      pushedOutTile = nextBoard[r][0];
      for (let c = 0; c < 6; c++) nextBoard[r][c] = nextBoard[r][c + 1];
      nextBoard[r][6] = spareTile;
    }

    const updatedPlayers = players.map((p) => {
      let { row, col } = p;
      if (arrow.dir === 'DOWN' && col === arrow.index) {
        row = row === 6 ? 0 : row + 1;
      } else if (arrow.dir === 'UP' && col === arrow.index) {
        row = row === 0 ? 6 : row - 1;
      } else if (arrow.dir === 'RIGHT' && row === arrow.index) {
        col = col === 6 ? 0 : col + 1;
      } else if (arrow.dir === 'LEFT' && row === arrow.index) {
        col = col === 0 ? 6 : col - 1;
      }
      return { ...p, row, col };
    });

    setBoard(nextBoard);
    setSpareTile(pushedOutTile);
    setPlayers(updatedPlayers);
    setShiftAnim(null);
    setForbiddenArrowId(arrow.oppositeId);
    setLastPushedArrowId(arrow.id);
    setTurnPhase('MOVE');
    isAnimatingRef.current = false;

    const cheer = SHIFT_CHEERS[Math.floor(Math.random() * SHIFT_CHEERS.length)];
    speakKorean(cheer);
    showToast(`✨ ${cheer} 초록색 길을 눌러 이동하세요!`, 'bonus');
  };

  const advanceTurn = (nextPlayers: LabyrinthPlayer[]) => {
    const nextIdx = (currentPlayerIdx + 1) % nextPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    setTurnPhase('SHIFT');
    const nextPlayer = nextPlayers[nextIdx];
    const nextGoal = nextPlayer.targetStack[0];
    if (nextGoal) {
      showToast(
        `👉 다음 차례: ${nextPlayer.name}님! 목표 보물 [${nextGoal.emoji} ${nextGoal.name}]`,
        'info'
      );
    } else {
      showToast(
        `👉 다음 차례: ${nextPlayer.name}님! 모든 보물을 모았으니 출발지(🏠)로 돌아가세요!`,
        'bonus'
      );
    }
  };

  const handleSelectMoveTarget = async (targetRow: number, targetCol: number) => {
    if (gameState !== 'PLAYING' || turnPhase !== 'MOVE' || isAnimatingRef.current) return;

    const currentPlayer = players[currentPlayerIdx];
    const reachableMap = findReachablePaths(board, currentPlayer.row, currentPlayer.col);
    const path = reachableMap.get(`${targetRow},${targetCol}`);

    if (!path) {
      showToast('🚧 길이 끊어져 있어 이동할 수 없는 칸입니다!', 'info');
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

    const landedTile = board[targetRow][targetCol];
    const currentTargetTreasure = currentPlayer.targetStack[0];
    let foundTreasure = false;
    let isGameWon = false;

    const updatedPlayers = players.map((p, idx) => {
      if (idx !== currentPlayerIdx) return p;

      let nextStack = [...p.targetStack];
      let nextCollected = [...p.collected];

      if (
        currentTargetTreasure &&
        landedTile.treasure &&
        landedTile.treasure.id === currentTargetTreasure.id
      ) {
        foundTreasure = true;
        nextCollected.push(currentTargetTreasure);
        nextStack.shift();
      }

      if (
        nextStack.length === 0 &&
        targetRow === p.startRow &&
        targetCol === p.startCol
      ) {
        isGameWon = true;
      }

      return {
        ...p,
        row: targetRow,
        col: targetCol,
        targetStack: nextStack,
        collected: nextCollected,
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
      speakKorean(`축하합니다! ${champ.name}님이 모든 보물을 찾고 우승했습니다!`);
      return;
    }

    if (foundTreasure && currentTargetTreasure) {
      playSound('treasure');
      speakKorean(`판타스틱! ${currentTargetTreasure.name} 보물을 찾았습니다!`);
      const remainingCount = updatedPlayers[currentPlayerIdx].targetStack.length;
      if (remainingCount === 0) {
        showToast(
          `🎉 [${currentTargetTreasure.emoji} ${currentTargetTreasure.name}] 획득! 이제 출발지(🏠)로 돌아가면 우승!`,
          'treasure'
        );
      } else {
        showToast(
          `💎 [${currentTargetTreasure.emoji} ${currentTargetTreasure.name}] 보물 획득! (남은 보물: ${remainingCount}개)`,
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

  // 고대 미로 석판 질감과 그림이 적용된 타일 그래픽 렌더링
  const renderTileGraphic = (tile: BoardTile, isSpare = false) => {
    const [top, right, bottom, left] = getOpenDirections(tile.shape, tile.rotation);
    const currentPlayer = players[currentPlayerIdx];
    const currentGoal = currentPlayer?.targetStack[0];
    const isMyCurrentGoal =
      gameState === 'PLAYING' &&
      tile.treasure &&
      currentGoal &&
      tile.treasure.id === currentGoal.id;

    return (
      <div
        className={`maze-tile ${tile.fixed ? 'fixed-tile' : 'movable-tile'} ${
          isSpare ? 'spare-preview-tile' : ''
        }`}
      >
        <svg viewBox="0 0 100 100" className="tile-path-svg">
          <defs>
            <linearGradient id={`stonePath-${tile.uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fef3c7" />
              <stop offset="50%" stopColor="#fde68a" />
              <stop offset="100%" stopColor="#fcd34d" />
            </linearGradient>
          </defs>

          {/* 고대 벽면 장식 (이끼 & 석조 블록 라인) */}
          <rect x="4" y="4" width="24" height="24" rx="4" fill="rgba(15, 23, 42, 0.35)" />
          <rect x="72" y="4" width="24" height="24" rx="4" fill="rgba(15, 23, 42, 0.35)" />
          <rect x="4" y="72" width="24" height="24" rx="4" fill="rgba(15, 23, 42, 0.35)" />
          <rect x="72" y="72" width="24" height="24" rx="4" fill="rgba(15, 23, 42, 0.35)" />
          <circle cx="14" cy="14" r="3" fill="rgba(52, 211, 153, 0.35)" />
          <circle cx="86" cy="86" r="3.5" fill="rgba(52, 211, 153, 0.3)" />

          {/* 황금 사암 통로 바닥 */}
          <rect
            x="30"
            y="30"
            width="40"
            height="40"
            rx="6"
            fill={`url(#stonePath-${tile.uid})`}
          />
          {top && <rect x="30" y="0" width="40" height="50" fill={`url(#stonePath-${tile.uid})`} />}
          {bottom && (
            <rect x="30" y="50" width="40" height="50" fill={`url(#stonePath-${tile.uid})`} />
          )}
          {left && <rect x="0" y="30" width="50" height="40" fill={`url(#stonePath-${tile.uid})`} />}
          {right && (
            <rect x="50" y="30" width="50" height="40" fill={`url(#stonePath-${tile.uid})`} />
          )}

          {/* 바닥 돌판 타일 줄눈 무늬 */}
          <line x1="36" y1="50" x2="64" y2="50" stroke="rgba(180, 83, 9, 0.22)" strokeWidth="1.5" />
          <line x1="50" y1="36" x2="50" y2="64" stroke="rgba(180, 83, 9, 0.22)" strokeWidth="1.5" />

          {/* 통로 입체 테두리 벽선 */}
          {top && (
            <>
              <line x1="30" y1="0" x2="30" y2="30" stroke="#92400e" strokeWidth="3" />
              <line x1="70" y1="0" x2="70" y2="30" stroke="#92400e" strokeWidth="3" />
            </>
          )}
          {bottom && (
            <>
              <line x1="30" y1="70" x2="30" y2="100" stroke="#92400e" strokeWidth="3" />
              <line x1="70" y1="70" x2="70" y2="100" stroke="#92400e" strokeWidth="3" />
            </>
          )}
          {left && (
            <>
              <line x1="0" y1="30" x2="30" y2="30" stroke="#92400e" strokeWidth="3" />
              <line x1="0" y1="70" x2="30" y2="70" stroke="#92400e" strokeWidth="3" />
            </>
          )}
          {right && (
            <>
              <line x1="70" y1="30" x2="100" y2="30" stroke="#92400e" strokeWidth="3" />
              <line x1="70" y1="70" x2="100" y2="70" stroke="#92400e" strokeWidth="3" />
            </>
          )}
        </svg>

        {/* 고정 타일 황동 리벳 */}
        {tile.fixed && <span className="fixed-rivet" title="고정 석판" />}

        {/* 플레이어 시작 모서리(집) 표시 */}
        {tile.startCornerOf !== undefined && players[tile.startCornerOf] && (
          <div
            className="corner-home-badge"
            style={{
              backgroundColor: players[tile.startCornerOf].color,
            }}
            title={`${players[tile.startCornerOf].name}의 출발/복귀 지점`}
          >
            🏠
          </div>
        )}

        {/* 선명하고 커다란 보물 그림 아이콘 (단어 텍스트 제거) */}
        {tile.treasure && (
          <div
            className={`treasure-token ${isMyCurrentGoal ? 'active-goal-token' : ''}`}
            title={tile.treasure.name}
          >
            <span className="treasure-emoji">{tile.treasure.emoji}</span>
          </div>
        )}
      </div>
    );
  };

  const currentPlayer = players[currentPlayerIdx];
  const currentTarget = currentPlayer?.targetStack[0] || null;

  const reachableCells =
    gameState === 'PLAYING' && turnPhase === 'MOVE' && currentPlayer && board.length > 0
      ? findReachablePaths(board, currentPlayer.row, currentPlayer.col)
      : new Map<string, { r: number; c: number }[]>();

  const currentBackground =
    gameState === 'PLAYING' && players.length > 0
      ? PLAYER_BG_COLORS[currentPlayerIdx % PLAYER_BG_COLORS.length]
      : PLAYER_BG_COLORS[0];

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

  // 밀기 애니메이션 중 각 칸의 슬라이드 클래스 계산
  const getCellSlideClass = (r: number, c: number): string => {
    if (!shiftAnim) return '';
    if (shiftAnim.dir === 'DOWN' && c === shiftAnim.index) return 'slide-anim-down';
    if (shiftAnim.dir === 'UP' && c === shiftAnim.index) return 'slide-anim-up';
    if (shiftAnim.dir === 'RIGHT' && r === shiftAnim.index) return 'slide-anim-right';
    if (shiftAnim.dir === 'LEFT' && r === shiftAnim.index) return 'slide-anim-left';
    return '';
  };

  return (
    <div className="lab-container" style={{ background: currentBackground }}>
      {toast && gameState === 'PLAYING' && (
        <div key={toast.id} className={`lab-toast ${toast.type}`}>
          {toast.text}
        </div>
      )}

      {/* 1. 게임 설정 화면 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">🧭 어메이징 라비린스 보물찾기</h1>

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
            <label className="setting-label">👥 탐험가 등록 (2~4명)</label>
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
                    />
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
            <strong>📜 게임 방법:</strong>
            <ul>
              <li>1단계(길 밀기): 왼쪽 모서리의 여분 타일을 회전시킨 뒤 화살표로 미로 길을 밉니다.</li>
              <li>2단계(이동): 연결된 길을 따라 자신의 목표 보물 칸으로 이동합니다.</li>
              <li>보물을 모두 모은 뒤 자신의 시작 모서리(🏠)로 가장 먼저 돌아오면 우승!</li>
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

      {/* 2. 순서 정하기 화면 */}
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
                  />
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
              🚀 미로 탐험 시작! (1인당 {cardsPerPlayer}개)
            </button>
          </div>
        </div>
      )}

      {/* 3. 원스크린 태블릿 라비린스 플레이 화면 */}
      {gameState === 'PLAYING' && currentPlayer && spareTile && (
        <div className="play-wrapper compact-tablet-screen">
          {/* 상단 슬림 플레이어 현황 바 */}
          <div className="game-header compact-header">
            <div className="rule-badge">💎 목표 {cardsPerPlayer}개</div>

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
                      <span className="squircle-dot" style={{ backgroundColor: p.color }} />
                      <strong>{p.name}</strong>
                      <span className="badge-score">
                        ({p.collected.length}/{cardsPerPlayer})
                      </span>
                      {isActive && <span className="turn-tag">차례</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary btn-compact-setup"
              onClick={() => setGameState('SETUP')}
            >
              ⚙️ 설정
            </button>
          </div>

          {/* 메인 가로 2단 레이아웃: [좌측 보드 + 좌상단 모서리 여분타일] / [우측 컴팩트 보물 패널] */}
          <div className="labyrinth-main-layout">
            {/* 좌측 보드 영역 */}
            <div className="board-corner-dock-wrapper">
              {/* 게임판 좌상단 모서리에 떠 있는 컴팩트 타일 회전 컨트롤 (스크롤 불필요) */}
              <div
                className={`corner-spare-dock ${turnPhase === 'SHIFT' ? 'active-shift' : ''}`}
                title="클릭하여 여분 타일 회전"
              >
                <div className="corner-dock-label">다음 길</div>
                <div
                  className="corner-spare-tile-box"
                  onClick={() => rotateSpareTile(1)}
                >
                  {renderTileGraphic(spareTile, true)}
                </div>
                <div className="corner-rotate-btns">
                  <button
                    type="button"
                    disabled={turnPhase !== 'SHIFT'}
                    onClick={() => rotateSpareTile(-1)}
                    title="왼쪽으로 90도 회전"
                  >
                    ↺
                  </button>
                  <button
                    type="button"
                    disabled={turnPhase !== 'SHIFT'}
                    onClick={() => rotateSpareTile(1)}
                    title="오른쪽으로 90도 회전"
                  >
                    ↻
                  </button>
                </div>
              </div>

              {/* 7x7 고대 석조 미로 보드 + 외곽 화살표 */}
              <div className="maze-board-outer">
                <div className="maze-ancient-border-glow" />

                {/* 상단 화살표 행 */}
                <div className="arrow-row-horizontal">
                  <div className="arrow-spacer corner-emblem">✦</div>
                  {Array.from({ length: 7 }).map((_, c) => {
                    const arrow = topArrows.find((a) => a.index === c);
                    if (!arrow) return <div key={`top-empty-${c}`} className="arrow-cell empty" />;
                    const disabled =
                      turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId;
                    return (
                      <button
                        key={arrow.id}
                        type="button"
                        disabled={disabled}
                        className={`push-arrow-btn ${
                          lastPushedArrowId === arrow.id ? 'last-pushed' : ''
                        }`}
                        onClick={() => handlePushTile(arrow)}
                        title={`${c + 1}열 아래로 밀기`}
                      >
                        ▼
                      </button>
                    );
                  })}
                  <div className="arrow-spacer corner-emblem">✦</div>
                </div>

                {/* 중단: 좌측 화살표 + 7x7 보드 그리드 + 우측 화살표 */}
                <div className="maze-middle-band">
                  <div className="arrow-col-vertical">
                    {Array.from({ length: 7 }).map((_, r) => {
                      const arrow = leftArrows.find((a) => a.index === r);
                      if (!arrow) return <div key={`left-empty-${r}`} className="arrow-cell empty" />;
                      const disabled =
                        turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId;
                      return (
                        <button
                          key={arrow.id}
                          type="button"
                          disabled={disabled}
                          className={`push-arrow-btn ${
                            lastPushedArrowId === arrow.id ? 'last-pushed' : ''
                          }`}
                          onClick={() => handlePushTile(arrow)}
                          title={`${r + 1}행 오른쪽으로 밀기`}
                        >
                          ▶
                        </button>
                      );
                    })}
                  </div>

                  {/* 7x7 미로 타일 격자 */}
                  <div className="maze-grid-7x7">
                    {board.map((rowArr, r) =>
                      rowArr.map((tile, c) => {
                        const cellKey = `${r},${c}`;
                        const isReachable =
                          turnPhase === 'MOVE' && reachableCells.has(cellKey);
                        const isCurrentPos =
                          currentPlayer.row === r && currentPlayer.col === c;
                        const piecesHere = players.filter(
                          (p) => p.row === r && p.col === c
                        );
                        const slideClass = getCellSlideClass(r, c);

                        return (
                          <div
                            key={tile.uid}
                            className={`maze-cell-slot ${
                              isReachable ? 'reachable-cell' : ''
                            } ${isCurrentPos ? 'current-player-cell' : ''} ${slideClass}`}
                            onClick={() => {
                              if (turnPhase === 'MOVE') {
                                handleSelectMoveTarget(r, c);
                              }
                            }}
                          >
                            {renderTileGraphic(tile)}

                            {/* 둥근 네모(Squircle) 모양 탐험가 말 */}
                            {piecesHere.length > 0 && (
                              <div className="cell-pieces-cluster">
                                {piecesHere.map((p, pIdx) => (
                                  <div
                                    key={p.id}
                                    className={`explorer-squircle-pawn ${
                                      p.id === currentPlayer.id ? 'active-pawn' : ''
                                    }`}
                                    style={{
                                      backgroundColor: p.color,
                                      transform:
                                        piecesHere.length > 1
                                          ? `translate(${(pIdx % 2) * 8 - 4}px, ${
                                              Math.floor(pIdx / 2) * 8 - 4
                                            }px)`
                                          : 'none',
                                    }}
                                    title={p.name}
                                  >
                                    <span>{p.name.slice(0, 1)}</span>
                                  </div>
                                ))}
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
                        turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId;
                      return (
                        <button
                          key={arrow.id}
                          type="button"
                          disabled={disabled}
                          className={`push-arrow-btn ${
                            lastPushedArrowId === arrow.id ? 'last-pushed' : ''
                          }`}
                          onClick={() => handlePushTile(arrow)}
                          title={`${r + 1}행 왼쪽으로 밀기`}
                        >
                          ◀
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 하단 화살표 행 */}
                <div className="arrow-row-horizontal">
                  <div className="arrow-spacer corner-emblem">✦</div>
                  {Array.from({ length: 7 }).map((_, c) => {
                    const arrow = bottomArrows.find((a) => a.index === c);
                    if (!arrow) return <div key={`bot-empty-${c}`} className="arrow-cell empty" />;
                    const disabled =
                      turnPhase !== 'SHIFT' || arrow.id === forbiddenArrowId;
                    return (
                      <button
                        key={arrow.id}
                        type="button"
                        disabled={disabled}
                        className={`push-arrow-btn ${
                          lastPushedArrowId === arrow.id ? 'last-pushed' : ''
                        }`}
                        onClick={() => handlePushTile(arrow)}
                        title={`${c + 1}열 위로 밀기`}
                      >
                        ▲
                      </button>
                    );
                  })}
                  <div className="arrow-spacer corner-emblem">✦</div>
                </div>
              </div>
            </div>

            {/* 우측: 컴팩트 목표 보물 & 진행 안내 패널 */}
            <div className="control-side-panel">
              <div
                className="turn-status-card"
                style={{ borderTop: `6px solid ${currentPlayer.color}` }}
              >
                <div className="step-pill">
                  {turnPhase === 'SHIFT'
                    ? '1단계: 왼쪽 상단 타일 회전 후 화살표 밀기'
                    : '2단계: 초록색 길 칸을 눌러 말 이동'}
                </div>
                <h2 className="current-player-title">{currentPlayer.name}님 차례</h2>

                {/* 현재 찾아야 할 보물 카드 (그림 중심) */}
                <div className="target-treasure-card">
                  <div className="target-card-label">🎯 이번에 찾을 보물</div>
                  {currentTarget ? (
                    <>
                      <div className="target-card-emoji">{currentTarget.emoji}</div>
                      <div className="target-card-name">{currentTarget.name}</div>
                    </>
                  ) : (
                    <div className="return-home-notice">
                      <div style={{ fontSize: '34px' }}>🏠</div>
                      <strong>보물 수집 완료!</strong>
                      <p>내 시작 모서리(🏠)로 돌아가면 우승!</p>
                    </div>
                  )}
                </div>

                {/* 단계별 안내 메시지 */}
                <div className="guide-box-compact">
                  {turnPhase === 'SHIFT' ? (
                    <p>
                      좌상단 <strong>[다음 길]</strong> 타일을 눌러 회전시킨 뒤, 보드 테두리의
                      화살표(<strong>▼ ▲ ▶ ◀</strong>)를 눌러 길을 쭉 밀어주세요!
                    </p>
                  ) : (
                    <p>
                      초록색으로 빛나는 길 중 원하는 칸을 터치하세요! (제자리를 누르면 턴을
                      마칩니다)
                    </p>
                  )}
                </div>

                {/* 획득한 보물 목록 */}
                <div className="collected-words-box">
                  <div className="collected-title">
                    🏆 모은 보물 ({currentPlayer.collected.length}/{cardsPerPlayer})
                  </div>
                  <div className="collected-chips">
                    {currentPlayer.collected.length === 0 ? (
                      <span className="empty-collected">아직 모은 보물이 없습니다.</span>
                    ) : (
                      currentPlayer.collected.map((item) => (
                        <span key={item.id} className="word-badge-chip">
                          {item.emoji} {item.name}
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

      {/* 4. 최종 우승 축하 모달 */}
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
            <div className="congrats-banner">✨ CONGRATULATIONS! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟
            </h2>
            <p className="modal-subtext">
              보물 {cardsPerPlayer}개를 모두 찾고 가장 먼저 미로를 탈출했습니다!
            </p>

            <div className="rank-list">
              {players.map((p) => {
                const isChamp = p.id === winner.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="squircle-dot" style={{ backgroundColor: p.color }} />
                      {isChamp ? '🥇 ' : ''}
                      {p.name}
                    </span>
                    <span>
                      보물: {p.collected.length} / {cardsPerPlayer}개
                    </span>
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
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