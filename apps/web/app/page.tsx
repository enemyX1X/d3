'use client';

import Link from 'next/link';
import { useState } from 'react';
import AvatarCanvas from '@/components/AvatarCanvas';

const liveFeatures = [
  'Authority-scored source registry',
  'Robots-aware sitemap discovery',
  'Versioned evidence and diffs',
  'Retrieval + temporal reasoning',
  'Watchlists and alert prioritization',
  'Evidence-backed answer generation'
] as const;

const rolloutSources = [
  { name: 'Karnataka Transport Department', url: 'https://transport.karnataka.gov.in/notices', focus: 'Official licensing & appointment updates' },
  { name: 'Ministry of Road Transport & Highways', url: 'https://morth.gov.in/', focus: 'National transport policy and notices' },
  { name: 'State public notices RSS', url: 'https://example.gov.in/feed.xml', focus: 'Feed-based official notice stream' },
  { name: 'Regional court/authority boards', url: 'https://example.gov.in/authorities', focus: 'Regulatory change tracking' }
] as const;

const wiringPlan = [
  'Register trusted sources in the intelligence registry.',
  'Run crawler jobs and persist versioned documents with evidence blocks.',
  'Score relevance, detect contradictions, and rank alerts by authority and timing.',
  'Show final summaries in the web dashboard and support watchlist-driven updates.'
] as const;

export default function HomePage() {
  const [mode, setMode] = useState<'preview' | 'dashboard'>('preview');

  return (
    <main className="landing-shell">
      <header className="topbar compact-topbar">
        <div className="brand-lockup">
          <span className="brand-mark">L</span>
          <span>LIVIA</span>
        </div>

        <nav className="topnav" aria-label="Main navigation">
          <Link href="/intelligence">Intelligence</Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/demo">Demo</Link>
        </nav>

        <div className="top-actions">
          <Link href="/intelligence" className="btn ghost-btn small-btn">
            Open monitor
          </Link>
          <Link href="/dashboard" className="btn solid-btn small-btn">
            Avatar panel
          </Link>
        </div>
      </header>

      <section className="hero compact-hero">
        <div className="hero__copy">
          <p className="eyebrow">Evidence-driven monitoring</p>
          <h1>Track official change before it becomes noise.</h1>
          <p className="hero__text">
            LIVIA monitors trusted public sources, normalizes the content, stores versioned evidence, and ranks change by authority,
            relevance, and timing before surfacing it in the dashboard.
          </p>

          <div className="status-stack" aria-label="system capabilities">
            <span>Source registry</span>
            <span>Diff engine</span>
            <span>Retrieval</span>
            <span>Watchlists</span>
          </div>

          <div className="cta-row">
            <Link href="/intelligence" className="btn solid-btn large-btn">
              Open intelligence
            </Link>
            <Link href="/dashboard" className="btn ghost-btn large-btn">
              Dashboard</Link>
          </div>
        </div>

        <div className="hero__visual">
          <div className="scene-panel compact-scene">
            <div className="scene-panel__header">
              <span>System preview</span>
              <span className="status-dot">● live</span>
            </div>

            <div className="scene-panel__viewport minimal-viewport">
              <AvatarCanvas form="sphere" color="#7cf3ff" size={1.25} className="arena-canvas" />
            </div>

            <div className="scene-panel__hud compact-hud">
              <div>
                <strong>25</strong>
                <span>tests</span>
              </div>
              <div>
                <strong>4</strong>
                <span>milestones</span>
              </div>
              <div>
                <strong>1.0</strong>
                <span>signals</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="info-grid">
        <article className="info-card">
          <p className="eyebrow">live capabilities</p>
          <ul className="feature-list">
            {liveFeatures.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </article>

        <article className="info-card">
          <p className="eyebrow">real source rollout</p>
          <div className="source-list">
            {rolloutSources.map((source) => (
              <div key={source.name} className="source-row">
                <div>
                  <strong>{source.name}</strong>
                  <span>{source.focus}</span>
                </div>
                <a href={source.url} target="_blank" rel="noreferrer">Open</a>
              </div>
            ))}
          </div>
        </article>

        <article className="info-card">
          <p className="eyebrow">wiring plan</p>
          <ol className="plan-list">
            {wiringPlan.map((step, index) => (
              <li key={step}><span>{index + 1}</span>{step}</li>
            ))}
          </ol>
        </article>
      </section>
    </main>
  );
}
