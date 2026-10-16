import React from 'react';
import './Page3.css';


const images = import.meta.glob<{ default: string }>('./images2/*.{png,jpg,jpeg,webp}', { eager: true });
const imageSrcs = Object.values(images).map((img) => img.default);

interface SlideData {
  id: number;
  subTitle: string;
  mainTitle: string;
  highlightText: string;
  bibleVerse: string;
  imageFlex?: number;
}

const Page3: React.FC = () => {

  
   const slides: SlideData[] = [
    {
      id: 1,
      subTitle: "Moving Church",
      mainTitle: "무빙처치",
      highlightText: "하나님은 당신을 사랑하십니다.",
      bibleVerse: "요한복음 3장 16절",
      
    },
    {
      id: 2,
      subTitle: "Moving Church",
      mainTitle: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
      highlightText: "너는 도우시는 이가 누구인가",
      bibleVerse: "시편 121편 1-2절",
      imageFlex: 1,
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
    <div className="screen-container-A">
      <div className="slider-boxes">
        {slides.map((slide, index) => {
          const bgImage = imageSrcs.length > 0 ? imageSrcs[index % imageSrcs.length] : '';
          return (
            <div className={`pictext-container ${index===0 ? 'slide-A' : ''}`} key={slide.id}>
              <div className="box-pic-A" >
                <img 
                  src={bgImage} 
                  alt={`Slide ${index + 1}`} 
                  className="intoPic"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              </div>
              
              {/* 우측 텍스트 그룹 */}
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
