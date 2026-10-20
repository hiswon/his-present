import React, { useState, useEffect } from 'react';
import './Page3.css';

const images = import.meta.glob<{ default: string }>('./images2/*.{png,jpg,jpeg,webp}', { eager: true });
const imageSrcs = Object.values(images).map((img) => img.default);

interface SlideData {
  id: number;
  subTitle: string;
  mainTitle: string;
  highlightText: string;
  bibleVerse: string;
}

interface ScrollData {
  sTitle: string;
  content: string;
  mainTitle: string;
  highlightText: string;
  bibleVerse: string;
}

const Page3: React.FC = () => {
  const [activeCardIndex, setActiveCardIndex] = useState<number>(0);

  const slideA: ScrollData[] = [
    {
      sTitle: "Moving Church",
      content: "무빙처치 1",
      mainTitle: "하나님은 당신을 사랑하십니다.",
      highlightText: "너는 도우시는 이가 누구인가",
      bibleVerse: "요한복음 3장 16절",
    },
    {
      sTitle: "Moving Church",
      content: "무빙처치 2",
      mainTitle: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니",
      highlightText: "평안을 너희에게 끼치노라",
      bibleVerse: "시편 121편 1-2절",
    },
    {
      sTitle: "Moving Church",
      content: "무빙처치 3",
      mainTitle: "무빙처치 3번 컨텐츠",
      highlightText: "새 계명을 너희에게 주노니",
      bibleVerse: "요한복음 14장 27절",
    },
    {
      sTitle: "Moving Church",
      content: "무빙처치 4",
      mainTitle: "무빙처치 4번 컨텐츠",
      highlightText: "믿음의 주요 온전케 하시는 이인",
      bibleVerse: "히브리서 12장 2절",
    },
    {
      sTitle: "Moving Church",
      content: "무빙처치 5",
      mainTitle: "무빙처치 5번 컨텐츠",
      highlightText: "두려워하지 말라 내가 너와 함께 함이라",
      bibleVerse: "이사야 41장 10절",
    },
  ];
  
  const slides: SlideData[] = [
    {
      id: 2,
      subTitle: "Moving Church",
      mainTitle: "두 번째 일반 슬라이드 화면입니다.",
      highlightText: "함께 하시는 주님",
      bibleVerse: "로마서 8장 28절",
    },
    {
      id: 3,
      subTitle: "Moving Church",
      mainTitle: "세 번째 일반 슬라이드 화면입니다.",
      highlightText: "소망을 주시는 하나님",
      bibleVerse: "로마서 15장 13절",
    },
  ];

  // 키보드 좌우 화살표 이벤트 처리
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 첫 번째 화면(또는 전체 화면)에서 포커스가 있을 때 좌우 화살표 감지
      if (e.key === 'ArrowRight') {
        setActiveCardIndex((prev) => (prev + 1) % slideA.length); // 다음 카드로 (끝에서 다시 처음으로)
      } else if (e.key === 'ArrowLeft') {
        setActiveCardIndex((prev) => (prev - 1 + slideA.length) % slideA.length); // 이전 카드로 (처음에서 끝으로)
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [slideA.length]);

  const currentData = slideA[activeCardIndex] || slideA[0];
  const currentImage = imageSrcs.length > 0 ? imageSrcs[activeCardIndex % imageSrcs.length] : '';

  return (
    <div className="screen-container-A">
      <div className="slider-boxes">
        
        <div className="pictext-container">
          <div className="first-screen-content">
            
            {/* 상단 메인 카드 영역 */}
            <div className="main-display-card fade-in" key={activeCardIndex}>
              <div className="box-pic-A">
                <img src={currentImage} alt="Selected Preview" className="intoPic" />
              </div>
              <div className="box-text-A">
                <span className="sub-title">{currentData.sTitle}</span>
                <h1 className="main-title">{currentData.mainTitle}</h1>
                <h2 className="highlight-text">{currentData.highlightText}</h2>
                <p className="bible-verse">{currentData.bibleVerse}</p>
              </div>
            </div>

            {/* 하단 가로 스크롤 카드 목록 */}
            <div className="picscroll-container">
              <div className="carousel-wrapper">
                <ul className='carousel'>
                  {slideA.map((item, index) => {
                    const bgImage = imageSrcs.length > 0 ? imageSrcs[index % imageSrcs.length] : '';
                    const isSelected = activeCardIndex === index;
                    return (
                      <li 
                        className={`product-card ${isSelected ? 'active' : ''}`} 
                        key={index}
                        onClick={() => setActiveCardIndex(index)}
                      >
                        <img src={bgImage} alt={item.sTitle} />
                        <div className='info'>
                          <h3>{item.sTitle}</h3>
                          <p>{item.content}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

          </div>
        </div>

        {/* 나머지 슬라이드 화면들 */}
        {slides.map((slide, index) => {
          const bgImage = imageSrcs.length > 0 ? imageSrcs[(index + slideA.length) % imageSrcs.length] : '';
          return (
            <div className="pictext-container" key={slide.id}>
              <div className="box-pic-A">
                <img src={bgImage} alt={`Slide ${index + 1}`} className="intoPic" />
              </div>
              <div className="box-text-A">
                <span className="sub-title">{slide.subTitle}</span>
                <h1 className="main-title">{slide.mainTitle}</h1>
                <h2 className="highlight-text">{slide.highlightText}</h2>
                <p className="bible-verse">{slide.bibleVerse}</p>
              </div>
            </div>
          );
        })}

      </div>
    </div>
  );
};

export default Page3;