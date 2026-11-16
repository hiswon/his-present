import { useState, useRef } from 'react';
import './Page10.css';

// 방향: [상(Top), 우(Right), 하(Bottom), 좌(Left)]
type Directions = [boolean, boolean, boolean, boolean];
type TileShape = 'I' | 'L' | 'T';

interface TreasureItem {
  id: string;
  word: string;
  meaning: string;
  emoji: string;
}

interface BoardTile {
  uid: string;
  shape: TileShape;
  rotation: number; // 0, 1, 2, 3 (x 90deg)
  fixed: boolean;
  treasure?: TreasureItem;
  startCornerOf?: number; // 0, 1, 2, 3 (플레이어 시작 모서리)
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

const PLAYER_BG_COLORS = [
  'linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 50%, #faf5ff 100%)',
  'linear-gradient(135deg, #fce7f3 0%, #fae8ff 50%, #fef3c7 100%)',
  'linear-gradient(135deg, #dcfce7 0%, #f0fdf4 50%, #e0f2fe 100%)',
  'linear-gradient(135deg, #ffedd5 0%, #fff7ed 50%, #fef2f2 100%)',
];

const PIECE_COLORS = ['#ef4444', '#2563eb', '#10b981', '#f59e0b'];
const CONFETTI_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'];

const TREASURE_WORDS: TreasureItem[] = [
  { id: 't1', word: 'APPLE', meaning: '사과', emoji: '🍎' },
  { id: 't2', word: 'BOOK', meaning: '책', emoji: '📚' },
  { id: 't3', word: 'CASTLE', meaning: '성', emoji: '🏰' },
  { id: 't4', word: 'DRAGON', meaning: '용', emoji: '🐉' },
  { id: 't5', word: 'EARTH', meaning: '지구', emoji: '🌍' },
  { id: 't6', word: 'FOREST', meaning: '숲', emoji: '🌲' },
  { id: 't7', word: 'GHOST', meaning: '유령', emoji: '👻' },
  { id: 't8', word: 'HEART', meaning: '마음/심장', emoji: '❤️' },
  { id: 't9', word: 'ISLAND', meaning: '섬', emoji: '🏝️' },
  { id: 't10', word: 'JEWEL', meaning: '보석', emoji: '💎' },
  { id: 't11', word: 'KEY', meaning: '열쇠', emoji: '🔑' },
  { id: 't12', word: 'LION', meaning: '사자', emoji: '🦁' },
  { id: 't13', word: 'MOON', meaning: '달', emoji: '🌙' },
  { id: 't14', word: 'NIGHT', meaning: '밤', emoji: '🌃' },
  { id: 't15', word: 'OCEAN', meaning: '바다', emoji: '🌊' },
  { id: 't16', word: 'PLANET', meaning: '행성', emoji: '🪐' },
  { id: 't17', word: 'QUEEN', meaning: '여왕', emoji: '👑' },
  { id: 't18', word: 'ROBOT', meaning: '로봇', emoji: '🤖' },
  { id: 't19', word: 'STAR', meaning: '별', emoji: '⭐' },
  { id: 't20', word: 'TIGER', meaning: '호랑이', emoji: '🐯' },
  { id: 't21', word: 'UNICORN', meaning: '유니콘', emoji: '🦄' },
  { id: 't22', word: 'VOLCANO', meaning: '화산', emoji: '🌋' },
  { id: 't23', word: 'WHALE', meaning: '고래', emoji: '🐋' },
  { id: 't24', word: 'WIZARD', meaning: '마법사', emoji: '🧙' },
];

const START_CORNERS = [
  { row: 0, col: 0, rotation: 1 }, // 좌상단: 우, 하 연결
  { row: 0, col: 6, rotation: 2 }, // 우상단: 하, 좌 연결
  { row: 6, col: 6, rotation: 3 }, // 우하단: 상, 좌 연결
  { row: 6, col: 0, rotation: 0 }, // 좌하단: 상, 우 연결
];

// 기본 회전(0) 기준 통로 방향: [상, 우, 하, 좌]
function getOpenDirections(shape: TileShape, rotation: number): Directions {
  let base: Directions;
  if (shape === 'I') {
    base = [true, false, true, false]; // 상-하 직선
  } else if (shape === 'L') {
    base = [true, true, false, false]; // 상-우 코너
  } else {
    base = [false, true, true, true]; // 우-하-좌 T자 갈림길
  }
  const r = ((rotation % 4) + 4) % 4;
  const rotated: Directions = [false, false, false, false];
  for (let i = 0; i < 4; i++) {
    rotated[(i + r) % 4] = base[i];
  }
  return rotated;
}

// BFS로 현재 위치에서 길로 연결된 도달 가능 타일 및 최단 경로 탐색
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
    { dr: -1, dc: 0, dirIdx: 0, oppIdx: 2 }, // 상
    { dr: 0, dc: 1, dirIdx: 1, oppIdx: 3 },  // 우
    { dr: 1, dc: 0, dirIdx: 2, oppIdx: 0 },  // 하
    { dr: 0, dc: -1, dirIdx: 3, oppIdx: 1 }, // 좌
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

// 초기 7x7 미로 보드 + 여분 타일 1개 생성 (총 50개 타일)
function createInitialBoard(treasurePool: TreasureItem[]): {
  board: BoardTile[][];
  spare: BoardTile;
} {
  // 고정 T자 타일들의 기본 방향 설정
  const fixedTConfigs: { r: number; c: number; rot: number }[] = [
    { r: 0, c: 2, rot: 0 }, // 우-하-좌
    { r: 0, c: 4, rot: 0 },
    { r: 2, c: 0, rot: 3 }, // 상-우-하
    { r: 2, c: 2, rot: 3 },
    { r: 2, c: 4, rot: 0 },
    { r: 2, c: 6, rot: 1 }, // 상-하-좌
    { r: 4, c: 0, rot: 3 },
    { r: 4, c: 2, rot: 2 }, // 상-우-좌
    { r: 4, c: 4, rot: 1 },
    { r: 4, c: 6, rot: 1 },
    { r: 6, c: 2, rot: 2 },
    { r: 6, c: 4, rot: 2 },
  ];

  // 이동 가능한 34개 타일 (직선 12, 코너 16, T자 6)
  const movableShapes: TileShape[] = [
    ...Array(12).fill('I'),
    ...Array(16).fill('L'),
    ...Array(6).fill('T'),
  ];

  // 보물을 배치할 수 있는 후보 좌표 (4개 시작 모서리 제외 45칸)
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

  const speakText = (text: string, lang: 'ko-KR' | 'en-US' = 'ko-KR') => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      utterance.rate = 1.05;
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
        shift: [293.66, 369.99],
        step: [523.25],
        treasure: [523.25, 659.25, 783.99, 1046.5],
        win: [523.25, 659.25, 783.99, 1046.5, 1318.5],
      };
      notesMap[kind].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + idx * 0.07);
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
    const shuffledWords = [...TREASURE_WORDS].sort(() => Math.random() - 0.5);
    const selectedPool = shuffledWords.slice(0, totalNeeded);

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
    setWinner(null);
    isAnimatingRef.current = false;
    setGameState('PLAYING');

    const firstTarget = initializedPlayers[0].targetStack[0];
    showToast(
      `🧭 ${initializedPlayers[0].name}님 차례! 여분 타일을 밀어 [${firstTarget.word}] 길을 여세요.`,
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

  // 화살표 클릭 시 여분 타일을 밀어 넣고 반대편 타일 추출 + 말 워프 처리
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
      showToast('🚫 방금 상대가 밀어낸 반대 방향으로는 바로 되밀 수 없습니다!', 'info');
      return;
    }

    playSound('shift');
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

    // 밀려난 행/열 위에 있는 모든 플레이어 말 위치 동기화 (끝에서 밀려나면 반대편 입구로 워프)
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
    setForbiddenArrowId(arrow.oppositeId);
    setLastPushedArrowId(arrow.id);
    setTurnPhase('MOVE');
    showToast('✨ 길이 연결되었습니다! 초록색으로 빛나는 길 중 원하는 칸을 선택하세요.', 'info');
  };

  const advanceTurn = (nextPlayers: LabyrinthPlayer[]) => {
    const nextIdx = (currentPlayerIdx + 1) % nextPlayers.length;
    setCurrentPlayerIdx(nextIdx);
    setTurnPhase('SHIFT');
    const nextPlayer = nextPlayers[nextIdx];
    const nextGoal = nextPlayer.targetStack[0];
    if (nextGoal) {
      showToast(
        `👉 다음 차례: ${nextPlayer.name}님! 목표 단어 [${nextGoal.word} (${nextGoal.meaning})]`,
        'info'
      );
    } else {
      showToast(
        `👉 다음 차례: ${nextPlayer.name}님! 모든 보물을 모았으니 출발 모서리로 복귀하세요!`,
        'bonus'
      );
    }
  };

  // 연결된 길 타일 클릭 시 한 칸씩 애니메이션 이동
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
      await new Promise((r) => setTimeout(r, 170));
    }

    const landedTile = board[targetRow][targetCol];
    const currentTargetWord = currentPlayer.targetStack[0];
    let foundTreasure = false;
    let isGameWon = false;

    const updatedPlayers = players.map((p, idx) => {
      if (idx !== currentPlayerIdx) return p;

      let nextStack = [...p.targetStack];
      let nextCollected = [...p.collected];

      if (
        currentTargetWord &&
        landedTile.treasure &&
        landedTile.treasure.id === currentTargetWord.id
      ) {
        foundTreasure = true;
        nextCollected.push(currentTargetWord);
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

    // 획득한 보물은 보드에서 제거
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
      speakText(`축하합니다! ${champ.name}님이 모든 영어단어 보물을 찾고 우승했습니다!`, 'ko-KR');
      return;
    }

    if (foundTreasure && currentTargetWord) {
      playSound('treasure');
      speakText(`${currentTargetWord.word}! ${currentTargetWord.meaning}`, 'en-US');
      const remainingCount = updatedPlayers[currentPlayerIdx].targetStack.length;
      if (remainingCount === 0) {
        showToast(
          `🎉 [${currentTargetWord.word} · ${currentTargetWord.meaning}] 획득! 이제 출발 모서리로 돌아가면 우승합니다!`,
          'treasure'
        );
      } else {
        showToast(
          `💎 [${currentTargetWord.word} · ${currentTargetWord.meaning}] 보물 획득! (남은 단어: ${remainingCount}개)`,
          'treasure'
        );
      }
      window.setTimeout(() => advanceTurn(updatedPlayers), 1200);
    } else {
      showToast('👣 이동 완료!', 'celebrate');
      window.setTimeout(() => advanceTurn(updatedPlayers), 500);
    }
  };

  // 타일 내부 길 그래픽 렌더링
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
          {/* 돌벽 배경 */}
          <rect x="0" y="0" width="100" height="100" fill="transparent" />
          {/* 중앙 교차점 */}
          <rect x="33" y="33" width="34" height="34" rx="6" fill="#fef3c7" />
          {/* 상·하·좌·우 연결 통로 */}
          {top && <rect x="33" y="0" width="34" height="50" fill="#fef3c7" />}
          {bottom && <rect x="33" y="50" width="34" height="50" fill="#fef3c7" />}
          {left && <rect x="0" y="33" width="50" height="34" fill="#fef3c7" />}
          {right && <rect x="50" y="33" width="50" height="34" fill="#fef3c7" />}

          {/* 통로 테두리 가이드선 */}
          {top && (
            <>
              <line x1="33" y1="0" x2="33" y2="33" stroke="#d97706" strokeWidth="2.5" />
              <line x1="67" y1="0" x2="67" y2="33" stroke="#d97706" strokeWidth="2.5" />
            </>
          )}
          {bottom && (
            <>
              <line x1="33" y1="67" x2="33" y2="100" stroke="#d97706" strokeWidth="2.5" />
              <line x1="67" y1="67" x2="67" y2="100" stroke="#d97706" strokeWidth="2.5" />
            </>
          )}
          {left && (
            <>
              <line x1="0" y1="33" x2="33" y2="33" stroke="#d97706" strokeWidth="2.5" />
              <line x1="0" y1="67" x2="33" y2="67" stroke="#d97706" strokeWidth="2.5" />
            </>
          )}
          {right && (
            <>
              <line x1="67" y1="33" x2="100" y2="33" stroke="#d97706" strokeWidth="2.5" />
              <line x1="67" y1="67" x2="100" y2="67" stroke="#d97706" strokeWidth="2.5" />
            </>
          )}
        </svg>

        {/* 고정 타일 리벳 표시 */}
        {tile.fixed && <span className="fixed-rivet" title="고정 타일" />}

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

        {/* 영어단어 보물 토큰 */}
        {tile.treasure && (
          <div className={`treasure-token ${isMyCurrentGoal ? 'active-goal-token' : ''}`}>
            <span className="treasure-emoji">{tile.treasure.emoji}</span>
            <span className="treasure-word-tag">{tile.treasure.word}</span>
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

  // 12개의 외곽 밀기 화살표 정의 (짝수 index 1, 3, 5)
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
          <h1 className="setup-title">🧭 어메이징 라비린스 (영어단어 보물찾기)</h1>

          <div className="setting-section">
            <label className="setting-label">🃏 1인당 찾을 영어단어 보물 개수</label>
            <div className="piece-count-selector">
              {[3, 4, 5, 6].map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`count-btn ${cardsPerPlayer === num ? 'active' : ''}`}
                  onClick={() => setCardsPerPlayer(num)}
                >
                  {num}단어
                </button>
              ))}
            </div>
          </div>

          <div className="setting-section">
            <label className="setting-label">👥 탐험가 등록 (2~4명 권장)</label>
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
                      className="color-dot"
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
              <li>1단계(길 밀기): 여분 타일을 회전시킨 뒤 외곽 화살표를 눌러 미로 길을 바꿉니다.</li>
              <li>2단계(이동): 연결된 길을 따라 자신의 목표 영어단어 보물 칸으로 이동합니다.</li>
              <li>모든 영어단어를 모은 뒤 자신의 시작 모서리(🏠)로 가장 먼저 복귀하면 우승!</li>
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
                    className="color-dot"
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
              🚀 미로 탐험 시작! (1인당 {cardsPerPlayer}단어)
            </button>
          </div>
        </div>
      )}

      {/* 3. 메인 라비린스 플레이 화면 */}
      {gameState === 'PLAYING' && currentPlayer && spareTile && (
        <div className="play-wrapper">
          {/* 상단 플레이어 현황 바 */}
          <div className="game-header">
            <div className="rule-badge">🧭 1인당 {cardsPerPlayer}단어 찾기</div>

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
                      <span className="color-dot" style={{ backgroundColor: p.color }} />
                      <strong>{p.name}</strong>
                      {isActive && <span className="turn-tag">차례</span>}
                    </div>
                    <div className="player-badge-sub">
                      보물: {p.collected.length} / {cardsPerPlayer}개
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ padding: '8px 12px', fontSize: '13px' }}
              onClick={() => setGameState('SETUP')}
            >
              ⚙️ 설정
            </button>
          </div>

          <div className="labyrinth-main-layout">
            {/* 좌측: 7x7 미로 보드 + 외곽 밀기 화살표 */}
            <div className="maze-board-outer">
              {/* 상단 화살표 행 */}
              <div className="arrow-row-horizontal">
                <div className="arrow-spacer" />
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
                <div className="arrow-spacer" />
              </div>

              {/* 중단: 좌측 화살표 + 7x7 보드 그리드 + 우측 화살표 */}
              <div className="maze-middle-band">
                {/* 좌측 화살표 열 */}
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

                      return (
                        <div
                          key={tile.uid}
                          className={`maze-cell-slot ${
                            isReachable ? 'reachable-cell' : ''
                          } ${isCurrentPos ? 'current-player-cell' : ''}`}
                          onClick={() => {
                            if (turnPhase === 'MOVE') {
                              handleSelectMoveTarget(r, c);
                            }
                          }}
                        >
                          {renderTileGraphic(tile)}

                          {/* 해당 칸에 서 있는 플레이어 말들 */}
                          {piecesHere.length > 0 && (
                            <div className="cell-pieces-cluster">
                              {piecesHere.map((p, pIdx) => (
                                <div
                                  key={p.id}
                                  className={`explorer-pawn ${
                                    p.id === currentPlayer.id ? 'active-pawn' : ''
                                  }`}
                                  style={{
                                    backgroundColor: p.color,
                                    transform: `translate(${(pIdx % 2) * 6 - 3}px, ${
                                      Math.floor(pIdx / 2) * 6 - 3
                                    }px)`,
                                  }}
                                  title={p.name}
                                >
                                  {p.name.slice(0, 1)}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 우측 화살표 열 */}
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
                <div className="arrow-spacer" />
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
                <div className="arrow-spacer" />
              </div>
            </div>

            {/* 우측: 현재 턴 컨트롤 & 영어단어 보물 카드 패널 */}
            <div className="control-side-panel">
              <div
                className="turn-status-card"
                style={{ borderTop: `6px solid ${currentPlayer.color}` }}
              >
                <div className="step-pill">
                  {turnPhase === 'SHIFT'
                    ? '1단계: 여분 타일로 길 밀기'
                    : '2단계: 연결된 길로 말 이동하기'}
                </div>
                <h2 className="current-player-title">{currentPlayer.name}님 차례</h2>

                {/* 현재 찾아야 할 영어단어 보물 카드 */}
                <div className="target-word-card">
                  <div className="target-card-label">🎯 현재 목표 영어단어 보물</div>
                  {currentTarget ? (
                    <>
                      <div className="target-card-emoji">{currentTarget.emoji}</div>
                      <div className="target-card-word">{currentTarget.word}</div>
                      <div className="target-card-meaning">{currentTarget.meaning}</div>
                      <button
                        type="button"
                        className="btn-pronounce"
                        onClick={() => speakText(currentTarget.word, 'en-US')}
                      >
                        🔊 발음 듣기
                      </button>
                    </>
                  ) : (
                    <div className="return-home-notice">
                      <div style={{ fontSize: '36px' }}>🏠</div>
                      <strong>모든 보물 수집 완료!</strong>
                      <p>자신의 시작 모서리(🏠)로 돌아가면 승리합니다!</p>
                    </div>
                  )}
                </div>

                {/* 여분 타일 회전 및 안내 */}
                <div className="spare-tile-box">
                  <div className="spare-box-title">🧩 밀어 넣을 여분 타일</div>
                  <div
                    className="spare-tile-stage"
                    onClick={() => rotateSpareTile(1)}
                    title="클릭하여 90° 회전"
                  >
                    {renderTileGraphic(spareTile, true)}
                  </div>
                  <div className="rotate-btn-row">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={turnPhase !== 'SHIFT'}
                      onClick={() => rotateSpareTile(-1)}
                    >
                      ↺ 왼쪽 회전
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={turnPhase !== 'SHIFT'}
                      onClick={() => rotateSpareTile(1)}
                    >
                      ↻ 오른쪽 회전
                    </button>
                  </div>
                  <p className="phase-guide-hint">
                    {turnPhase === 'SHIFT'
                      ? '타일을 원하는 방향으로 회전한 뒤 보드 외곽의 화살표(▼▲▶◀)를 눌러 길을 밀어주세요.'
                      : '초록색으로 빛나는 연결된 칸 중 이동할 위치를 터치하세요. (제자리 클릭 시 턴 종료)'}
                  </p>
                </div>

                {/* 획득한 영어단어 목록 */}
                <div className="collected-words-box">
                  <div className="collected-title">
                    🏆 획득한 영어단어 ({currentPlayer.collected.length}/{cardsPerPlayer})
                  </div>
                  <div className="collected-chips">
                    {currentPlayer.collected.length === 0 ? (
                      <span className="empty-collected">아직 획득한 단어가 없습니다.</span>
                    ) : (
                      currentPlayer.collected.map((item) => (
                        <span key={item.id} className="word-badge-chip">
                          {item.emoji} {item.word}
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
              영어단어 보물 {cardsPerPlayer}개를 모두 찾고 무사히 미로를 탈출했습니다!
            </p>

            <div className="rank-list">
              {players.map((p) => {
                const isChamp = p.id === winner.id;
                return (
                  <div key={p.id} className={`rank-item ${isChamp ? 'winner' : ''}`}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="color-dot" style={{ backgroundColor: p.color }} />
                      {isChamp ? '🥇 ' : ''}
                      {p.name}
                    </span>
                    <span>
                      획득 단어: {p.collected.length} / {cardsPerPlayer}개
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