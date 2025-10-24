function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 'calc(100vh - 80px)',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>🎉 Shout Out</h1>
      <p style={{ fontSize: '1.5rem', color: '#94a3b8' }}>Sales Celebration System</p>
      <div style={{ marginTop: '2rem', textAlign: 'center', maxWidth: '600px' }}>
        <p style={{ color: '#cbd5e1' }}>
          Sales celebration system powered by ServiceTitan API integration.
        </p>
        <p style={{ color: '#64748b', marginTop: '1rem', fontSize: '0.875rem' }}>
          Automatically celebrates TGLs and Big Sales with fun messages and GIFs!
        </p>
      </div>
    </div>
  )
}

export default Home
