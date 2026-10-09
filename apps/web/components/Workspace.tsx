'use client';

import { startTransition, useEffect, useState } from 'react';
import AvatarCanvas from '@/components/AvatarCanvas';
import { DEFAULT_CONFIG, FORMS, sanitizeConfig, type AvatarConfig, type Form } from '@/lib/livia';

type AgentProfile = AvatarConfig & { id: string; paused: boolean };
type Project = { id: string; name: string; goal: string; createdAt: string };
type MemoryNote = { id: string; text: string; createdAt: string };
type ActivityEvent = { id: string; text: string; result: string; createdAt: string };
type WorkspaceData = { agents: AgentProfile[]; selectedAgent: string; projects: Project[]; memories: MemoryNote[]; activity: ActivityEvent[] };
type Section = 'command' | 'agents' | 'projects' | 'activity' | 'memory' | 'integrations' | 'rules' | 'research' | 'usage';

const STORAGE_KEY = 'livia-workspace-v1';
const sections: Array<{ id: Section; label: string; icon: string }> = [
  { id: 'command', label: 'Command center', icon: '⌘' },
  { id: 'agents', label: 'My agents', icon: '◉' },
  { id: 'projects', label: 'Projects', icon: '▤' },
  { id: 'activity', label: 'Activity', icon: '↗' },
  { id: 'memory', label: 'Memory', icon: '▧' },
  { id: 'integrations', label: 'Integrations', icon: '⌁' },
  { id: 'rules', label: 'Rules & approvals', icon: '⛨' },
  { id: 'research', label: 'Research', icon: '⌕' },
  { id: 'usage', label: 'Usage & health', icon: '◷' }
];

function makeId() {
  return crypto.randomUUID();
}

function localTimestamp() {
  return new Date().toISOString();
}

function createInitialData(): WorkspaceData {
  const config = DEFAULT_CONFIG;
  return {
    agents: [{ ...config, id: 'livia-local', paused: false }],
    selectedAgent: 'livia-local',
    projects: [],
    memories: [],
    activity: []
  };
}

function safeWorkspaceData(value: unknown): WorkspaceData {
  if (!value || typeof value !== 'object') return createInitialData();
  const raw = value as Partial<WorkspaceData>;
  const agents = Array.isArray(raw.agents) ? raw.agents.filter((agent) => agent && typeof agent.id === 'string').map((agent) => ({
    ...sanitizeConfig(agent),
    id: agent.id,
    paused: Boolean(agent.paused)
  })) : [];
  const projects = Array.isArray(raw.projects) ? raw.projects.filter((item) => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.goal === 'string') : [];
  const memories = Array.isArray(raw.memories) ? raw.memories.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string') : [];
  const activity = Array.isArray(raw.activity) ? raw.activity.filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && typeof item.result === 'string') : [];
  const selectedAgent = agents.some((agent) => agent.id === raw.selectedAgent) ? raw.selectedAgent as string : agents[0]?.id || 'livia-local';
  return { agents, selectedAgent, projects, memories, activity };
}

