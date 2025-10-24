import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import People from './pages/People'
import Messages from './pages/Messages'
import GIFs from './pages/GIFs'

function App() {
  const [unassignedCount, setUnassignedCount] = useState(0)

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

  return (
    <Router>
      <div style={{
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        backgroundColor: '#0f172a',
        color: '#f1f5f9'
      }}>
        {/* Navigation */}
        <nav style={{
          backgroundColor: '#1e293b',
          padding: '1rem 2rem',
          borderBottom: '1px solid #334155'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            maxWidth: '1200px',
            margin: '0 auto'
          }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>🎉 Shout Out</h1>
            <div style={{ display: 'flex', gap: '2rem', alignItems: 'center' }}>
              <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Home
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
            </div>
          </div>
        </nav>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/people" element={<People />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/gifs" element={<GIFs />} />
        </Routes>

        {/* Add bounce animation */}
        <style>{`
          @keyframes bounce {
            0%, 100% {
              transform: translateY(0);
            }
            50% {
              transform: translateY(-5px);
            }
          }
        `}</style>
      </div>
    </Router>
  )
}

export default App
