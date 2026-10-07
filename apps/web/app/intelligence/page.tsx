'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';

const API_URL = 'http://127.0.0.1:4320';

type Source = {
  source_id: string;
  url: string;
  source_name: string;
  source_type: string;
  authority_level: string;
  jurisdiction: string;
  last_crawled: string | null;
};

type Change = {
  change_id: string;
  change_types: string[];
  summary: string;
  evidence: Array<{ kind: string; block_type: string; excerpt: string }>;
  significance: string;
  confidence: number;
  detected_at: string;
  source_name: string;
  source_url: string;
  authority_level: string;
  authority_score: number;
  canonical_url: string;
  title: string;
  previous_version: number | null;
  current_version: number;
};

async function readResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) throw new Error(payload.error || `Request failed (${response.status}).`);
  return payload as T;
}

export default function IntelligencePage() {
  const [token, setToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceType, setSourceType] = useState('GOVERNMENT');
  const [authority, setAuthority] = useState('OFFICIAL');
  const [jurisdiction, setJurisdiction] = useState('');
  const [status, setStatus] = useState('Connect to the local intelligence service.');
  const [busy, setBusy] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<{ ok: boolean; service?: string; database?: string } | null>(null);

  const rolloutSources = [
    { name: 'Karnataka Transport Department', url: 'https://transport.karnataka.gov.in/notices', reason: 'Official licensing and appointment notices' },
    { name: 'Ministry of Road Transport & Highways', url: 'https://morth.gov.in/', reason: 'National transport policy and public notices' },
    { name: 'State public notice RSS feeds', url: 'https://example.gov.in/feed.xml', reason: 'Feed-based official notice stream' },
    { name: 'Regional authority boards', url: 'https://example.gov.in/authorities', reason: 'Rule changes and publication updates' }
  ];

  async function api<T>(path: string, init: RequestInit = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        authorization: `Bearer ${token}`,
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...init.headers
      }
    });
    return readResponse<T>(response);
  }

  async function refreshSources() {
    const result = await api<{ sources: Source[] }>('/api/sources');
    setSources(result.sources);
  }

  async function refreshChanges() {
    const result = await api<{ changes: Change[] }>('/api/changes?limit=50');
    setChanges(result.changes);
  }

  async function connect() {
    if (token.trim().length < 32) {
      setStatus('Enter the 32+ character local intelligence token from .env.');
      return;
    }
    setBusy(true);
    try {
      const healthResponse = await fetch(`${API_URL}/api/health`, { cache: 'no-store', credentials: 'omit' });
      const health = await readResponse<{ ok: boolean; service?: string; database?: string }>(healthResponse);
      if (!health.ok) throw new Error('Local service health check failed.');
      setConnected(true);
      setServiceStatus(health);
      await Promise.all([refreshSources(), refreshChanges()]);
      setStatus('Connected. Only registered sources are monitored.');
    } catch (error) {
      setConnected(false);
      setStatus(error instanceof Error ? error.message : 'Could not connect to local intelligence service.');
    } finally {
      setBusy(false);
    }
  }

  async function addSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await api('/api/sources', {
        method: 'POST',
        body: JSON.stringify({
          url: sourceUrl,
          source_name: sourceName,
          source_type: sourceType,
          authority_level: authority,
          jurisdiction
        })
      });
      setSourceName('');
      setSourceUrl('');
      setStatus('Source registered. Its first crawl is queued by the scheduler.');
      await refreshSources();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not register source.');
    } finally {
      setBusy(false);
    }
  }

  async function crawlSource(sourceId: string) {
    setBusy(true);
    setStatus('Crawling registered source, checking robots.txt, and comparing versions…');
    try {
      const result = await api<{ ok: boolean; skipped?: boolean; pagesFetched?: number; pagesChanged?: number; changesDetected?: number; error?: string }>('/api/crawl', {
        method: 'POST', body: JSON.stringify({ sourceId })
      });
      setStatus(result.skipped ? 'Crawl skipped because the configured interval has not elapsed.' : `Crawl complete: ${result.pagesFetched} page(s) fetched; ${result.pagesChanged} version(s) changed; ${result.changesDetected} structural change(s). Impact remains unassessed.`);
      await Promise.all([refreshSources(), refreshChanges()]);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Crawl failed.');
    } finally {
      setBusy(false);
    }
  }

  async function loadChange(changeId: string) {
    try {
      const result = await api<{ change: Change & { previous_text: string | null; current_text: string } }>(`/api/changes/${changeId}`);
      const detail = result.change;
      setStatus(`Evidence detail loaded for ${detail.title || detail.source_name}; versions ${detail.previous_version ?? 'initial'} → ${detail.current_version}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not load change detail.');
    }
  }

  return (
    <main className="intelligence-page">
      <header className="intelligence-header">
        <Link href="/" className="brand-lockup"><span className="brand-mark">L</span><span>LIVIA</span></Link>
        <nav aria-label="Intelligence navigation"><Link href="/">Home</Link><Link href="/dashboard">Avatar</Link></nav>
      </header>

      <section className="intelligence-intro">
        <p className="eyebrow">Continuous intelligence · local MVP</p>
        <h1>Changes that matter, with evidence.</h1>
        <p>Monitor registered official and public sources. Cosmetic edits are normalized away; structural changes retain prior versions and source excerpts. Impact is not inferred in this phase.</p>
      </section>

      <section className="intelligence-connect" aria-labelledby="connect-heading">
        <div><h2 id="connect-heading">Local service</h2><p>{status}</p>{serviceStatus ? <p className="eyebrow">{serviceStatus.service} · {serviceStatus.database}</p> : null}</div>
        <div className="intelligence-connect__controls">
          <input aria-label="Intelligence service token" type="password" autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} placeholder="Local service token" />
          <button type="button" className="btn solid-btn" onClick={connect} disabled={busy}>{connected ? 'Refresh' : 'Connect'}</button>
        </div>
      </section>

      {connected && <>
        <section className="intelligence-workspace" aria-label="Monitor sources">
          <div className="intelligence-source-form">
            <p className="eyebrow">Source registry</p>
            <h2>Add an authoritative source</h2>
            <form onSubmit={addSource}>
              <label>Source name<input required maxLength={160} value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Karnataka Transport Department" /></label>
              <label>HTTPS page or feed<input required type="url" maxLength={2000} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /></label>
              <div className="intelligence-form-row">
                <label>Type<select value={sourceType} onChange={(event) => setSourceType(event.target.value)}><option value="GOVERNMENT">Government</option><option value="PUBLIC">Public notice/data</option><option value="CORPORATE">Company</option><option value="NEWS">News</option><option value="OTHER">Other</option></select></label>
                <label>Authority<select value={authority} onChange={(event) => setAuthority(event.target.value)}><option value="PRIMARY">Primary</option><option value="OFFICIAL">Official</option><option value="REGULATORY">Regulatory</option><option value="SECONDARY">Secondary</option><option value="NEWS">News</option><option value="COMMUNITY">Community</option><option value="UNKNOWN">Unknown</option></select></label>
              </div>
              <label>Jurisdiction<input maxLength={160} value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} placeholder="Bengaluru, Karnataka, India" /></label>
              <button type="submit" className="btn solid-btn" disabled={busy}>Register source</button>
            </form>
          </div>

          <div className="intelligence-sources">
            <div className="intelligence-section-heading"><div><p className="eyebrow">Watchlist</p><h2>Registered sources</h2></div><button type="button" className="btn ghost-btn" onClick={() => void refreshSources()} disabled={busy}>Refresh</button></div>
            {sources.length === 0 ? <p className="intelligence-empty">No sources registered. Add an official HTTPS page or RSS/Atom feed to begin.</p> : sources.map((source) => (
              <article className="intelligence-source" key={source.source_id}>
                <div><h3>{source.source_name}</h3><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><p>{source.source_type} · {source.authority_level} · {source.jurisdiction || 'Jurisdiction unspecified'}</p></div>
                <button type="button" className="btn ghost-btn" onClick={() => void crawlSource(source.source_id)} disabled={busy}>Crawl now</button>
              </article>
            ))}
          </div>
        </section>

        <section className="intelligence-changes">
          <div className="intelligence-section-heading"><div><p className="eyebrow">Versioned evidence</p><h2>Detected changes</h2></div><button type="button" className="btn ghost-btn" onClick={() => void refreshChanges()} disabled={busy}>Refresh changes</button></div>
          {changes.length === 0 ? <p className="intelligence-empty">No changes detected yet. First crawls create a baseline; only later structural differences appear here.</p> : changes.map((change) => (
            <article className="intelligence-change" key={change.change_id}>
              <div className="intelligence-change__meta"><span>{change.significance}</span><span>{change.authority_level} source · {Math.round(change.authority_score * 100)} authority</span><time>{new Date(change.detected_at).toLocaleString()}</time></div>
              <h3>{change.title || change.source_name}</h3>
              <p>{change.summary}</p>
              <p className="intelligence-change__types">{change.change_types.join(' · ')} · confidence {Math.round(change.confidence * 100)}% · versions {change.previous_version} → {change.current_version}</p>
              <ul>{change.evidence.map((item, index) => <li key={`${item.kind}-${index}`}><strong>{item.kind}:</strong> {item.excerpt}</li>)}</ul>
              <div className="intelligence-change__actions"><a href={change.canonical_url} target="_blank" rel="noreferrer">Open original source</a><button type="button" className="btn ghost-btn" onClick={() => void loadChange(change.change_id)}>Compare versions</button></div>
              <p className="intelligence-unassessed">Impact: unassessed. No action recommendation has been generated.</p>
            </article>
          ))}
        </section>
      </>}
    </main>
  );
}
