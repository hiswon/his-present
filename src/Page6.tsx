import React, { useState, useEffect } from 'react';
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
}

const INITIAL_WORDS: WordPair[] = [
  { id: 1, en: 'Apple', kr: '사과', emoji: '🍎' },
  { id: 2, en: 'Cat', kr: '고양이', emoji: '🐱' },
  { id: 3, en: 'Dog', kr: '개', emoji: '🐶' },
  { id: 4, en: 'Sun', kr: '해', emoji: '☀️' },
  { id: 5, en: 'Book', kr: '책', emoji: '📖' },
  { id: 6, en: 'Tree', kr: '나무', emoji: '🌳' },
  { id: 7, en: 'Water', kr: '물', emoji: '💧' },
  { id: 8, en: 'Car', kr: '자동차', emoji: '🚗' },
  { id: 9, en: 'Fish', kr: '물고기', emoji: '🐟' },
  { id: 10, en: 'Bird', kr: '새', emoji: '🐦' },
  { id: 11, en: 'Flower', kr: '꽃', emoji: '🌸' },
  { id: 12, en: 'House', kr: '집', emoji: '🏠' },
  { id: 13, en: 'School', kr: '학교', emoji: '🏫' },
  { id: 14, en: 'Star', kr: '별', emoji: '⭐' },
  { id: 15, en: 'Moon', kr: '달', emoji: '🌙' },
  { id: 16, en: 'Milk', kr: '우유', emoji: '🥛' },
  { id: 17, en: 'Pencil', kr: '연필', emoji: '✏️' },
  { id: 18, en: 'Music', kr: '음악', emoji: '🎵' },
  { id: 19, en: 'Smile', kr: '미소', emoji: '😊' },
  { id: 20, en: 'Friend', kr: '친구', emoji: '🤝' },
];

export default function Page6() {
  const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'GAME_OVER'>('SETUP');
  const [players, setPlayers] = useState<Player[]>([]);
  const [inputName, setInputName] = useState('');
  const [currentPlayerIdx, setCurrentPlayerIdx] = useState(0);

  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedCards, setFlippedCards] = useState<number[]>([]);
  const [matchedIds, setMatchedIds] = useState<number[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // 참가자 추가
  const addPlayer = () => {
    if (!inputName.trim()) return;
    setPlayers([...players, { id: Date.now(), name: inputName.trim(), score: 0 }]);
    setInputName('');
  };

  // 참가자 삭제
  const removePlayer = (id: number) => {
    setPlayers(players.filter(p => p.id !== id));
  };

  // 게임 시작
  const startGame = () => {
    if (players.length === 0) return;

    const pairedCards: CardItem[] = [];
    INITIAL_WORDS.forEach((word) => {
      pairedCards.push({ ...word, uniqueId: Math.random() });
      pairedCards.push({ ...word, uniqueId: Math.random() });
    });

    const shuffled = pairedCards.sort(() => Math.random() - 0.5);
    setCards(shuffled);
    setMatchedIds([]);
    setFlippedCards([]);
    setCurrentPlayerIdx(0);
    setPlayers(players.map(p => ({ ...p, score: 0 })));
    setGameState('PLAYING');
  };

  // 영어 발음 재생
  const speakText = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // 카드 클릭
  const handleCardClick = (index: number) => {
    if (
      isProcessing || 
      flippedCards.includes(index) || 
      matchedIds.includes(cards[index].id)
    ) {
      return;
    }

    const nextFlipped = [...flippedCards, index];
    setFlippedCards(nextFlipped);

    if (nextFlipped.length === 2) {
      setIsProcessing(true);
      const [firstIdx, secondIdx] = nextFlipped;
      const card1 = cards[firstIdx];
      const card2 = cards[secondIdx];

      if (card1.id === card2.id) {
        setTimeout(() => {
          setMatchedIds(prev => [...prev, card1.id]);
          setPlayers(prev => prev.map((p, idx) => 
            idx === currentPlayerIdx ? { ...p, score: p.score + 1 } : p
          ));
          setFlippedCards([]);
          setIsProcessing(false);
        }, 800);
      } else {
        setTimeout(() => {
          setFlippedCards([]);
          setCurrentPlayerIdx(prev => (prev + 1) % players.length);
          setIsProcessing(false);
        }, 1200);
      }
    }
  };

  // 게임 종료 판정
  useEffect(() => {
    if (gameState === 'PLAYING' && matchedIds.length === INITIAL_WORDS.length) {
      setGameState('GAME_OVER');
    }
  }, [matchedIds, gameState]);

  return (
    <div className="game-container">
      {/* 1. 참가자 등록 */}
      {gameState === 'SETUP' && (
        <div className="setup-card">
          <h1 className="setup-title">🎴 초등 영단어 짝맞추기</h1>
          
          <div className="input-group">
            <input
              type="text"
              className="player-input"
              placeholder="참가자 이름 입력"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
            />
            <button className="btn btn-primary" onClick={addPlayer}>➕ 추가</button>
          </div>

          <div className="player-list">
            {players.map((player) => (
              <div key={player.id} className="player-item">
                <span>👤 {player.name}</span>
                <button className="btn-delete" onClick={() => removePlayer(player.id)}>🗑️</button>
              </div>
            ))}
          </div>

          <button 
            className="btn btn-success" 
            disabled={players.length === 0}
            onClick={startGame}
          >
            ▶️ 게임 시작 ({players.length}명)
          </button>
        </div>
      )}

      {/* 2. 게임 진행 */}
      {gameState === 'PLAYING' && (
        <>
          <div className="game-header">
            <h2>🎯 짝을 맞춰보세요!</h2>
            <div className="score-board">
              {players.map((p, idx) => (
                <div 
                  key={p.id} 
                  className={`score-card ${idx === currentPlayerIdx ? 'active' : ''}`}
                >
                  <div className="score-name">
                    {idx === currentPlayerIdx ? '👉 ' : ''}{p.name}
                  </div>
                  <div className="score-val">{p.score}점</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setGameState('SETUP')}>
              🔄 다시 설정
            </button>
          </div>

          <div className="grid-container">
            {cards.map((card, index) => {
              const isFlipped = flippedCards.includes(index);
              const isMatched = matchedIds.includes(card.id);

              return (
                <div
                  key={index}
                  className={`card ${isFlipped ? 'flipped' : ''} ${isMatched ? 'matched' : ''}`}
                  onClick={() => handleCardClick(index)}
                >
                  <div className="card-face card-back">
                    <div className="card-back-pattern">❓</div>
                  </div>

                  <div className="card-face card-front">
                    <button 
                      className="tts-btn" 
                      onClick={(e) => speakText(e, card.en)} 
                      title="발음 듣기"
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

      {/* 3. 승리 결과 모달 */}
      {gameState === 'GAME_OVER' && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-trophy">🏆</div>
            <h2>게임 종료!</h2>
            <p className="modal-subtext">모든 짝을 찾았습니다!</p>

            <div className="rank-list">
              {[...players].sort((a, b) => b.score - a.score).map((p, rank) => (
                <div 
                  key={p.id}
                  className={`rank-item ${rank === 0 ? 'winner' : ''}`}
                >
                  <span>{rank === 0 ? '🥇 ' : `${rank + 1}위 `} {p.name}</span>
                  <span>{p.score}점</span>
                </div>
              ))}
            </div>

            <button className="btn btn-success" onClick={startGame}>
              🔄 다시 하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}