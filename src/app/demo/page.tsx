import React from 'react';

export default function DemoPage() {
  return (
    <main style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', fontFamily: 'sans-serif' }}>
      <h1>Summeet Product Demo</h1>
      
      {/* 6.1. Demo Video */}
      <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', marginBottom: '20px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
        <iframe 
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
          src="https://youtu.be/RU7TPAPqQDc" 
          title="Summeet Demo Video"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>

      {/* 6.2. Demo Description */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Video Description</h2>
        <p>
          This video demonstrates how <strong>Summeet</strong> streamlines meeting productivity. 
          It showcases the AI-driven transcription process, real-time key point extraction, 
          and the final automated summary generation that helps teams stay aligned without manual note-taking.
        </p>
      </section>

      {/* 6.3. Working Prototype Link */}
      <section>
        <a href="/" style={{ backgroundColor: '#0070f3', color: 'white', padding: '12px 24px', borderRadius: '5px', textDecoration: 'none', fontWeight: 'bold' }}>
          Explore Working Prototype →
        </a>
      </section>
    </main>
  );
}