import React from 'react';
import './Page1.css';

const images = import.meta.glob<{ default: string }>('./images/*.{png,jpg,jpeg,webp}', { eager: true });
const imageSrcs = Object.values(images).map((img) => img.default);

interface SlideData {
  id: number;
  subTitle: string;
  mainTitle: string;
  highlightText: string;
  bibleVerse: string;
}


const Page1: React.FC = () => {

   const slides: SlideData[] = [
    {
      id: 1,
      subTitle: "Moving Church",
      mainTitle: "무빙처치",
      highlightText: "하나님은 당신을 정말 사랑하십니다.",
      bibleVerse: "요한복음 3장 16절",
    },
    {
      id: 2,
      subTitle: "Moving Church",
      mainTitle: "하나님은 당신을 사랑하십니다.",
      highlightText: "너는 도우시는 이가 누구인가",
      bibleVerse: "시편 121편 1-2절",
    },
    {
      id: 3,
      subTitle: "Moving Church",
      mainTitle: "무빙처치 3",
      highlightText: "평안을 너희에게 끼치노라",
      bibleVerse: "요한복음 14장 27절",
    },
  ];

  return (
    <div className="background-container">
      <div className="slides-wrapper">
        
        {/* 전체 스크롤 영역을 관통하는 SVG 히스토리 라인 경로 */}
        <svg className="history-svg-line" preserveAspectRatio="none" viewBox="0 0 100 300">
          <defs>
            {/* 첫 번째 스트로크용 그라데이션 */}
            <linearGradient id="line-gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#db726036" />
              <stop offset="30%" stopColor="#c3cc4146" />
              <stop offset="70%" stopColor="#50c7a94d" />
              <stop offset="100%" stopColor="#5ddb7d34" />
            </linearGradient>

          </defs>
          <path 
            className="animated-path" 
            d="M 50 0 
               C 50 40, 30 50, 50 75 
               C 70 100, 30 120, 50 150 
               C 70 180, 30 200, 50 225
               C 70 250, 50 270, 50 300" 
          />
        </svg>

        {slides.map((slide, index) => {
          const bgImage = imageSrcs.length > 0 ? imageSrcs[index % imageSrcs.length] : '';
          return (
            <div className={`content-box ${index===0 ? 'first-slide' : ''}`} key={slide.id}>
              <div className="img-item">
                <img 
                  src={bgImage} 
                  alt={`Slide ${index + 1}`} 
                  className="img-wrapper"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              
              {/* 우측 텍스트 그룹 */}
              <div className="text-group">
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

export default Page1;
