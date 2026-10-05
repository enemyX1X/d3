'use client';

import Link from 'next/link';
import DemoArena from '@/components/DemoArena';

const metrics = [
  ['Clear time', '7.2s'],
  ['Targets', '12'],
  ['Sync', '92%'],
  ['Threat', 'Low']
] as const;

const capabilityCards = [
  ['Manual fire', 'User-triggered firing only. Nothing happens until you click to play.'],
  ['Overlay-safe', 'All destruction stays inside the virtualized browser scene, not the original page DOM.'],
  ['Mobile-ready', 'Responsive HUD and touch-friendly controls adapt to smaller screens.']
] as const;

export default function DemoPage() {
  return (
    <main className="demo-page">
      <header className="demo-header">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark">L</span>
          <span>LIVIA</span>
        </Link>

        <div className="demo-actions">
          <button type="button" className="btn ghost-btn">
            Reset arena
          </button>
          <button type="button" className="btn solid-btn">
            Play now
          </button>
        </div>
      </header>

      <section className="demo-layout">
        <div className="arena-stage">
          <DemoArena className="demo-arena" />
        </div>

        <aside className="demo-panel">
          <p className="eyebrow">Demo mode</p>
          <h1>Manual weapon control.</h1>
          <p className="demo-copy">
            Trigger the blast yourself, clear the space, and track the full-screen wipe in real time. Every effect stays
            in the local browser overlay for a clean, safe experience.
          </p>

          <div className="score-grid">
            {metrics.map(([label, value]) => (
              <div key={label} className="score-card">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="demo-controls">
            <button type="button" className="btn solid-btn wide-btn">
              Start sweep
            </button>
            <button type="button" className="btn ghost-btn wide-btn">
              Pause scene
            </button>
          </div>

          <div className="mini-panel">
            <div className="mini-header">
              <span>Threat map</span>
              <span>Live</span>
            </div>
            <div className="bars">
              {[68, 82, 58, 90, 72, 48].map((value, index) => (
                <span key={index} style={{ height: `${value}%` }} />
              ))}
            </div>
          </div>
        </aside>
      </section>

      <section className="demo-feature-grid">
        {capabilityCards.map(([title, text]) => (
          <article key={title} className="feature-card">
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
