import React, { useState } from 'react';
import './Page5.css';

// 지정하신 방식으로 images3 폴더의 이미지들을 eager 글로빙하여 순서대로 배열 생성
const images = import.meta.glob<{ default: string }>('./images3/*.{png,jpg,jpeg,webp}', { eager: true });
const imageSrcs = Object.keys(images)
  .sort() // 파일 경로(문자열)를 기준으로 알파벳/가나다 순 정렬 수행
  .map((key) => images[key].default);

interface SlideData {
  leftScripture: string;  // 왼쪽(2/3): 성경 구절
  leftRef: string;        // 왼쪽(2/3): 성경 요절 출처
  rightText: string;      // 오른쪽(1/3): 설명 문구
  isHeaderSlide?: boolean; // 헤더 문구 포함 여부
}

// 이미지 내의 성경 구절 및 설명 데이터 구성
const slidesData: SlideData[] = [
  {
    isHeaderSlide: true,
    leftScripture: "태초에 하나님이 천지를 창조하시니라.",
    leftRef: "(창세기 1:1)",
    rightText: "지금 우리가 살고 있는 이 세계는 하나님께서 있으라 하신 대로 만드신 것입니다."
  },
  {
    leftScripture: "하나님이 자기 형상 곧 하나님의 형상대로 사람을 창조하시되, ...",
    leftRef: "(창세기 1:27)",
    rightText: "그리고 우리도 하나님의 모습에 따라 하나님께서 만드신 것입니다."
  },
  {
    leftScripture: "선악을 알게 하는 나무의 열매는 먹지 말라 네가 먹는 날에는 반드시 죽으리라.",
    leftRef: "(창세기 2:17)",
    rightText: "그런데 사람들은 하나님을 잊었고 자신의 뜻대로 살게 됩니다."
  },
  {
    leftScripture: "모든 사람이 죄를 범하였으매 하나님의 영광에 이르지 못하더니",
    leftRef: "(로마서 3:23)",
    rightText: "그리고 사람이 죄를 짓고 이 죄 때문에 영원한 불, 지옥에 갑니다."
  },
  {
    leftScripture: "한 번 죽는 것은 사람에게 정해진 것이요 그 후에는 심판이 있으리니",
    leftRef: "(히브리서 9:27)",
    rightText: "우리 스스로 이 죄의 고통에서 벗어나고자 하지만 우리는 지옥을 피할 수 없습니다. 왜냐하면 우리는 지금 죄 안에서 죄의 종으로 살고 있기 때문입니다."
  },
  {
    leftScripture: "하나님이 세상을 이처럼 사랑하사 독생자를 주셨으니 이는 그를 믿는 자마다 멸망하지 않고 영생을 얻게 하려 하심이라",
    leftRef: "(요한복음 3:16)",
    rightText: "그러나 하나님께서 자신의 아들 예수님을 이 세상에 보내셨고 예수님은 우리 모든 죄를 다 짊어지시고 죽으시고 사흘만에 부활하셨습니다."
  },
  {
    leftScripture: "그가 찔림은 우리의 허물 때문이요 그가 상함은 우리의 죄악 때문이라 그가 징계를 받음으로 우리는 평화를 누리고 그가 채찍에 맞음으로 우리는 나음을 받았도다",
    leftRef: "(이사야 53:5)",
    rightText: "예수님께서 우리의 죄를 짊어지고 죽으셨기에 우리는 예수님을 믿고 우리의 잘못을 회개하면 예수님의 이름 때문에 천국에 갈 수 있습니다."
  },
  {
    leftScripture: "네가 만일 네 입으로 예수를 주로 시인하며 또 하나님께서 그를 죽은 자 가운데서 살리신 것을 네 마음에 믿으면 구원을 받으리라",
    leftRef: "(로마서 10:9)",
    rightText: "지금 예수님을 믿으십시오. 왜냐하면 예수님께서 세상을 심판하러 오실 시간이 가깝기 때문입니다."
  },
  {
    leftScripture: "또 이르시되 민족이 민족을, 나라가 나라를 대적하여 일어나겠고 곳곳에 큰 지진과 기근과 전염병이 있겠고...",
    leftRef: "(누가복음 21:10-11)",
    rightText: "성경에 마지막 때의 현상이 예언되어 있습니다. 전쟁, 기근, 전염병, 하늘에 징조가 있다고 말합니다. '이런 일들을 보면 예수께서 곧 오실 때'라고 경고하고 있습니다."
  },
  {
    leftScripture: "일월 성신에는 징조가 있겠고 땅에서는 민족들이 바다와 파도의 성난 소리로 인하여 혼란한 중에 곤고하리라... 그 때에 사람들이 인자가 구름을 타고 능력과 큰 영광으로 오는 것을 보리라",
    leftRef: "(누가복음 21:25-27)",
    rightText: "예수님을 인류의 구원자로 마음에 믿고 지금까지의 잘못을 하나님께 고백하십시오. 우리가 믿고 회개할 수 있는 시간은 예수님께서 오시기 전까지입니다. 예수님께서 오시면 믿는 자는 천국으로, 믿지 않는 자는 지옥으로 나눠지게 될 것입니다."
  }
];

