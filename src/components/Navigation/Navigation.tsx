import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDeviceType } from '../../hooks/useDeviceType';
import styles from './Navigation.module.css';

interface NavigationProps {
  unassignedCount: number;
}

export function Navigation({ unassignedCount }: NavigationProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { isMobile } = useDeviceType();
  const location = useLocation();

  const navLinks = [
    { path: '/', label: 'Dashboard' },
    { path: '/people', label: 'People', badge: unassignedCount },
    { path: '/messages', label: 'Messages' },
    { path: '/gifs', label: 'GIFs' },
    { path: '/configuration', label: 'Configuration' },
  ];

  const isActive = (path: string) => location.pathname === path;

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
  };

  return (
    <>
      <nav className={styles.nav}>
        <div className={styles.navContainer}>
          <h1 className={styles.logo}>🎉 Shout Out</h1>

          {/* Desktop Navigation */}
          {!isMobile && (
            <div className={styles.desktopLinks}>
              {navLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`${styles.navLink} ${isActive(link.path) ? styles.active : ''}`.trim()}
                >
                  {link.label}
                  {link.badge && link.badge > 0 && (
                    <span className={styles.badge}>{link.badge}</span>
                  )}
                </Link>
              ))}
            </div>
          )}

          {/* Mobile Hamburger Button */}
          {isMobile && (
            <button
              className={styles.hamburger}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ''}`.trim()} />
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ''}`.trim()} />
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ''}`.trim()} />
            </button>
          )}
        </div>
      </nav>

      {/* Mobile Menu Drawer */}
      {isMobile && (
        <>
          {/* Backdrop */}
          {mobileMenuOpen && (
            <div
              className={styles.backdrop}
              onClick={closeMobileMenu}
            />
          )}

          {/* Drawer */}
          <div className={`${styles.drawer} ${mobileMenuOpen ? styles.open : ''}`.trim()}>
            <div className={styles.drawerHeader}>
              <h2 className={styles.drawerTitle}>Menu</h2>
              <button
                className={styles.closeButton}
                onClick={closeMobileMenu}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className={styles.drawerLinks}>
              {navLinks.map(link => (
                <Link
                  key={link.path}
                  to={link.path}
                  className={`${styles.drawerLink} ${isActive(link.path) ? styles.active : ''}`.trim()}
                  onClick={closeMobileMenu}
                >
                  {link.label}
                  {link.badge && link.badge > 0 && (
                    <span className={styles.badge}>{link.badge}</span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
