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
  stoneVariant: number;
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
  index: number;
  oppositeId: string;
}

interface ShiftingState {
  arrow: PushArrow;
  enteringTile: BoardTile;
  active: boolean;
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
  '오케이! 탁원한 선택이에요!',
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
  const trimmed = name.trim();
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

export default function Page10() {
  const [gameState, setGameState] = useState<'SETUP' | 'READY' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<LabyrinthPlayer[]>([
    {
      id: 1,
      name: '사랑',
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
      name: '믿음',
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
      name: '인내',
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
      name: '소망',
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
  const [shiftingState, setShiftingState] = useState<ShiftingState | null>(null);
  const [winner, setWinner] = useState<LabyrinthPlayer | null>(null);

  // 말을 길게 꾹 눌렀을 때 말들을 투명(10%)하게 만들어 뒷길 확인하는 상태
  const [isPeekingRoad, setIsPeekingRoad] = useState<boolean>(false);
  const longPressTimerRef = useRef<number | null>(null);
  const didLongPressRef = useRef<boolean>(false);

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

  // 길게 누르기(260ms 이상 홀드) 시작/종료 핸들러
  const startLongPressPeek = () => {
    didLongPressRef.current = false;
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
    }
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
    if (isPeekingRoad) {
      setIsPeekingRoad(false);
    }
  };

  const addPlayer = () => {
    if (!inputName.trim()) return;
    if (players.length >= 4) {
      showToast('최대 4명까지 참가할 수 있습니다.', 'info');
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
      showToast('최소 2명 이상의 탐험가를 등록해주세요!', 'info');
      return;
    }
    setGameState('READY');
  };

  const startGame = () => {
    const totalNeeded = players.length * cardsPerPlayer;
    const shuffledTreasures = [...TREASURE_ITEMS].sort(() => Math.random() - 0.5);
    const selectedPool = shuffledTreasures.slice(0, totalNeeded);

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
    setShiftingState(null);
    setIsPeekingRoad(false);
    setWinner(null);
    isAnimatingRef.current = false;
    setGameState('PLAYING');

    const firstTarget = initializedPlayers[0].targetStack[0];
    showToast(
      `🧭 ${initializedPlayers[0].name}님 차례! 붕붕 뜨는 화살표를 눌러 [${firstTarget.emoji} ${firstTarget.name}] 길을 여세요.`,
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
    setShiftingState({
      arrow,
      enteringTile,
      active: false,
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShiftingState({
          arrow,
          enteringTile,
          active: true,
        });
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
    const nextGoal = nextPlayer.targetStack[0];
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
    // 길게 눌러 길 모양 확인 중이었으면 이동 실행하지 않음
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

    const landedTile = board[targetRow][targetCol];
    const currentTargetTreasure = currentPlayer.targetStack[0];
    let foundTreasure = false;
    let isGameWon = false;

    const updatedPlayers = players.map((p, idx) => {
      if (idx !== currentPlayerIdx) return p;

      const nextStack = [...p.targetStack];
      const nextCollected = [...p.collected];

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
      speakKorean(`원더풀! 축하합니다! ${champ.name}님이 모든 보물을 찾고 우승했습니다!`);
      return;
    }

    if (foundTreasure && currentTargetTreasure) {
      playSound('treasure');
      const remainingCount = updatedPlayers[currentPlayerIdx].targetStack.length;
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

    if (!active) {
      return { transform: 'translate(0px, 0px)', transition: 'none', zIndex: 8 };
    }

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

    if (!active) {
      return {
        transform: `translate(${startTx}, ${startTy})`,
        transition: 'none',
      };
    }
    return {
      transform: 'translate(0%, 0%)',
      transition: 'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1)',
    };
  };

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

          {tile.stoneVariant === 0 && (
            <>
              <circle cx="14" cy="14" r="4" fill="rgba(16, 185, 129, 0.25)" />
              <circle cx="85" cy="84" r="5" fill="rgba(16, 185, 129, 0.22)" />
            </>
          )}
          {tile.stoneVariant === 1 && (
            <>
              <path
                d="M10 15 L20 15 M15 10 L15 20"
                stroke="rgba(251, 191, 36, 0.28)"
                strokeWidth="2"
              />
              <path
                d="M80 85 L90 85 M85 80 L85 90"
                stroke="rgba(251, 191, 36, 0.28)"
                strokeWidth="2"
              />
            </>
          )}
          {tile.stoneVariant === 2 && (
            <>
              <circle
                cx="85"
                cy="15"
                r="5"
                fill="none"
                stroke="rgba(148, 163, 184, 0.28)"
                strokeWidth="2"
              />
              <circle
                cx="15"
                cy="85"
                r="5"
                fill="none"
                stroke="rgba(148, 163, 184, 0.28)"
                strokeWidth="2"
              />
            </>
          )}

          <rect x="31" y="31" width="38" height="38" rx="6" fill={`url(#roadGrad-${tile.uid})`} />

          {top && <rect x="31" y="0" width="38" height="50" fill={`url(#roadGrad-${tile.uid})`} />}
          {bottom && (
            <rect x="31" y="50" width="38" height="50" fill={`url(#roadGrad-${tile.uid})`} />
          )}
          {left && <rect x="0" y="31" width="50" height="38" fill={`url(#roadGrad-${tile.uid})`} />}
          {right && (
            <rect x="50" y="31" width="50" height="38" fill={`url(#roadGrad-${tile.uid})`} />
          )}

          <circle cx="44" cy="46" r="2" fill="rgba(180, 83, 9, 0.2)" />
          <circle cx="56" cy="54" r="2.2" fill="rgba(180, 83, 9, 0.2)" />
          {top && <circle cx="50" cy="16" r="2" fill="rgba(180, 83, 9, 0.22)" />}
          {bottom && <circle cx="50" cy="84" r="2" fill="rgba(180, 83, 9, 0.22)" />}
          {left && <circle cx="16" cy="50" r="2" fill="rgba(180, 83, 9, 0.22)" />}
          {right && <circle cx="84" cy="50" r="2" fill="rgba(180, 83, 9, 0.22)" />}

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

        {tile.startCornerOf !== undefined && players[tile.startCornerOf] && (
          <div
            className="corner-home-badge"
            style={{
              backgroundColor: players[tile.startCornerOf].color,
            }}
            title={`${players[tile.startCornerOf].name}의 출발/복귀 성문`}
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

      {/* 1. 게임 설정 화면 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">🏰 어메이징 라비린스 (보물찾기)</h1>

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
            <label className="setting-label">🧭 탐험가 등록 (2~4명 · 이름 첫 두 글자가 말에 표시됩니다)</label>
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
              <li>1단계(길 밀기): 붕붕 뜨는 여분 길카드를 회전하고, 붕붕 뜨는 화살표를 눌러 길을 밉니다.</li>
              <li>2단계(이동): 붕붕 뜨는 내 말을 확인하고 초록색으로 열린 길을 터치해 이동합니다.</li>
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

      {/* 3. 메인 라비린스 플레이 화면 */}
      {gameState === 'PLAYING' && currentPlayer && spareTile && (
        <div className="play-wrapper compact-tablet-mode">
          {/* 상단 슬림 현황 바 */}
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
                        {p.collected.length}/{cardsPerPlayer}
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
            >
              ⚙️
            </button>
          </div>

          {/* 상단: 고대 미로 보드판 */}
          <div className="maze-board-outer">
            <div className="maze-ancient-crest">
              {isPeekingRoad
                ? '👁️ 뒷길 투시 중 (손을 떼면 말이 다시 보입니다)'
                : '⚜️ AMAZING LABYRINTH · 말을 꾹 누르면 뒷길 확인 ⚜️'}
            </div>

            {/* 상단 화살표 행 */}
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
                    title={`${c + 1}열 아래로 밀기`}
                  >
                    ▼
                  </button>
                );
              })}
              <div className="corner-compass">⚜️</div>
            </div>

            {/* 중단: 좌측 화살표 + 7x7 미로 격자 + 우측 화살표 */}
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
                      title={`${r + 1}행 오른쪽으로 밀기`}
                    >
                      ▶
                    </button>
                  );
                })}
              </div>

              {/* 7x7 미로 보드 */}
              <div className="maze-grid-7x7">
                {board.map((rowArr, r) =>
                  rowArr.map((tile, c) => {
                    const cellKey = `${r},${c}`;
                    const isReachable =
                      turnPhase === 'MOVE' && !shiftingState && reachableCells.has(cellKey);
                    const isCurrentPos =
                      currentPlayer.row === r && currentPlayer.col === c;
                    const piecesHere = players.filter((p) => p.row === r && p.col === c);

                    // 같은 칸에 여러 말이 있을 때: 현재 차례 말은 보통 크기(상단), 다른 말은 작게(하단 좌/중/우) 분리
                    const activePieceHere = piecesHere.find((p) => p.id === currentPlayer.id);
                    const otherPiecesHere = piecesHere.filter((p) => p.id !== currentPlayer.id);
                    const hasMultiplePieces = piecesHere.length > 1;

                    const shiftStyle = getCellShiftStyle(r, c);
                    const enteringStyle = getEnteringTileStyle(r, c);

                    return (
                      <div
                        key={tile.uid}
                        className={`maze-cell-slot ${
                          isReachable ? 'reachable-cell' : ''
                        } ${isCurrentPos ? 'current-player-cell' : ''}`}
                        onPointerDown={() => {
                          if (piecesHere.length > 0) {
                            startLongPressPeek();
                          }
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
                          {renderTileGraphic(tile)}

                          {piecesHere.length > 0 && (
                            <div
                              className={`cell-pieces-cluster ${
                                hasMultiplePieces ? 'multi-pieces' : 'single-piece'
                              } ${isPeekingRoad ? 'peeking-transparent' : ''}`}
                            >
                              {/* 현재 차례 플레이어 말 (보통 크기 유지, 이동 단계에서 붕붕 띄움) */}
                              {activePieceHere && (
                                <div
                                  className={`explorer-squircle-pawn active-turn-pawn ${
                                    hasMultiplePieces ? 'stacked-main' : ''
                                  } ${isMovePhase ? 'guide-float-pawn' : ''}`}
                                  style={{ backgroundColor: activePieceHere.color }}
                                  title={`${activePieceHere.name} (길게 눌러 뒷길 확인)`}
                                >
                                  <span className="pawn-name-tag">
                                    {getShortName(activePieceHere.name)}
                                  </span>
                                </div>
                              )}

                              {/* 다른 플레이어 말들 (겹치지 않게 작게 만들어 옆과 밑에 나란히 배치) */}
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
                                      title={`${p.name} (길게 눌러 뒷길 확인)`}
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
                            {renderTileGraphic(shiftingState.enteringTile)}
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
                    title={`${c + 1}열 위로 밀기`}
                  >
                    ▲
                  </button>
                );
              })}
              <div className="corner-compass">🧭</div>
            </div>
          </div>

          {/* 하단 도크: 좌측(밀 타이밍에 붕붕 뜨는 여분 길카드) + 우측(목표 보물 및 진행 정보) */}
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
                  title="터치하여 회전"
                >
                  {renderTileGraphic(spareTile, true)}
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
                    획득 보물 ({currentPlayer.collected.length}/{cardsPerPlayer})
                  </span>
                  <div className="dock-bag-icons">
                    {currentPlayer.collected.length === 0 ? (
                      <span className="dock-bag-empty">없음</span>
                    ) : (
                      currentPlayer.collected.map((item) => (
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
            <div className="congrats-banner">✨ WONDERFUL! CONGRATULATIONS! ✨</div>
            <h2 style={{ margin: '6px 0 8px', color: '#0f172a' }}>
              {winner.name}님 최종 우승! 🌟
            </h2>
            <p className="modal-subtext">
              보물 {cardsPerPlayer}개를 모두 찾고 무사히 미로를 탈출했습니다!
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
                      획득 보물: {p.collected.length} / {cardsPerPlayer}개
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