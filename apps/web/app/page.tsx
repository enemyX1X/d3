'use client';

import { useState } from 'react';
import AvatarCanvas from '@/components/AvatarCanvas';
import { BRAND, FORMS, type Form } from '@/lib/livia';

const sections = [
  ['Living Companion', 'A persistent avatar that follows your pointer and stays aware of supported page context.'],
  ['Transform', 'Switch smoothly between sphere, robot, drone, spaceship and particle states.'],
  ['Interact', 'Use the extension layer to read permitted page elements without touching private forms.'],
  ['Play', 'Turn visible text into virtual targets and blast them in a safe local game layer.'],
  ['Create', 'Customize the avatar, colours and size from the dashboard and local settings.'],
  ['Rebuild', 'Destroyed objects can reassemble from particles and return to the scene.'],
  ['Privacy', 'Pause the avatar, disable per site, disable page analysis and delete local state at will.']
] as const;

export default function HomePage() {
  const [form, setForm] = useState<Form>('sphere');

  return (
    <main>
      <nav>
        <b>{BRAND.name}</b>
        <span>
          <a href="#how">How it works</a>
          <a href="#install">Install</a>
          <a href="/dashboard">Dashboard</a>
        </span>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <h1>YOUR DIGITAL WORLD JUST CAME ALIVE.</h1>
          <p>
            A persistent AI companion that follows you, transforms, plays, creates and rebuilds the digital world around you.
          </p>
          <div className="inline-row">
            {FORMS.map((shape) => (
              <button
                key={shape}
                type="button"
                className={`btn ${form === shape ? 'on' : ''}`}
                onClick={() => setForm(shape)}
              >
                {shape}
              </button>
            ))}
          </div>
          <p className="note">Move your pointer to see the avatar respond in a live browser environment.</p>
        </div>

        <div className="demo-shell">
          <AvatarCanvas form={form} color="#7cf3ff" size={1.2} />
        </div>
      </section>

      <section>
        <h2>What it does</h2>
        <div className="grid">
          {sections.map(([title, text]) => (
            <div key={title} className="card">
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="how">
        <h2>How it works</h2>
        <div className="grid">
          <div className="card">
            <h3>Web app</h3>
            <p>Configuration, landing page, dashboard, onboarding and enterprise-ready app shell.</p>
          </div>
          <div className="card">
            <h3>Browser extension</h3>
            <p>Manifest V3 serializes the scene, tracks pointer and focus, then renders the companion overlay locally.</p>
          </div>
          <div className="card">
            <h3>Honest limits</h3>
            <p>Browsers do not allow arbitrary desktop control or silent reading of private page contents.</p>
          </div>
        </div>
      </section>

      <section id="install">
        <h2>Install extension</h2>
        <pre>{`1. Open Chrome or Edge\n2. Visit chrome://extensions\n3. Enable Developer mode\n4. Load unpacked\n5. Select the apps/extension folder`}</pre>
        <p className="note">This project requires a desktop browser. Mobile browsers do not support the extension architecture.</p>
      </section>
    </main>
  );
}