export default function Workspace() {
  const [data, setData] = useState<WorkspaceData>(createInitialData);
  const [ready, setReady] = useState(false);
  const [section, setSection] = useState<Section>('command');
  const [command, setCommand] = useState('');
  const [commandStatus, setCommandStatus] = useState('');
  const [working, setWorking] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [memoryText, setMemoryText] = useState('');
  const [editingMemory, setEditingMemory] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const [researchQuery, setResearchQuery] = useState('');
  const [health, setHealth] = useState<'checking' | 'available' | 'unavailable'>('checking');

  useEffect(() => {
    let restored = createInitialData();
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) restored = safeWorkspaceData(JSON.parse(saved));
      else {
        const oldConfig = localStorage.getItem('livia-config');
        if (oldConfig) {
          const config = sanitizeConfig(JSON.parse(oldConfig));
          restored = { ...createInitialData(), agents: [{ ...config, id: 'livia-local', paused: false }] };
        }
      }
    } catch {}
    startTransition(() => {
      setData(restored);
      setReady(true);
    });
    fetch('/api/health').then((response) => setHealth(response.ok ? 'available' : 'unavailable')).catch(() => setHealth('unavailable'));
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      const selected = data.agents.find((agent) => agent.id === data.selectedAgent);
      if (selected) localStorage.setItem('livia-config', JSON.stringify(selected));
    } catch {
      // Browser storage may be unavailable or full.
    }
  }, [data, ready]);

  const activeAgent = data.agents.find((agent) => agent.id === data.selectedAgent) || null;

  function addActivity(text: string, result: string) {
    setData((current) => ({
      ...current,
      activity: [{ id: makeId(), text, result, createdAt: localTimestamp() }, ...current.activity].slice(0, 50)
    }));
  }

  function updateAgent(patch: Partial<AvatarConfig> & { paused?: boolean }) {
    if (!activeAgent) return;
    setData((current) => ({
      ...current,
      agents: current.agents.map((agent) => agent.id === current.selectedAgent ? { ...agent, ...sanitizeConfig({ ...agent, ...patch }), paused: patch.paused ?? agent.paused } : agent)
    }));
  }

  async function runCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!command.trim() || !activeAgent || working) return;
    if (activeAgent.paused) {
      setCommandStatus('This local profile is paused. Resume it before applying avatar commands.');
      return;
    }
    setWorking(true);
    setCommandStatus('Checking the supported local command set...');
    try {
      const response = await fetch('/api/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: command.trim() })
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setCommandStatus(result.error || 'The command was not accepted.');
        addActivity(command.trim(), 'Not executed');
      } else if (result.command.action === 'transform') {
        updateAgent({ form: result.command.form as Form });
        setCommandStatus(`${activeAgent.name} changed form to ${result.command.form}. Applied in this browser.`);
        addActivity(command.trim(), 'Applied to local avatar');
      } else if (result.command.action === 'scale') {
        updateAgent({ size: result.command.value });
        setCommandStatus(`${activeAgent.name} size set to ${result.command.value}x. Applied in this browser.`);
        addActivity(command.trim(), 'Applied to local avatar');
      } else {
        setCommandStatus('This command needs the browser extension on an authorized site. It was not executed here.');
        addActivity(command.trim(), 'Not executed; browser extension required');
      }
    } catch {
      setCommandStatus('The local command service is unavailable. No action was taken.');
      addActivity(command.trim(), 'Not executed; service unavailable');
    } finally {
      setWorking(false);
    }
  }

  function createAgent(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = agentName.trim().slice(0, 30);
    if (!name) return;
    const agent: AgentProfile = { ...DEFAULT_CONFIG, id: makeId(), name, paused: false };
    setData((current) => ({ ...current, agents: [...current.agents, agent], selectedAgent: agent.id }));
    setAgentName('');
    addActivity(`Created local profile ${name}`, 'Saved on this device');
  }

  function createProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = projectName.trim().slice(0, 80);
    const goal = projectGoal.trim().slice(0, 1_000);
    if (!name || !goal) return;
    const project = { id: makeId(), name, goal, createdAt: localTimestamp() };
    setData((current) => ({ ...current, projects: [project, ...current.projects] }));
    setProjectName('');
    setProjectGoal('');
    addActivity(`Saved project notes for ${name}`, 'Saved on this device; no task was submitted');
  }

  function addMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = memoryText.trim().slice(0, 1_000);
    if (!text) return;
    setData((current) => ({ ...current, memories: [{ id: makeId(), text, createdAt: localTimestamp() }, ...current.memories] }));
    setMemoryText('');
    addActivity('Added a browser-local memory note', 'Saved on this device; not provided to a model');
  }

  function exportMemories() {
    const blob = new Blob([JSON.stringify(data.memories, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'livia-memory-export.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportAgent() {
    if (!activeAgent) return;
    const config = { name: activeAgent.name, form: activeAgent.form, color: activeAgent.color, size: activeAgent.size };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'livia-avatar.json';
    link.click();
    URL.revokeObjectURL(url);
  }

  function deleteMemory(id: string) {
    setData((current) => ({ ...current, memories: current.memories.filter((note) => note.id !== id) }));
  }

  function saveMemoryEdit(id: string) {
    const text = editingMemoryText.trim().slice(0, 1_000);
    if (!text) return;
    setData((current) => ({ ...current, memories: current.memories.map((note) => note.id === id ? { ...note, text } : note) }));
    setEditingMemory(null);
    setEditingMemoryText('');
    addActivity('Corrected a browser-local memory note', 'Updated on this device; not provided to a model');
  }

  function clearLocalData() {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('livia-config');
    setData(createInitialData());
    setCommandStatus('Browser-local workspace data deleted.');
  }

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <a className="workspace-brand" href="/" aria-label="Livia workspace home">
          <span className="workspace-brand__mark">L</span>
          <span><strong>LIVIA</strong><small>PERSONAL WORKSPACE</small></span>
        </a>
        <div className="sidebar-label">WORKSPACE</div>
        <nav className="workspace-nav" aria-label="Workspace sections">
          {sections.map((item) => (
            <button key={item.id} type="button" className={section === item.id ? 'workspace-nav__item active' : 'workspace-nav__item'} onClick={() => setSection(item.id)} aria-current={section === item.id ? 'page' : undefined}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span><span>{item.label}</span>
              {item.id === 'agents' && <span className="nav-count">{data.agents.length}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="local-badge"><span className="status-light" /> LOCAL DEVICE</div>
          <p>Profiles and notes stay in this browser. Cloud sync is not configured.</p>
          <a href="/demo" className="sidebar-demo-link">Open LIVIA demo <span aria-hidden="true">↗</span></a>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="workspace-topbar">
          <div className="breadcrumbs"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{sections.find((item) => item.id === section)?.label}</strong></div>
          <div className="topbar-state"><span className={`health-indicator ${health}`} />{health === 'checking' ? 'Checking service' : health === 'available' ? 'Web service available' : 'Web service unavailable'}<span className="topbar-divider" />AUTH NOT CONFIGURED</div>
        </header>

        <div className="workspace-content">
          {section === 'command' && (
            <>
              <div className="page-heading">
                <div><p className="eyebrow">LIVIA / COMMAND CENTER</p><h1>Make something move.</h1><p>Control a companion profile in this browser. This is not an autonomous task runner.</p></div>
                <div className="heading-chip"><span className="status-light" />LOCAL COMMANDS</div>
              </div>
              <div className="command-layout">
                <section className="surface command-panel">
                  <div className="surface-heading"><div><span className="section-kicker">01 / DIRECT</span><h2>Tell LIVIA what to do</h2></div><span className="pill pill--quiet">Deterministic controls</span></div>
                  <form className="command-form" onSubmit={runCommand}>
                    <label className="sr-only" htmlFor="workspace-command">Enter an avatar command</label>
                    <input id="workspace-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Try: become a spaceship" maxLength={200} />
                    <button type="submit" className="icon-button send-button" aria-label="Run command" title="Run command" disabled={working || !activeAgent}>↗</button>
                  </form>
                  {commandStatus && <p className="command-feedback" aria-live="polite">{working && <span className="spinner" />}{commandStatus}</p>}
                  <div className="suggestion-row"><span>TRY</span>{['become a spaceship', 'get tiny', 'get huge'].map((value) => <button key={value} type="button" onClick={() => setCommand(value)}>{value}</button>)}</div>
                  <div className="capability-note"><span className="note-icon">i</span><p>Only form and size commands are applied here. Browser actions require the extension; project execution, tools, and model chat are not connected.</p></div>
                </section>

                <section className="surface avatar-panel">
                  <div className="surface-heading"><div><span className="section-kicker">02 / COMPANION</span><h2>{activeAgent?.name || 'No profile selected'}</h2></div><span className={activeAgent?.paused ? 'pill pill--paused' : 'pill pill--local'}>{activeAgent?.paused ? 'PAUSED' : 'LOCAL PROFILE'}</span></div>
                  <div className="avatar-stage">{activeAgent && <AvatarCanvas form={activeAgent.form} color={activeAgent.color} size={activeAgent.size} className="arena-canvas" />}</div>
                  <div className="avatar-controls">
                    <label>FORM<select value={activeAgent?.form || DEFAULT_CONFIG.form} onChange={(event) => updateAgent({ form: event.target.value as Form })} disabled={!activeAgent || activeAgent.paused}>{FORMS.map((form) => <option value={form} key={form}>{form}</option>)}</select></label>
                    <label>COLOR<input aria-label="Companion color" type="color" value={activeAgent?.color || DEFAULT_CONFIG.color} onChange={(event) => updateAgent({ color: event.target.value })} disabled={!activeAgent || activeAgent.paused} /></label>
                    <label>SIZE <span>{(activeAgent?.size || 1).toFixed(2)}x</span><input aria-label="Companion size" type="range" min="0.25" max="3" step="0.05" value={activeAgent?.size || 1} onChange={(event) => updateAgent({ size: Number(event.target.value) })} disabled={!activeAgent || activeAgent.paused} /></label>
                  </div>
                </section>
              </div>
              <section className="capability-strip" aria-label="Connection status">
                <div><span className="capability-glyph">01</span><span><strong>Profile</strong><small>Saved in this browser</small></span><b className="state-local">LOCAL</b></div>
                <div><span className="capability-glyph">02</span><span><strong>AI runtime</strong><small>Not connected to web UI</small></span><b className="state-off">OFFLINE</b></div>
                <div><span className="capability-glyph">03</span><span><strong>Workspace</strong><small>Sandbox not configured</small></span><b className="state-off">OFFLINE</b></div>
              </section>
              <div className="lower-grid">
                <section className="surface compact-surface"><div className="surface-heading"><div><span className="section-kicker">RECENT</span><h2>Activity</h2></div><button className="text-button" onClick={() => setSection('activity')}>View all <span aria-hidden="true">→</span></button></div>{data.activity.length ? data.activity.slice(0, 3).map((item) => <ActivityRow key={item.id} item={item} />) : <EmptyState title="Nothing has happened yet" text="Commands you apply here will appear in this list." />}</section>
                <section className="surface compact-surface"><div className="surface-heading"><div><span className="section-kicker">PROJECTS</span><h2>Keep a goal nearby</h2></div><button className="text-button" onClick={() => setSection('projects')}>Open projects <span aria-hidden="true">→</span></button></div><p className="muted-copy">Project notes can be saved on this device. No background execution queue is connected.</p><button className="outline-button" onClick={() => setSection('projects')}>＋ Create project notes</button></section>
              </div>
            </>
          )}

          {section === 'agents' && (
            <>
              <PageHeading eyebrow="WORKSPACE / PROFILES" title="My agents" text="Create and manage local companion profiles. These are not autonomous workers and do not have independent model instructions." />
              <div className="agent-layout">
                <section className="surface agent-list"><div className="surface-heading"><div><span className="section-kicker">ON THIS DEVICE</span><h2>{data.agents.length} profile{data.agents.length === 1 ? '' : 's'}</h2></div></div>
                  {data.agents.length ? data.agents.map((agent) => <button key={agent.id} className={data.selectedAgent === agent.id ? 'agent-row selected' : 'agent-row'} onClick={() => setData((current) => ({ ...current, selectedAgent: agent.id }))}><span className="agent-avatar" style={{ '--agent-color': agent.color } as React.CSSProperties}>{agent.name.slice(0, 1).toUpperCase()}</span><span className="agent-row__copy"><strong>{agent.name}</strong><small>{agent.form} · {agent.paused ? 'Paused' : 'Available locally'}</small></span><span className="agent-row__arrow">→</span></button>) : <EmptyState title="No profiles yet" text="Create a local companion profile to get started." />}
                </section>
                <div className="agent-detail-column">
                  {activeAgent ? <section className="surface profile-editor"><div className="surface-heading"><div><span className="section-kicker">PROFILE SETTINGS</span><h2>{activeAgent.name}</h2></div><div className="heading-actions"><button className="text-button" onClick={exportAgent}>Export JSON ↓</button><button className={activeAgent.paused ? 'outline-button' : 'outline-button danger-button'} onClick={() => updateAgent({ paused: !activeAgent.paused })}>{activeAgent.paused ? 'Resume profile' : 'Pause profile'}</button></div></div>
                    <label className="field-label">Display name<input value={activeAgent.name} maxLength={30} onChange={(event) => updateAgent({ name: event.target.value })} /></label>
                    <label className="field-label">Avatar form<select value={activeAgent.form} onChange={(event) => updateAgent({ form: event.target.value as Form })}>{FORMS.map((form) => <option key={form}>{form}</option>)}</select></label>
                    <div className="inline-status"><span className="status-light" />Changes are saved to this browser automatically.</div>
                  </section> : <section className="surface"><EmptyState title="Select a profile" text="Choose a local profile to edit its appearance." /></section>}
                  <section className="surface create-panel"><div className="surface-heading"><div><span className="section-kicker">NEW PROFILE</span><h2>Add a companion</h2></div></div><form className="inline-form" onSubmit={createAgent}><label className="sr-only" htmlFor="new-agent-name">Profile name</label><input id="new-agent-name" value={agentName} onChange={(event) => setAgentName(event.target.value)} placeholder="Name this profile" maxLength={30} required /><button className="primary-button" type="submit">Create profile</button></form></section>
                </div>
              </div>
            </>
          )}

          {section === 'projects' && (
            <>
              <PageHeading eyebrow="WORKSPACE / PROJECTS" title="Projects" text="Keep goals and context together on this device. Saving project notes does not submit work to an agent." />
              <section className="surface project-create"><div className="surface-heading"><div><span className="section-kicker">NEW PROJECT NOTES</span><h2>What are you working toward?</h2></div><span className="pill pill--quiet">BROWSER STORAGE</span></div><form className="project-form" onSubmit={createProject}><label className="field-label">Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="A clear, memorable name" maxLength={80} required /></label><label className="field-label">Goal or brief<textarea value={projectGoal} onChange={(event) => setProjectGoal(event.target.value)} placeholder="Write down the outcome you want to reach..." maxLength={1_000} rows={4} required /></label><div className="form-footer"><span>Stored locally. No task will be created.</span><button type="submit" className="primary-button">Save project notes <span aria-hidden="true">→</span></button></div></form></section>
              <section className="project-list"><div className="list-heading"><h2>Saved projects</h2><span>{data.projects.length} on this device</span></div>{data.projects.length ? data.projects.map((project) => <article className="surface project-row" key={project.id}><div className="project-mark">▤</div><div className="project-copy"><h3>{project.name}</h3><p>{project.goal}</p><small>Notes saved {new Date(project.createdAt).toLocaleString()}</small></div><span className="pill pill--quiet">NOT EXECUTING</span><button className="icon-button remove-button" aria-label={`Delete ${project.name}`} title="Delete project" onClick={() => setData((current) => ({ ...current, projects: current.projects.filter((item) => item.id !== project.id) }))}>×</button></article>) : <EmptyState title="No projects saved" text="Add project notes above. Task planning and durable execution are not configured." />}</section>
            </>
          )}

          {section === 'activity' && (
            <><PageHeading eyebrow="WORKSPACE / AUDIT TRAIL" title="Activity" text="A record of actions taken from this browser workspace. No background worker is connected." /><section className="surface activity-list"><div className="surface-heading"><div><span className="section-kicker">LOCAL EVENT LOG</span><h2>{data.activity.length} recorded event{data.activity.length === 1 ? '' : 's'}</h2></div><span className="pill pill--quiet">THIS DEVICE ONLY</span></div>{data.activity.length ? data.activity.map((item) => <ActivityRow key={item.id} item={item} detailed />) : <EmptyState title="No activity recorded" text="Real local changes and command attempts will show here. No sample events are included." />}</section></>
          )}

          {section === 'memory' && (
            <><PageHeading eyebrow="WORKSPACE / MEMORY" title="Memory" text="Write down notes you want to keep in this browser. Notes are editable and deletable, and are not currently sent to a model." /><section className="surface memory-compose"><form onSubmit={addMemory}><label className="field-label" htmlFor="memory-note">Add a note</label><textarea id="memory-note" value={memoryText} onChange={(event) => setMemoryText(event.target.value)} placeholder="A preference, correction, or useful context..." rows={3} maxLength={1_000} /><div className="form-footer"><span>Private to this browser profile</span><button className="primary-button" type="submit">Save note</button></div></form></section><div className="list-heading memory-list-heading"><h2>Saved notes</h2><div><span>{data.memories.length} notes</span>{data.memories.length > 0 && <button className="text-button" onClick={exportMemories}>Export JSON ↓</button>}</div></div><section className="memory-list">{data.memories.length ? data.memories.map((note) => <article className="surface memory-row" key={note.id}><div className="memory-symbol">“</div><div className="memory-copy">{editingMemory === note.id ? <><label className="sr-only" htmlFor={`edit-memory-${note.id}`}>Edit memory note</label><textarea id={`edit-memory-${note.id}`} className="memory-edit-input" value={editingMemoryText} maxLength={1_000} onChange={(event) => setEditingMemoryText(event.target.value)} /><div className="memory-edit-actions"><button className="text-button" onClick={() => saveMemoryEdit(note.id)}>Save changes</button><button className="text-button" onClick={() => setEditingMemory(null)}>Cancel</button></div></> : <><p>{note.text}</p><small>Saved {new Date(note.createdAt).toLocaleString()}</small></>}</div>{editingMemory !== note.id && <button className="icon-button edit-button" aria-label="Edit memory note" title="Edit note" onClick={() => { setEditingMemory(note.id); setEditingMemoryText(note.text); }}>✎</button>}<button className="icon-button remove-button" aria-label="Delete memory note" title="Delete note" onClick={() => deleteMemory(note.id)}>×</button></article>) : <EmptyState title="No saved memories" text="Nothing is remembered until you add a note." />}</section></>
          )}

          {section === 'integrations' && (
            <><PageHeading eyebrow="WORKSPACE / CONNECTIONS" title="Integrations" text="External services are never shown as connected unless they have been authenticated and verified." /><div className="integration-banner"><span className="banner-icon">i</span><div><strong>Connections are not configured</strong><p>This frontend has no OAuth flow or credential store. No accounts or API calls are claimed.</p></div></div><div className="integration-grid">{[['Local model runtime', 'Ollama-compatible local agent API', 'Not connected to this web app'], ['Database', 'PostgreSQL persistence', 'Not configured'], ['Job queue', 'Durable task processing', 'Not configured'], ['Sandbox', 'Isolated code and browser execution', 'Not configured'], ['GitHub', 'Repository and pull request access', 'Not connected'], ['Calendar and email', 'Read-only access and approval-gated drafts', 'Not connected']].map(([name, detail, state]) => <article className="surface integration-row" key={name}><span className="integration-glyph">⌁</span><div><h2>{name}</h2><p>{detail}</p><small><span className="health-indicator unavailable" />{state}</small></div><span className="pill pill--quiet">NOT CONFIGURED</span></article>)}</div></>
          )}

          {section === 'rules' && (
            <><PageHeading eyebrow="WORKSPACE / SAFETY" title="Rules & approvals" text="The web command parser can only adjust local avatar appearance. It cannot send messages, access accounts, or execute code." /><div className="safety-banner"><span className="safety-mark">⛨</span><div><strong>External actions are unavailable</strong><p>There is no connected tool registry or permission engine. Consequential actions cannot be initiated from this workspace.</p></div><span className="pill pill--secure">BLOCKED BY DEFAULT</span></div><section className="surface rule-list"><div className="surface-heading"><div><span className="section-kicker">DEFAULT BOUNDARIES</span><h2>Actions requiring a real approval system</h2></div></div>{[['External messages', 'Email, chat, or public posts'], ['Publishing & deployment', 'Pull requests, merges, releases, production changes'], ['Financial actions', 'Purchases, subscriptions, or paid resource use'], ['Destructive changes', 'Deleting files, data, or changing security settings']].map(([title, detail]) => <div className="rule-row" key={title}><span className="rule-lock">⊘</span><span><strong>{title}</strong><small>{detail}</small></span><b>UNAVAILABLE</b></div>)}</section><p className="muted-copy safety-footnote">No automation rules can be granted until an authenticated backend enforces and audits them.</p></>
          )}

          {section === 'research' && (
            <><PageHeading eyebrow="WORKSPACE / RESEARCH" title="Research" text="Search the public web manually, then keep your own source notes here. LIVIA does not crawl or monitor sources in the background." /><section className="surface research-search"><span className="section-kicker">MANUAL WEB SEARCH</span><form className="command-form" onSubmit={(event) => { event.preventDefault(); if (researchQuery.trim()) window.open(`https://www.google.com/search?q=${encodeURIComponent(researchQuery.trim())}`, '_blank', 'noopener,noreferrer'); }}><label className="sr-only" htmlFor="research-query">Search the public web</label><input id="research-query" value={researchQuery} onChange={(event) => setResearchQuery(event.target.value)} placeholder="Search a topic in your browser" maxLength={180} /><button type="submit" className="primary-button">Open search ↗</button></form><p className="muted-copy">Search opens a new tab. Results are not fetched, summarized, or stored by this app.</p></section><div className="research-empty"><span className="research-orbit">⌕</span><h2>No research sources collected</h2><p>There are no verified evidence records or monitoring schedules in this workspace.</p></div></>
          )}

          {section === 'usage' && (
            <><PageHeading eyebrow="WORKSPACE / SYSTEM STATUS" title="Usage & health" text="Only live checks and measured usage are shown. No resource or model metrics are estimated." /><section className="surface health-panel"><div className="surface-heading"><div><span className="section-kicker">SERVICE CHECKS</span><h2>Current configuration</h2></div><span className={health === 'available' ? 'pill pill--local' : 'pill pill--quiet'}>{health === 'checking' ? 'CHECKING' : health === 'available' ? 'WEB ONLINE' : 'WEB OFFLINE'}</span></div><div className="health-row"><span><span className={`health-indicator ${health}`} /><strong>Next.js web service</strong><small>Checked from this browser session</small></span><b>{health === 'checking' ? 'CHECKING' : health === 'available' ? 'AVAILABLE' : 'UNAVAILABLE'}</b></div><div className="health-row"><span><span className="health-indicator unavailable" /><strong>Local AI service</strong><small>Separate process; not connected to this UI</small></span><b>NOT CONNECTED</b></div><div className="health-row"><span><span className="health-indicator unavailable" /><strong>Database, queue & sandbox</strong><small>No durable orchestration services configured</small></span><b>NOT CONFIGURED</b></div></section><section className="surface usage-empty"><div className="section-kicker">MEASURED USAGE</div><h2>No usage data available</h2><p>Model calls, execution time, and resource consumption are not tracked because no model or worker is connected.</p></section><section className="surface data-controls"><div><span className="section-kicker">LOCAL DATA</span><h2>Clear this browser workspace</h2><p>Deletes local profiles, project notes, memory notes, and activity records.</p></div><button className="outline-button danger-button" onClick={clearLocalData}>Delete local data</button></section></>
          )}

          <footer className="workspace-footer"><span>LIVIA / LOCAL WORKSPACE</span><span>Profiles, projects, notes, and activity are stored in this browser only.</span></footer>
        </div>
      </div>
    </main>
  );
}

function PageHeading({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return <div className="page-heading"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{text}</p></div><div className="heading-chip"><span className="status-light" />LOCAL DEVICE</div></div>;
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><span className="empty-mark" aria-hidden="true">—</span><strong>{title}</strong><p>{text}</p></div>;
}

function ActivityRow({ item, detailed = false }: { item: ActivityEvent; detailed?: boolean }) {
  return <div className={detailed ? 'activity-row detailed' : 'activity-row'}><span className="activity-mark" aria-hidden="true">↗</span><div className="activity-copy"><strong>{item.text}</strong>{detailed && <small>{item.result}</small>}<time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div><span className="activity-result">{item.result}</span></div>;
}