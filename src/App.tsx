import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Navigation } from './components/Navigation'
import Home from './pages/Home'
import People from './pages/People'
import Messages from './pages/Messages'
import GIFs from './pages/GIFs'
import Configuration from './pages/Configuration'

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
        <Navigation unassignedCount={unassignedCount} />

        {/* Routes */}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/people" element={<People />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/gifs" element={<GIFs />} />
          <Route path="/configuration" element={<Configuration />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
