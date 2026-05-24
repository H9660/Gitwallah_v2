import { useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Header() {
    const { user, logout } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const toggleMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);
    const closeMenu = () => setIsMobileMenuOpen(false);

    return (
        <header className="header">
            <Link to="/" className="header__brand" style={{ textDecoration: 'none' }}>
                <div className="logo">
                    <svg viewBox="0 0 32 32" fill="none" className="logo__icon">
                        <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
                        <circle cx="16" cy="16" r="5" fill="currentColor" />
                        <line x1="16" y1="2" x2="16" y2="11" stroke="currentColor" strokeWidth="2" />
                        <line x1="21" y1="16" x2="30" y2="16" stroke="currentColor" strokeWidth="2" />
                        <circle cx="16" cy="2" r="2" fill="currentColor" />
                        <circle cx="30" cy="16" r="2" fill="currentColor" />
                    </svg>
                    <h1 className="logo__text">Git<span>Wallah</span></h1>
                </div>
            </Link>

            <button className={`hamburger ${isMobileMenuOpen ? 'open' : ''}`} onClick={toggleMenu} aria-label="Toggle menu">
                <span></span>
                <span></span>
                <span></span>
            </button>

            <div className={`header__menu ${isMobileMenuOpen ? 'open' : ''}`}>
                <nav className="header__nav">
                    <NavLink to="/practice" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={closeMenu}>
                        ⚡ Practice
                    </NavLink>
                    <NavLink to="/cheatsheet" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={closeMenu}>
                        📖 Cheat Sheet
                    </NavLink>
                    <NavLink to="/contests" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={closeMenu}>
                        🏆 Contests
                    </NavLink>
                    <NavLink to="/profile" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} onClick={closeMenu}>
                        👤 Profile
                    </NavLink>
                </nav>

                <div className="header__right">
                    {user ? (
                        <>
                            <div className="user-chip">
                                <div className="user-chip__avatar">{user.username?.[0]?.toUpperCase()}</div>
                                {user.username}
                            </div>
                            <button className="btn btn-ghost btn-sm" onClick={() => { logout(); closeMenu(); }}>Sign out</button>
                        </>
                    ) : (
                        <Link to="/auth" className="btn btn-primary btn-sm" onClick={closeMenu}>Sign in</Link>
                    )}
                </div>
            </div>
        </header>
    );
}