// 마지막 영접 기도문 슬라이드 데이터
const prayerData = {
  title: "예수님을 믿고 기도하고 회개하십시오!",
  subtitle: "생명의 길과 천국을 얻을 것입니다.",
  prayer: [
    "하나님 아버지!",
    "저는 지금 내 앞의 현실속에서 고통하고 있습니다.",
    "내 영혼은 세상의 근심에 메말라가고 어둠속에 놓여 있습니다.",
    "주님! 이제 저는 주님을 보기 원합니다.",
    "생명을 창조하시고 회복케하시는 하나님을 믿기 원합니다.",
    "내 죄를 사하기 위해 죽으셨고 부활하신 예수님을 믿기 원합니다.",
    "내 근심을 예수님께 맡기고 예수님의 평안과 기쁨을 누리게 해 주세요.",
    "시간의 끝에서는 구원의 예수님을 기쁨으로 맞이하게 해 주세요!",
    "나의 모든 미움과 원망과 우상숭배의 죄들을 회개합니다.",
    "지난 날의 주님 없었던 죄의 삶을 용서해 주세요.",
    "내 생명과 나의 구원되신 예수 그리스도 이름으로 기도합니다. 아멘!"
  ],
  footerText: "예수님은 지금 당신과 함께 하십니다!"
};

export const Page5: React.FC = () => {
  // 터치/클릭 터치로 활성화된 강조 항목 식별을 위한 State
  const [activeLeftIndex, setActiveLeftIndex] = useState<number | null>(null);
  const [activeRightIndex, setActiveRightIndex] = useState<number | null>(null);
  const [isPrayerActive, setIsPrayerActive] = useState<boolean>(false);

  // 왼쪽 터치 이벤트 토글
  const handleLeftClick = (index: number) => {
    setActiveLeftIndex((prev) => (prev === index ? null : index));
  };

  // 오른쪽 터치 이벤트 토글
  const handleRightClick = (index: number) => {
    setActiveRightIndex((prev) => (prev === index ? null : index));
  };

  // 기도문 터치 이벤트 토글
  const handlePrayerClick = () => {
    setIsPrayerActive((prev) => !prev);
  };

  return (
    <div className="snap-container">
      {/* 1 ~ 10번 슬라이드 */}
      {slidesData.map((slide, index) => {
        const currentImg = imageSrcs[index] || '';
        const isLeftActive = activeLeftIndex === index;
        const isRightActive = activeRightIndex === index;

        return (
          <section key={index} className="snap-section">
            <div className="slide-content">
              {/* 왼쪽 2/3 영역 */}
              <div
                className="section-left"
                style={{ backgroundImage: `url(${currentImg})` }}
              >
                <div className="overlay left-overlay">
                  {slide.isHeaderSlide && (
                    <div className="header-banner">
                      <h1>예수님 믿으세요!</h1>
                      <p className="subtitle">오늘의 믿음이 내일의 운명이 됩니다.</p>
                    </div>
                  )}
                  {/* 터치 시 글자 반투명 배경 및 확대 강조 클래스 부여 */}
                  <div 
                    className={`scripture-box ${isLeftActive ? 'active-presentation' : ''}`}
                    onClick={() => handleLeftClick(index)}
                  >
                    <p className="scripture-text">“{slide.leftScripture}”</p>
                    <p className="scripture-ref">{slide.leftRef}</p>
                  </div>
                </div>
              </div>

              {/* 오른쪽 1/3 영역 */}
              <div
                className="section-right"
                style={{ backgroundImage: `url(${currentImg})` }}
              >
                <div className="overlay right-overlay">
                  {/* 터치 시 글자 반투명 배경 및 확대 강조 클래스 부여 */}
                  <div 
                    className={`explain-box ${isRightActive ? 'active-presentation' : ''}`}
                    onClick={() => handleRightClick(index)}
                  >
                    <p className="explain-text">{slide.rightText}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      })}

      {/* 마지막 영접 기도 슬라이드 */}
      <section className="snap-section prayer-section">
        <div 
          className="prayer-container"
          style={{ backgroundImage: `url(${imageSrcs[slidesData.length] || imageSrcs[imageSrcs.length - 1] || ''})` }}
        >
          <div className="overlay prayer-overlay">
            <div className="prayer-header">
              <h2>{prayerData.title}</h2>
              <p>{prayerData.subtitle}</p>
            </div>
            {/* 터치 시 기독문 영역 전체 반투명 박스 확대 강조 */}
            <div 
              className={`prayer-body ${isPrayerActive ? 'active-presentation' : ''}`}
              onClick={handlePrayerClick}
            >
              {prayerData.prayer.map((line, idx) => (
                <p key={idx} className={idx === 0 || idx === prayerData.prayer.length - 1 ? "bold-line" : ""}>
                  {line}
                </p>
              ))}
            </div>
            <div className="prayer-footer">
              <h3>{prayerData.footerText}</h3>
              <span className="church-logo">Moving Church</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Page5;