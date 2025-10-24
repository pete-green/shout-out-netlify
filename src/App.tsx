import { useState, useEffect } from 'react'

function App() {
  const [status, setStatus] = useState<string>('Loading...')

  useEffect(() => {
    // Simple health check
    setStatus('Shout Out - Sales Celebration System')
  }, [])

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      backgroundColor: '#0f172a',
      color: '#f1f5f9'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉 Shout Out</h1>
      <p style={{ fontSize: '1.5rem', color: '#94a3b8' }}>{status}</p>
      <div style={{ marginTop: '2rem', textAlign: 'center', maxWidth: '600px' }}>
        <p style={{ color: '#cbd5e1' }}>
          Sales celebration system powered by ServiceTitan API integration.
        </p>
        <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.875rem' }}>
          Dashboard coming soon...
        </p>
      </div>
    </div>
  )
}

export default App
