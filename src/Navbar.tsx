import React from 'react';
import { Link } from 'react-router-dom';
import './Navbar.css';

const Navbar: React.FC = () => {
  return (
    <nav className="navbar">
      <div className="navbar-logo">his Present</div>
      <ul className="navbar-links">
        <li>
          <Link to="/page1" data-text="1">sermon1</Link>
        </li>
        <li>
          <Link to="/page2" data-text="2">sermon2</Link>
        </li>
        <li>
          <Link to="/page3" data-text="3">sermon3</Link>
        </li>
      </ul>
    </nav>
  );
};

export default Navbar;