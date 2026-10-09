'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import LiviaPresence from '@/components/LiviaPresence';

const finalName = ['L', 'I', 'V', 'I', 'A'];
const letterGlyphs = [
  ['L', 'Ł', 'Լ', 'Ⅼ', '╰', 'L'],
  ['I', 'İ', 'І', 'Ⅰ', '¦', 'I'],
  ['V', 'Ⅴ', 'ν', '∨', '✓', 'V'],
  ['I', 'Ї', 'Ӏ', 'Ⅰ', '⋮', 'I'],
  ['A', 'Å', 'Α', 'А', '∆', 'A']
];
const assistantName = 'Living Interactive Virtual Intelligent Assistant';

export default function HomePage() {
  const [signature, setSignature] = useState(finalName);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setRevealed(true);
      return;
    }
    let tick = 0;
    const timer = window.setInterval(() => {
      if (tick >= 22) {
        window.clearInterval(timer);
        setSignature(finalName);
        setRevealed(true);
        return;
      }
      setSignature(letterGlyphs.map((glyphs, index) => glyphs[(tick + index * 2) % glyphs.length]));
      tick += 1;
    }, 76);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <main className="livia-home">
      <header className="home-nav">
        <a className="home-brand" href="/" aria-label="LIVIA home"><span className="home-brand-mark">L</span><span>LIVIA</span></a>
        <nav aria-label="Main navigation"><a href="#capabilities">Capabilities</a><a href="#install">Installation</a></nav>
        <Link className="home-workspace-link" href="/dashboard">Open workspace <span aria-hidden="true">↗</span></Link>
      </header>

      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="home-overline"><span className="home-signal" /> LOCAL-FIRST BROWSER ASSISTANT</p>
          <h1 className="identity-word" aria-label="LIVIA">{signature.map((letter, index) => <span key={index} className={revealed ? 'identity-letter settled' : 'identity-letter'}>{letter}</span>)}</h1>
          <p className={revealed ? 'identity-full revealed' : 'identity-full'} aria-live="polite">{revealed ? assistantName : 'L · I · V · I · A'}</p>
          <p className="home-lede">Understand the page. Make a plan with you. Take action only with your permission.</p>
          <p className="home-description">LIVIA reads the page you choose, summarizes it locally without a model, finds useful context in pages you have saved, and can use an offline or advanced AI model for harder tasks.</p>
          <div className="home-actions">
            <a className="official-install-button" href="https://cyberstarlink.com/" target="_blank" rel="noreferrer">Get LIVIA from CYBERSTARLINK <span aria-hidden="true">↗</span></a>
            <Link className="workspace-text-link" href="/dashboard">Open task workspace</Link>
          </div>
          <p className="official-note">Install LIVIA only through CYBERSTARLINK. No third-party extension downloads.</p>
        </div>
        <div className="home-visual">
          <div className="visual-index"><span>01 / COMPANION</span><span>LOCAL INSTANCE</span></div>
          <LiviaPresence state="waiting" />
          <div className="visual-caption"><span>PAGE-AWARE</span><span>USER-CONTROLLED</span><span>MODEL-OPTIONAL</span></div>
        </div>
        <div className="hero-coordinate" aria-hidden="true">CSL // LIVIA<br />BROWSER INTELLIGENCE<br />EST. 2026</div>
      </section>

      <section className="home-capabilities" id="capabilities">
        <div className="section-intro"><p className="home-overline">HOW LIVIA WORKS</p><h2>From page context to permitted action.</h2></div>
        <div className="capability-list">
          <article><span>01</span><div><h3>Understand</h3><p>Inspect the enabled page, extract visible content, and summarize it locally without any model or key.</p></div><b>OFFLINE</b></article>
          <article><span>02</span><div><h3>Remember</h3><p>Save pages you choose. Search local page memory with keyword retrieval and optional local embeddings.</p></div><b>LOCAL RAG</b></article>
          <article><span>03</span><div><h3>Plan</h3><p>Use an installed Ollama model or a configured advanced provider. External page context is sent only with your consent.</p></div><b>MODEL SELECTOR</b></article>
          <article><span>04</span><div><h3>Act with permission</h3><p>Review supported browser actions in an extension-owned approval screen. LIVIA verifies the result and reports what happened.</p></div><b>APPROVAL-GATED</b></article>
        </div>
      </section>

      <section className="install-section" id="install">
        <div className="install-heading"><p className="home-overline">OFFICIAL INSTALLATION</p><h2>Get the extension from CYBERSTARLINK.</h2><p>CYBERSTARLINK is the only installation source for LIVIA. Use its current official product page for availability and browser-specific installation instructions.</p><a href="https://cyberstarlink.com/" target="_blank" rel="noreferrer" className="official-install-button">Visit CYBERSTARLINK <span aria-hidden="true">↗</span></a></div>
        <ol className="install-steps"><li><span>01</span><div><strong>Visit the official site</strong><p>Open CYBERSTARLINK and find the LIVIA browser assistant listing.</p></div></li><li><span>02</span><div><strong>Install from its official listing</strong><p>Follow the browser instructions provided by CYBERSTARLINK. Do not install repackaged copies.</p></div></li><li><span>03</span><div><strong>Choose a page and press Q</strong><p>Grant access only to a page you want LIVIA to understand. Press Q to open the task assistant.</p></div></li></ol>
      </section>

      <footer className="home-footer"><a className="home-brand" href="/" aria-label="LIVIA home"><span className="home-brand-mark">L</span><span>LIVIA</span></a><span>Living Interactive Virtual Intelligent Assistant</span><span>Official extension source: CYBERSTARLINK</span></footer>
    </main>
  );
}
