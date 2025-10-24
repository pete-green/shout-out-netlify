import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import Home from './pages/Home'
import Salespeople from './pages/Salespeople'

function App() {
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
            <div style={{ display: 'flex', gap: '2rem' }}>
              <Link to="/" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Home
              </Link>
              <Link to="/salespeople" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: '1rem' }}>
                Salespeople
              </Link>
            </div>
          </div>
        </nav>

        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/salespeople" element={<Salespeople />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
