'use client';

import Link from 'next/link';
import { useState } from 'react';
import DemoArena from '@/components/DemoArena';
import DemoGame, { type DemoStats } from '@/components/DemoGame';

const initialStats: DemoStats = { score: 0, targets: 9, clearTime: '--' };

const capabilityCards = [
  ['Manual fire', 'User-triggered firing only. Nothing happens until you click to play.'],
  ['Overlay-safe', 'All destruction stays inside the virtualized browser scene, not the original page DOM.'],
  ['Mobile-ready', 'Responsive HUD and touch-friendly controls adapt to smaller screens.']
] as const;

export default function DemoPage() {
  const [playing, setPlaying] = useState(false);
  const [paused, setPaused] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [stats, setStats] = useState(initialStats);

  function resetDemo() {
    setPlaying(false);
    setPaused(false);
    setStats(initialStats);
    setResetKey((key) => key + 1);
  }

  function togglePlay() {
    if (!playing && stats.targets === 0) resetDemo();
    setPaused(false);
    setPlaying((value) => !value);
  }

  return (
    <main className="demo-page">
      <header className="demo-header">
        <Link href="/" className="brand-lockup">
          <span className="brand-mark">L</span>
          <span>LIVIA</span>
        </Link>

        <div className="demo-actions">
          <button type="button" className="btn ghost-btn" onClick={resetDemo}>
            Reset arena
          </button>
          <button type="button" className="btn solid-btn" onClick={togglePlay}>
            {playing ? 'Stop demo' : 'Play now'}
          </button>
        </div>
      </header>

      <section className="demo-layout">
        <div className="arena-stage">
          <DemoArena className="demo-arena" />
          <DemoGame
            playing={playing}
            paused={paused}
            resetKey={resetKey}
            onStats={setStats}
            onComplete={() => setPlaying(false)}
          />
        </div>

        <aside className="demo-panel">
          <p className="eyebrow">Demo mode</p>
          <h1>Meet the robot. Take control.</h1>
          <p className="demo-copy">
            Move with WASD, aim with the mouse, hop between targets with Space, and fire only when you click. The robot
            stays visible in the arena and settles into sleep when idle.
          </p>

          <div className="score-grid">
            <div className="score-card"><span>Clear time</span><strong>{stats.clearTime}</strong></div>
            <div className="score-card"><span>Targets</span><strong>{stats.targets}/9</strong></div>
            <div className="score-card"><span>Score</span><strong>{stats.score}</strong></div>
            <div className="score-card"><span>Mode</span><strong>{paused ? 'Paused' : playing ? 'Live' : 'Ready'}</strong></div>
          </div>

          <div className="demo-controls">
            <button type="button" className="btn solid-btn wide-btn" onClick={togglePlay}>
              {playing ? 'Stop demo' : 'Start play'}
            </button>
            <button type="button" className="btn ghost-btn wide-btn" onClick={() => setPaused((value) => !value)} disabled={!playing}>
              {paused ? 'Resume' : 'Pause'}
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
