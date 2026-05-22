export default function Home() {
  return (
    <main style={{ fontFamily: 'monospace', padding: '2rem', background: '#0a0a0a', color: '#00ff88', minHeight: '100vh' }}>
      <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>LexwareAI API</h1>
      <pre style={{ fontSize: '0.875rem', lineHeight: '1.6' }}>
        {JSON.stringify({ status: 'ok', service: 'LexwareAI API', version: '1.0.0' }, null, 2)}
      </pre>
      <p style={{ marginTop: '1rem', color: '#888', fontSize: '0.75rem' }}>
        API endpoints available at /api/*
      </p>
    </main>
  );
}
