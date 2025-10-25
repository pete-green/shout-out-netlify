import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import Home from './pages/Home'
import People from './pages/People'
import Messages from './pages/Messages'
import GIFs from './pages/GIFs'
import Configuration from './pages/Configuration'
import { useIsMobile } from './hooks/useDeviceType'

function App() {
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isMobile = useIsMobile()

  // Fetch unassigned count on mount and every 30 seconds
  useEffect(() => {
    fetchUnassignedCount()
    const interval = setInterval(fetchUnassignedCount, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchUnassignedCount = async () => {
    try {
      const response = await fetch('/.netlify/functions/salespeople')
      if (response.ok) {
        const data = await response.json()
        const count = data.filter((person: any) => !person.business_unit).length
        setUnassignedCount(count)
      }
    } catch (error) {
      console.error('Failed to fetch unassigned count:', error)
    }
  }

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <Router>
      <AppContent
        unassignedCount={unassignedCount}
        isMobile={isMobile}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
        closeMobileMenu={closeMobileMenu}
      />
    </Router>
  )
}

interface AppContentProps {
  unassignedCount: number
  isMobile: boolean
  mobileMenuOpen: boolean
  setMobileMenuOpen: (open: boolean) => void
  closeMobileMenu: () => void
}

function AppContent({ unassignedCount, isMobile, mobileMenuOpen, setMobileMenuOpen, closeMobileMenu }: AppContentProps) {
  const location = useLocation()

  // Close mobile menu on route change
  useEffect(() => {
    closeMobileMenu()
  }, [location.pathname])

  return (
    <div style={{
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#0f172a',
      color: '#f1f5f9'
    }}>
      {/* Navigation */}
      <nav style={{
        backgroundColor: '#1e293b',
        padding: isMobile ? '1rem' : '1rem 2rem',
        borderBottom: '1px solid #334155',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <h1 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: 'bold' }}>🎉 Shout Out</h1>

          {isMobile ? (
            // Mobile: Hamburger menu
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                background: 'none',
                border: 'none',
                color: '#f1f5f9',
                fontSize: '1.5rem',
                cursor: 'pointer',
                padding: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: '44px',
                minHeight: '44px',
              }}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? '✕' : '☰'}
            </button>
          ) : (
            // Desktop: Horizontal nav
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Dashboard
              </Link>
              <Link
                to="/people"
                style={{
                  color: '#94a3b8',
                  textDecoration: 'none',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  position: 'relative',
                }}
              >
                People
                {unassignedCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '1.5rem',
                      height: '1.5rem',
                      padding: '0 0.35rem',
                      backgroundColor: '#f59e0b',
                      color: '#000',
                      borderRadius: '9999px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      animation: 'bounce 1s infinite',
                    }}
                  >
                    {unassignedCount}
                  </span>
                )}
              </Link>
              <Link to="/messages" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Messages
              </Link>
              <Link to="/gifs" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                GIFs
              </Link>
              <Link to="/configuration" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Configuration
              </Link>
            </div>
          )}
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobile && mobileMenuOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={closeMobileMenu}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 200,
            }}
          />

          {/* Slide-out menu */}
          <div
            style={{
              position: 'fixed',
              top: 0,
              right: 0,
              bottom: 0,
              width: '280px',
              maxWidth: '85vw',
              backgroundColor: '#1e293b',
              zIndex: 300,
              overflowY: 'auto',
              boxShadow: '-4px 0 12px rgba(0, 0, 0, 0.3)',
              animation: 'slideIn 0.3s ease-out',
            }}
          >
            {/* Menu header */}
            <div style={{
              padding: '1.5rem 1rem',
              borderBottom: '1px solid #334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', margin: 0 }}>Menu</h2>
              <button
                onClick={closeMobileMenu}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  padding: '0.5rem',
                  minWidth: '44px',
                  minHeight: '44px',
                }}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            {/* Menu items */}
            <nav style={{ padding: '1rem 0' }}>
              <Link
                to="/"
                style={{
                  padding: '1rem 1.5rem',
                  color: location.pathname === '/' ? '#3b82f6' : '#f1f5f9',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  backgroundColor: location.pathname === '/' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: location.pathname === '/' ? '4px solid #3b82f6' : '4px solid transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                📊 Dashboard
              </Link>
              <Link
                to="/people"
                style={{
                  padding: '1rem 1.5rem',
                  color: location.pathname === '/people' ? '#3b82f6' : '#f1f5f9',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  backgroundColor: location.pathname === '/people' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: location.pathname === '/people' ? '4px solid #3b82f6' : '4px solid transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <span>👥 People</span>
                {unassignedCount > 0 && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: '1.75rem',
                      height: '1.75rem',
                      padding: '0 0.5rem',
                      backgroundColor: '#f59e0b',
                      color: '#000',
                      borderRadius: '9999px',
                      fontSize: '0.875rem',
                      fontWeight: '700',
                    }}
                  >
                    {unassignedCount}
                  </span>
                )}
              </Link>
              <Link
                to="/messages"
                style={{
                  padding: '1rem 1.5rem',
                  color: location.pathname === '/messages' ? '#3b82f6' : '#f1f5f9',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  backgroundColor: location.pathname === '/messages' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: location.pathname === '/messages' ? '4px solid #3b82f6' : '4px solid transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                💬 Messages
              </Link>
              <Link
                to="/gifs"
                style={{
                  padding: '1rem 1.5rem',
                  color: location.pathname === '/gifs' ? '#3b82f6' : '#f1f5f9',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  backgroundColor: location.pathname === '/gifs' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: location.pathname === '/gifs' ? '4px solid #3b82f6' : '4px solid transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                🎬 GIFs
              </Link>
              <Link
                to="/configuration"
                style={{
                  padding: '1rem 1.5rem',
                  color: location.pathname === '/configuration' ? '#3b82f6' : '#f1f5f9',
                  textDecoration: 'none',
                  fontSize: '1.125rem',
                  backgroundColor: location.pathname === '/configuration' ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  borderLeft: location.pathname === '/configuration' ? '4px solid #3b82f6' : '4px solid transparent',
                  minHeight: '44px',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                ⚙️ Configuration
              </Link>
            </nav>
          </div>
        </>
      )}

      {/* Routes */}
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/people" element={<People />} />
        <Route path="/messages" element={<Messages />} />
        <Route path="/gifs" element={<GIFs />} />
        <Route path="/configuration" element={<Configuration />} />
      </Routes>

      {/* Add animations */}
      <style>{`
        @keyframes bounce {
          0%, 100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-5px);
          }
        }

        @keyframes slideIn {
          from {
            transform: translateX(100%);
          }
          to {
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  )
}

export default App
