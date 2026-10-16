import React, { useState, useRef,useEffect } from 'react';
import './Page4.css';


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
const bibleStructureData = {
  header: { text: 'SVG Animations Could Look Like This - No Library, No GIF, Just Code' },
  title: 'BIBLE OVERVIEW: THE OLD TESTAMENT (OT)',
  subtitle: 'Five Major Sections of the OT (Click to focus, Drag to scroll)',
  sections: [
    {
      number: '01',
      korean: '율법서',
      english: 'THE LAW',
      books: 'Genesis, Exodus, Leviticus, Numbers, Deuteronomy',
      markerType: 'solid-circle',
    },
    {
      number: '02',
      korean: '역사서',
      english: 'HISTORY',
      books: 'Joshua, Judges, Ruth, 1&2 Samuel, 1&2 Kings, 1&2 Chronicles, Ezra, Nehemiah, Esther',
      markerType: 'hollow-circle',
    },
    {
      number: '03',
      korean: '시가서',
      english: 'POETRY & WISDOM',
      books: 'Job, Psalms, Proverbs, Ecclesiastes, Song of Songs',
      markerType: 'hollow-circle',
    },
    {
      number: '04',
      korean: '예언서 (대선지서)',
      english: 'MAJOR PROPHETS',
      books: 'Isaiah, Jeremiah, Lamentations, Ezekiel, Daniel',
      markerType: 'hollow-circle',
    },
    {
      number: '05',
      korean: '예언서 (소선지서)',
      english: 'MINOR PROPHETS',
      books: 'Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi',
      markerType: 'hollow-circle',
    },
  ],
};

const Page4: React.FC = () => {
  
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

  // 선택된 항목의 인덱스 관리 (null이면 선택 안 됨)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // 마우스 드래그로 가로 스크롤을 구현하기 위한 상태
  const scrollRef = useRef<HTMLDivElement>(null);

  //
  // [핵심] 화면 중앙에 위치한 아이템을 감지하는 Observer 설정
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    // 감지 영역을 화면 중앙 부근으로 좁게 설정
    const observerOptions = {
      root: container,
      rootMargin: '0px -40% 0px -40%', // 좌우 40%씩 잘라내어 정중앙에 올 때만 감지
      threshold: 0.5,
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const indexAttr = entry.target.getAttribute('data-index');
          if (indexAttr !== null) {
            setSelectedIndex(Number(indexAttr));
          }
        }
      });
    }, observerOptions);

    const steps = container.querySelectorAll('.timeline-step');
    steps.forEach((step) => observer.observe(step));

    return () => observer.disconnect();
  }, []);
  //

  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    if (scrollRef.current) {
      setStartX(e.pageX - scrollRef.current.offsetLeft);
      setScrollLeft(scrollRef.current.scrollLeft);
    }
  };

  const handleMouseLeave = () => setIsDragging(false);
  const handleMouseUp = () => setIsDragging(false);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5; // 스크롤 속도 조절
    scrollRef.current.scrollLeft = scrollLeft - walk;
  };

  const handleStepClick = (index: number) => {
    // 이미 선택된 것을 다시 누르면 선택 해제, 아니면 해당 항목 선택
    setSelectedIndex(selectedIndex === index ? null : index);
  };

  return (
    <div className="screen-container-A">
      <div className="slider-boxes">
        <div className="pictexts-container">

          <div className="bible-structure-container grid-background">
            <header className="page-header">
              <p>{bibleStructureData.header.text}</p>
            </header>

            <main className="timeline-section">
              <div className="title-area">
                <h1 className="main-title">{bibleStructureData.title}</h1>
                <h2 className="main-subtitle">{bibleStructureData.subtitle}</h2>
              </div>

              {/* 가로 스크롤 영역 (스크롤바 숨김 처리됨, 마우스로 잡고 밀기 가능) */}
              <div 
                className="scrollable-wrapper"
                ref={scrollRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeave}
                onMouseUp={handleMouseUp}
                onMouseMove={handleMouseMove}
              >
                {/* 하단에 has-selection 클래스를 동적으로 붙여서 선택되지 않은 항목들을 어둡게 만듦 */}
                <div className={`horizontal-timeline ${selectedIndex !== null ? 'has-selection' : ''}`}>
                  {bibleStructureData.sections.map((section, index) => {
                    const isSelected = selectedIndex === index;
                    return (
                      <div 
                        key={section.number} 
                        data-index={index} // Observer가 읽을 수 있도록 인덱스 속성 부여
                        className={`timeline-step ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleStepClick(index)}
                        //onClick={() => setSelectedIndex(index)}
                      >
                        <div className="label-area">
                          <span className="step-number">{section.number}</span>
                        </div>
                        
                        <div className={`step-marker ${section.markerType}`}>
                          {section.markerType === 'solid-circle' && <div className="solid-fill" />}
                        </div>
                        
                        <div className="info-area">
                          <p className="korean-name">{section.korean}</p>
                          <p className="english-name">{section.english}</p>
                          <p className="books-list">{section.books}</p>
                        </div>

                        {index === 0 && selectedIndex === null && (
                          <div className="you-are-here">
                            <span className="label">You are here</span>
                            <span className="dot" />
                            
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="connecting-line" />
                </div>
              </div>
            </main>

            <footer className="page-footer">
              <p>Tip: 내용을 마우스로 잡고 옆으로 밀어보세요. 요소를 클릭하면 확대되고 나머지가 어두워집니다.</p>
            </footer>
          </div>

        </div>
        
        {slides.map((slide, index) => {
          const bgImage = imageSrcs.length > 0 ? imageSrcs[index % imageSrcs.length] : '';
          return (
            <div className={`pictexts-container ${index===0 ? 'slide-A' : ''}`} key={slide.id}>
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

export default Page4;
