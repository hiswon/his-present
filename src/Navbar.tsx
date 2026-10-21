import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import './Navbar.css';

const Navbar: React.FC = () => {
  const location = useLocation();

  // 총 페이지 수 (설교 개수) 설정
  const totalPages = 7;

  // 현재 경로에서 페이지 번호 추출 (예: "/page2" -> 2)
  const getCurrentPage = () => {
    const match = location.pathname.match(/\/page(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };

  const currentPage = getCurrentPage();

  // 이전 페이지 경로 계산 (1보다 작아지지 않음)
  const prevPage = Math.max(currentPage - 1, 1);
  // 다음 페이지 경로 계산 (총 페이지 수를 넘지 않음)
  const nextPage = Math.min(currentPage + 1, totalPages);

  return (
    <nav className="navbar">
      <div className="navbar-logo">his Present</div>
      
      {/* 화살표 내비게이션 영역 */}
      <div className="navbar-pagination">
        {/* 이전 페이지 버튼 (1페이지일 때는 비활성화 느낌을 주거나 첫 페이지 유지) */}
        <Link 
          to={`/page${prevPage}`} 
          className={`arrow-btn ${currentPage === 1 ? 'disabled' : ''}`}
          aria-label="Previous Page"
        >
          &lt;
        </Link>

        {/* 현재 페이지 표시 */}
        <span className="page-indicator">
          {currentPage} / {totalPages}
        </span>

        {/* 다음 페이지 버튼 */}
        <Link 
          to={`/page${nextPage}`} 
          className={`arrow-btn ${currentPage === totalPages ? 'disabled' : ''}`}
          aria-label="Next Page"
        >
          &gt;
        </Link>
      </div>
    </nav>
  );
};

export default Navbar;