'use client';

import Link from 'next/link';
import { useState } from 'react';
import AvatarCanvas from '@/components/AvatarCanvas';
import DemoArena from '@/components/DemoArena';
import { BRAND, FORMS, type Form } from '@/lib/livia';

const sections = [
  ['Living Companion', 'Persistent avatar, pointer-following gaze, browser-aware state and scene awareness.'],
  ['Browser Mode', 'Permitted page content becomes a safe virtualized world without touching the real DOM.'],
  ['Play Mode', 'Turn text and images into destructible local gameplay objects with weapon feedback.'],
  ['Transform', 'Morph into ships, drones, particles, cubes and energy forms with cinematic transitions.'],
  ['Rebuild', 'Destroy and reconstruct the scene with debris, smoke, orbiting debris and respawn logic.'],
  ['Privacy', 'Sensitive fields are excluded by design and page content remains local to the browser session.']
] as const;

const weapons = ['Blaster', 'Pulse Rifle', 'Railgun', 'Shockwave'];

export default function HomePage() {
  const [form, setForm] = useState<Form>('sphere');
  const [mode, setMode] = useState<'demo' | 'browser'>('demo');

  return (
    <main className="landing-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span>{BRAND.name}</span>
        </div>

        <nav className="topnav" aria-label="Main navigation">
          <a href="#how">How it works</a>
          <a href="#play">Play</a>
          <a href="#install">Install</a>
          <a href="/dashboard">Dashboard</a>
        </nav>

        <div className="top-actions">
          <button type="button" className="btn ghost-btn">
            Install extension
          </button>
          <Link href="/demo" className="btn solid-btn">
            Launch demo
          </Link>
        </div>
      </header>

      <section className="hero">
        <div className="hero__copy">
          <p className="eyebrow">Your screen just came alive.</p>
          <h1>Enter the browser as a living playable world.</h1>
          <p className="hero__text">
            LIVIA turns permitted webpage content into a reactive digital environment: text becomes objects,
            images become props, the avatar follows you, and the browser becomes a game world instead of a flat page.
          </p>

          <div className="mode-toggle" aria-label="Mode toggle">
            <button
              type="button"
              className={mode === 'demo' ? 'mode-button active' : 'mode-button'}
              onClick={() => setMode('demo')}
            >
              Demo mode
            </button>
            <button
              type="button"
              className={mode === 'browser' ? 'mode-button active' : 'mode-button'}
              onClick={() => setMode('browser')}
            >
              Browser mode
            </button>
          </div>

          <div className="inline-row">
            {FORMS.map((shape) => (
              <button
                key={shape}
                type="button"
                className={`chip ${form === shape ? 'chip--active' : ''}`}
                onClick={() => setForm(shape)}
              >
                {shape}
              </button>
            ))}
          </div>

          <div className="cta-row">
            <Link href="/demo" className="btn solid-btn large-btn">
              Start for free
            </Link>
            <Link href="/dashboard" className="btn ghost-btn large-btn">
              View dashboard
            </Link>
          </div>
        </div>

        <div className="hero__visual">
          <div className="scene-panel">
            <div className="scene-panel__header">
              <span>LIVIA // live scene</span>
              <span className="status-dot">● active</span>
            </div>

            <div className="scene-panel__viewport">
              {mode === 'demo' ? <DemoArena className="demo-arena" /> : <AvatarCanvas form={form} color="#7cf3ff" size={1.4} className="arena-canvas" />}
            </div>

            <div className="scene-panel__hud">
              <div>
                <strong>92%</strong>
                <span>scene sync</span>
              </div>
              <div>
                <strong>7.2s</strong>
                <span>clear time</span>
              </div>
              <div>
                <strong>12</strong>
                <span>targets</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="feature-grid">
        {sections.map(([title, text]) => (
          <article key={title} className="feature-card">
            <h3>{title}</h3>
            <p>{text}</p>
          </article>
        ))}
      </section>

      <section id="play" className="showcase">
        <div className="showcase__copy">
          <p className="eyebrow">Built for gameplay</p>
          <h2>Reload the browser as a space arena.</h2>
          <p>
            Page content becomes a live scene graph: text blocks become matter, images become virtual props, and the
            avatar transforms into a playable combat system designed for smooth browser interaction.
          </p>
        </div>

        <div className="weapon-panel">
          <div className="weapon-panel__heading">
            <span>Live weapons</span>
            <span>demo loadout</span>
          </div>
          <div className="weapon-list">
            {weapons.map((name, index) => (
              <div key={name} className={`weapon-item weapon-item--${index + 1}`}>
                <span>{name}</span>
                <small>{index === 0 ? 'rapid' : index === 1 ? 'burst' : index === 2 ? 'heavy' : 'shock'} </small>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="install" className="install-block">
        <div>
          <p className="eyebrow">Install</p>
          <h2>Works in Browser mode and Demo mode.</h2>
        </div>
        <pre>{`1. Open Chrome or Edge\n2. Visit chrome://extensions\n3. Enable Developer mode\n4. Load unpacked\n5. Select the apps/extension folder`}</pre>
      </section>
    </main>
  );
}
