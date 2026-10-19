import React, { useState, useRef, useEffect } from 'react';
import './Page4.css';

// 1. 번들러를 통한 이미지 임포트 (상수)
const images = import.meta.glob<{ default: string }>('./images2/*.{png,jpg,jpeg,webp}', { eager: true });
const imageSrcs = Object.values(images).map((img) => img.default);

// 2. 타입 정의 및 외부 상수 데이터 선언
interface SlideData {
  id: number;
  subTitle: string;
  mainTitle: string;
  highlightText: string;
  bibleVerse: string;
  imageFlex?: number;
}

const BIBLE_STRUCTURE_DATA = {
  header: { text: '하나님은 당신을 사랑하십니다. - 예수님 믿고 천국가세요' },
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
    {
      number: '06',
      korean: '임마누엘',
      english: 'GOD LOVES YOU',
      books: 'Hosea, Joel, Amos, Obadiah, Jonah, Micah, Nahum, Habakkuk, Zephaniah, Haggai, Zechariah, Malachi',
      markerType: 'hollow-circle',
    },
  ],
};

const SLIDES_DATA: SlideData[] = [
  {
    id: 1,
    subTitle: 'Moving Church',
    mainTitle: '무빙처치',
    highlightText: '하나님은 당신을 사랑하십니다.',
    bibleVerse: '요한복음 3장 16절',
  },
  {
    id: 2,
    subTitle: 'Moving Church',
    mainTitle: '하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라',
    highlightText: '너는 도우시는 이가 누구인가',
    bibleVerse: '시편 121편 1-2절',
    imageFlex: 1,
  },
  {
    id: 3,
    subTitle: 'Moving Church',
    mainTitle: '무빙처치 3',
    highlightText: '평안을 너희에게 끼치노라',
    bibleVerse: '요한복음 14장 27절',
  },
];

const Page4: React.FC = () => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 마우스 드래그 스크롤 관련 상태
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false); // 실제 드래그 이동 여부 (클릭 방지용)
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // 화면 중앙에 위치한 타임라인 아이템 감지
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const observerOptions = {
      root: container,
      rootMargin: '0px -40% 0px -40%',
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

  // 마우스 드래그 핸들러
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    setHasMoved(false);
    setStartX(e.pageX - scrollRef.current.offsetLeft);
    setScrollLeft(scrollRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;

    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX) * 1.5;

    // 5px 이상 이동 시 실제 드래그로 판단하여 클릭 이벤트 동작을 방지
    if (Math.abs(x - startX) > 5) {
      setHasMoved(true);
      e.preventDefault();
      scrollRef.current.scrollLeft = scrollLeft - walk;
    }
  };

  // 아이템 클릭 핸들러 (드래그 시 클릭 무시)
  const handleStepClick = (index: number) => {
    if (hasMoved) return; // 드래그 동작 중이었다면 클릭 무시
    setSelectedIndex(index);
  };

  // 현재 선택/스크롤 위치에 따른 이미지 경로
  const activeImageIndex = selectedIndex !== null ? selectedIndex : 0;
  //const currentBgImage = imageSrcs.length > 0 ? imageSrcs[activeImageIndex % imageSrcs.length] : '';

  return (
    <div className="screen-container-A">
      <div className="slider-boxes">
        {/* 성경 구조 타임라인 카드 */}
        <div className="pictexts-container">
          <div className="bible-structure-container grid-background">
            
            {/* 좌측 고정 동적 이미지 패널 (그라데이션 Overlap) */}
            <div className="left-image-panel">
              {imageSrcs.map((imgUrl, idx) => (
                <img
                  key={idx}
                  src={imgUrl}
                  alt={`Section ${idx + 1}`}
                  className={`dynamic-bg-img ${idx === (activeImageIndex % imageSrcs.length) ? 'active' : ''}`}
                />
              ))}
              <div className="left-image-overlay" />
            </div>

            <header className="page-header">
              <p>{BIBLE_STRUCTURE_DATA.header.text}</p>
            </header>

            <main className="timeline-section">
              <div className="title-area">
                <h1 className="main-title">{BIBLE_STRUCTURE_DATA.title}</h1>
                <h2 className="main-subtitle">{BIBLE_STRUCTURE_DATA.subtitle}</h2>
              </div>

              {/* 가로 스크롤 영역 */}
              <div
                className="scrollable-wrapper"
                ref={scrollRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
              >
                <div className={`horizontal-timeline ${selectedIndex !== null ? 'has-selection' : ''}`}>
                  {BIBLE_STRUCTURE_DATA.sections.map((section, index) => {
                    const isSelected = selectedIndex === index;
                    return (
                      <div
                        key={section.number}
                        data-index={index}
                        className={`timeline-step ${isSelected ? 'selected' : ''}`}
                        onClick={() => handleStepClick(index)}
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
              <p>Tip: 내용을 마우스로 잡고 옆으로 밀어보세요. 중앙에 오거나 클릭한 요소에 맞춰 좌측 그림이 변경됩니다.</p>
            </footer>
          </div>
        </div>

        {/* 슬라이드 이미지 & 텍스트 세트 */}
        {SLIDES_DATA.map((slide, index) => {
          const bgImage = imageSrcs.length > 0 ? imageSrcs[index % imageSrcs.length] : '';
          return (
            <div className={`pictexts-container ${index === 0 ? 'slide-A' : ''}`} key={slide.id}>
              <div className="box-pic-A">
                <img
                  src={bgImage}
                  alt={`Slide ${index + 1}`}
                  className="intoPic"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
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

export default Page4;