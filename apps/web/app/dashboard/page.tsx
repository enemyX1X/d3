'use client';

import { useEffect, useState } from 'react';
import AvatarCanvas from '@/components/AvatarCanvas';
import { DEFAULT_CONFIG, FORMS, sanitizeConfig, type AvatarConfig, type Form } from '@/lib/livia';

const STORAGE_KEY = 'livia-config';

export default function DashboardPage() {
  const [cfg, setCfg] = useState<AvatarConfig>(DEFAULT_CONFIG);
  const [command, setCommand] = useState('become a spaceship');
  const [output, setOutput] = useState('');

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        setCfg(sanitizeConfig(JSON.parse(raw)));
      }
    } catch {
      // Local storage unavailable: use defaults.
    }
  }, []);

  function update(next: Partial<AvatarConfig>) {
    const merged = sanitizeConfig({ ...cfg, ...next });
    setCfg(merged);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
    } catch {
      // Ignore storage write failures.
    }
  }

  async function runCommand() {
    setOutput('Working...');
    try {
      const res = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: command })
      });
      const json = await res.json();
      setOutput(JSON.stringify(json, null, 2));

      if (json.ok && json.command?.action === 'transform') {
        update({ form: json.command.form });
      }
      if (json.ok && json.command?.action === 'scale') {
        update({ size: json.command.value });
      }
    } catch {
      setOutput('Command service unavailable. Local controls still work.');
    }
  }

  function exportConfig() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'livia-avatar.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main>
      <nav>
        <b>LIVIA</b>
        <span><a href="/">Home</a></span>
      </nav>

      <section>
        <h2>My Avatar</h2>
        <div className="demo-shell" style={{ height: 250, marginTop: 14 }}>
          <AvatarCanvas form={cfg.form} color={cfg.color} size={cfg.size} />
        </div>

        <label>Name</label>
        <input value={cfg.name} onChange={(e) => update({ name: e.target.value })} />

        <label>Form</label>
        <select value={cfg.form} onChange={(e) => update({ form: e.target.value as Form })}>
          {FORMS.map((shape) => (
            <option key={shape} value={shape}>{shape}</option>
          ))}
        </select>

        <label>Colour</label>
        <input type="color" value={cfg.color} onChange={(e) => update({ color: e.target.value })} />

        <label>Size ({cfg.size.toFixed(2)}x)</label>
        <input type="range" min="0.25" max="3" step="0.05" value={cfg.size} onChange={(e) => update({ size: Number(e.target.value) })} />

        <div className="inline-row" style={{ marginTop: 18 }}>
          <button type="button" className="btn" onClick={exportConfig}>Export avatar JSON</button>
        </div>
      </section>

      <section>
        <h2>Command tester</h2>
        <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="become a spaceship" maxLength={200} />
        <div className="inline-row">
          <button type="button" className="btn" onClick={runCommand}>Run command</button>
        </div>
        {output && <pre>{output}</pre>}
      </section>

      <section>
        <h2>Permissions & privacy</h2>
        <p className="card" style={{ color: 'var(--muted)' }}>
          The extension asks for the minimum required access and only inspects visible page content; private forms, passwords and payment fields are never processed.
        </p>
      </section>
    </main>
  );
}
