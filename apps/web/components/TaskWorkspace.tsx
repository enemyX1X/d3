'use client';

import { startTransition, useCallback, useEffect, useState } from 'react';

type ProviderStatus = { configured: boolean; available?: boolean; model: string | null };
type PageTab = { tabId: number; title: string; origin: string; enabled: boolean };
type EvidenceNode = { type: string; text: string; role?: string };
type PageEvidence = { title: string; url: string; viewport?: { width: number; height: number }; elements: EvidenceNode[] };
type PageMemory = { id: string; title: string; url: string; summary: string; timestamp: number; score?: number };
type PlanStep = { goal: string; action: 'scroll' | 'click' | 'search' | 'none'; target: string; value: string; reason: string };
type Plan = { complete: boolean; summary: string; answer: string; steps: PlanStep[] };
type PreparedAction = { approvalId: string; action: 'scroll' | 'click' | 'search'; target: { type: string; text: string; confidence: number; bounds: { x: number; y: number; w: number; h: number } }; warning: string };
type Progress = { action: 'scroll' | 'click' | 'search'; label: string; verified: true };
type ExtensionReply = { ok: boolean; error?: string; pages?: PageTab[]; connected?: boolean; providers?: { local?: ProviderStatus; openrouter?: ProviderStatus }; context?: string; memories?: PageMemory[]; page?: { title: string; origin: string }; plan?: Plan; model?: string; provider?: string; planId?: string; approvalId?: string; action?: 'scroll' | 'click' | 'search'; target?: PreparedAction['target']; warning?: string; verified?: boolean; label?: string; pending?: boolean; declined?: boolean };
type ChromeBridge = { runtime?: { sendMessage: (extensionId: string, message: unknown, callback: (response: ExtensionReply) => void) => void; lastError?: { message?: string } } };

const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID || '';
const defaultProgress: Progress[] = [];

function sendExtension(action: string, values: Record<string, unknown> = {}): Promise<ExtensionReply> {
  return new Promise((resolve, reject) => {
    const runtime = (window as unknown as { chrome?: ChromeBridge }).chrome?.runtime;
    if (!extensionId || !runtime?.sendMessage) {
      reject(new Error(extensionId ? 'LIVIA browser extension is not available in this browser.' : 'Set NEXT_PUBLIC_EXTENSION_ID and install the LIVIA extension to connect a browser page.'));
      return;
    }
    const timeout = window.setTimeout(() => reject(new Error('LIVIA extension did not respond. Check that it is enabled and reloaded.')), 15_000);
    try {
      runtime.sendMessage(extensionId, { type: 'workspace-request', action, ...values }, (response) => {
        window.clearTimeout(timeout);
        if (runtime.lastError) reject(new Error(runtime.lastError.message || 'LIVIA extension connection failed.'));
        else if (!response) reject(new Error('LIVIA extension returned no response.'));
        else resolve(response);
      });
    } catch (error) {
      window.clearTimeout(timeout);
      reject(error instanceof Error ? error : new Error('Could not connect to the LIVIA extension.'));
    }
  });
}

function parseEvidence(raw: string): PageEvidence | null {
  try {
    const result = JSON.parse(raw) as PageEvidence;
    return result && typeof result.title === 'string' && Array.isArray(result.elements) ? result : null;
  } catch {
    return null;
  }
}

export default function TaskWorkspace() {
  const [pages, setPages] = useState<PageTab[]>([]);
  const [tabId, setTabId] = useState<number | null>(null);
  const [providers, setProviders] = useState<{ local?: ProviderStatus; openrouter?: ProviderStatus } | null>(null);
  const [provider, setProvider] = useState<'local' | 'openrouter'>('local');
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [goal, setGoal] = useState('');
  const [consentRemote, setConsentRemote] = useState(false);
  const [evidence, setEvidence] = useState<PageEvidence | null>(null);
  const [memories, setMemories] = useState<PageMemory[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [progress, setProgress] = useState<Progress[]>(defaultProgress);
  const [prepared, setPrepared] = useState<PreparedAction | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmedComplete, setConfirmedComplete] = useState(false);

  const refreshConnection = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pageResult, statusResult] = await Promise.all([sendExtension('list-pages'), sendExtension('get-status')]);
      if (!pageResult.ok) throw new Error(pageResult.error || 'Could not list browser pages.');
      setPages(pageResult.pages || []);
      setTabId((current) => current !== null && pageResult.pages?.some((page) => page.tabId === current) ? current : pageResult.pages?.[0]?.tabId ?? null);
      setConnected(Boolean(statusResult.connected));
      setProviders(statusResult.providers || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not connect to the browser extension.');
      setConnected(false);
      setProviders(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    startTransition(() => { void refreshConnection(); });
  }, [refreshConnection]);

  const selectedPage = pages.find((page) => page.tabId === tabId) || null;
  const localConfigured = Boolean(connected && providers?.local?.configured && providers.local.available);
  const remoteConfigured = Boolean(connected && providers?.openrouter?.configured);

  async function inspectPage() {
    if (tabId === null) return;
    setBusy(true);
    setError('');
    setStatus('Inspecting the selected, permissioned page and retrieving relevant saved pages…');
    try {
      const response = await sendExtension('get-context', { tabId, goal: goal.trim() || 'Summarize this page and identify its main sections.' });
      if (!response.ok || !response.context) throw new Error(response.error || 'Could not inspect the page.');
      const parsed = parseEvidence(response.context);
      if (!parsed) throw new Error('The extension returned an invalid page snapshot.');
      setEvidence(parsed);
      setMemories(response.memories || []);
      setPlan(null);
      setPrepared(null);
      setStatus(`Inspected “${response.page?.title || parsed.title}” locally. ${response.memories?.length || 0} relevant saved page${response.memories?.length === 1 ? '' : 's'} retrieved.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Page inspection failed.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  async function rememberPage() {
    if (tabId === null) return;
    setBusy(true);
    setError('');
    try {
      const response = await sendExtension('remember-page', { tabId });
      if (!response.ok) throw new Error(response.error || 'Could not save this page.');
      setStatus(`Saved “${response.page?.title || selectedPage?.title || 'this page'}” to extension-local memory.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save this page.');
    } finally {
      setBusy(false);
    }
  }

  const requestPlan = useCallback(async (nextProgress = progress) => {
    if (!goal.trim() || tabId === null || busy) return;
    if (!connected) {
      setError('Connect the local agent in the LIVIA extension popup before planning a task.');
      return;
    }
    if (provider === 'local' && !localConfigured) {
      setError('No local planning model is configured. Start Ollama and configure LIVIA_MODEL_SMART.');
      return;
    }
    if (provider === 'openrouter' && !remoteConfigured) {
      setError('No compatible external model is configured on the local agent. Configure its provider key and model.');
      return;
    }
    if (provider === 'openrouter' && !consentRemote) {
      setError('Confirm that the selected page and relevant saved-page excerpts may be sent to the external model.');
      return;
    }
    setBusy(true);
    setError('');
    setStatus(nextProgress.length ? 'Re-inspecting the page and checking verified progress…' : 'Reading the selected page and relevant local memory, then preparing a proposal…');
    setConfirmedComplete(false);
    try {
      const response = await sendExtension('plan', { tabId, goal: goal.trim(), provider, progress: nextProgress, allowRemoteContext: provider === 'openrouter' && consentRemote });
      if (!response.ok || !response.plan) throw new Error(response.error || 'The model could not produce a valid plan.');
      setPlan(response.plan);
      const refreshedEvidence = response.context ? parseEvidence(response.context) : null;
      if (refreshedEvidence) setEvidence(refreshedEvidence);
      setMemories(response.memories || []);
      setPrepared(null);
      setStatus(response.plan.complete ? 'The model says the visible evidence may satisfy the goal. Review its evidence and confirm the result yourself.' : 'Proposal ready. Nothing has been executed. Review each step before approval.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Planning failed.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }, [busy, connected, consentRemote, goal, localConfigured, progress, provider, remoteConfigured, tabId]);

  async function prepareAction(step: PlanStep) {
    if (tabId === null || busy) return;
    setBusy(true);
    setError('');
    setStatus('Checking that the proposed target is still visible…');
    try {
      const response = await sendExtension('prepare-action', { tabId, target: step.target, action: step.action, ...(step.action === 'search' ? { value: step.value } : {}) });
      if (!response.ok || !response.approvalId || !response.target) throw new Error(response.error || 'The target could not be prepared.');
      setPrepared({ approvalId: response.approvalId, action: response.action || step.action as 'scroll' | 'click' | 'search', target: response.target, warning: response.warning || 'Review this browser action before approving.' });
      setStatus('Target checked. An extension-owned approval page opened in a new tab. No action has been taken yet.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not prepare the action.');
      setStatus('');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!prepared) return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const response = await sendExtension('get-action-result', { approvalId: prepared.approvalId });
        if (cancelled || response.pending) return;
        setPrepared(null);
        if (response.declined) {
          setStatus('Action declined in the LIVIA extension. Nothing was changed.');
          return;
        }
        if (!response.ok || !response.verified) {
          setError(response.error || 'The extension could not verify the action.');
          setStatus('No successful outcome is claimed. Inspect the current page before continuing.');
          return;
        }
        const nextProgress = [...progress, { action: prepared.action, label: response.label || prepared.target.text || prepared.target.type, verified: true as const }].slice(-6);
        setProgress(nextProgress);
        setStatus(`The ${prepared.action} was verified. LIVIA is rechecking the page against your goal…`);
        void requestPlan(nextProgress);
      } catch {
        if (!cancelled) setError('Could not check the extension approval result. Keep the LIVIA extension open and retry.');
      }
    }, 1_500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [prepared, progress, requestPlan]);

  function resetTask() {
    if (prepared) void sendExtension('cancel-action', { approvalId: prepared.approvalId }).catch(() => undefined);
    setGoal('');
    setEvidence(null);
    setMemories([]);
    setPlan(null);
    setProgress([]);
    setPrepared(null);
    setStatus('');
    setError('');
    setConfirmedComplete(false);
  }

  const parsedEvidence = evidence || null;

  return (
    <main className="task-app">
      <header className="task-topbar">
        <a className="task-brand" href="/" aria-label="LIVIA task workspace"><span>L</span><strong>LIVIA</strong><small>BROWSER AGENT</small></a>
        <div className="task-topbar-state"><span className={connected ? 'state-dot connected' : 'state-dot'} />{connected ? 'LOCAL AGENT CONNECTED' : 'AGENT NOT CONNECTED'}<button type="button" onClick={() => void refreshConnection()} disabled={loading} aria-label="Refresh extension connection" title="Refresh connection">↻</button></div>
      </header>

      <div className="task-content">
        <section className="task-intro"><div><p className="task-eyebrow">UNDERSTAND THE PAGE. PLAN WITH YOU. ACT WITH PERMISSION.</p><h1>What should I help you do?</h1><p>LIVIA reads only the browser page you select and have enabled. It proposes a plan first. You review every supported action before it happens.</p></div><div className="task-privacy"><span aria-hidden="true">◇</span><span>PAGE ACCESS IS PER-SITE<br />ACTIONS ARE APPROVAL-GATED</span></div></section>

        <section className="task-composer">
          <label className="task-label" htmlFor="task-goal">YOUR TASK</label>
          <textarea id="task-goal" value={goal} onChange={(event) => setGoal(event.target.value)} maxLength={1_000} rows={3} placeholder="Describe the outcome you want. Example: summarize this article and find its main source." />
          <div className="task-controls">
            <label className="page-select-label">BROWSER PAGE<select aria-label="Browser page" value={tabId ?? ''} onChange={(event) => { setTabId(event.target.value ? Number(event.target.value) : null); setEvidence(null); setPlan(null); setPrepared(null); }} disabled={loading || !pages.length}><option value="">{loading ? 'Connecting to extension…' : pages.length ? 'Choose a page' : 'No browser pages found'}</option>{pages.map((page) => <option key={page.tabId} value={page.tabId}>{page.enabled ? '● ' : '○ '}{page.title} · {page.origin}{page.enabled ? '' : ' · enable in extension'}</option>)}</select></label>
            <label className="page-select-label">MODEL<select aria-label="Planning model" value={provider} onChange={(event) => setProvider(event.target.value as 'local' | 'openrouter')}><option value="local">Local / offline{localConfigured ? ` · ${providers?.local?.model}` : ' · unavailable'}</option><option value="openrouter">External provider{remoteConfigured ? ` · ${providers?.openrouter?.model}` : ' · not configured'}</option></select></label>
            <button type="button" className="inspect-button" onClick={() => void inspectPage()} disabled={busy || tabId === null || !selectedPage?.enabled}>Inspect page</button>
            <button type="button" className="plan-button" onClick={() => void requestPlan()} disabled={busy || !goal.trim() || tabId === null}>{busy ? 'Working…' : 'Understand & plan'}<span aria-hidden="true">↗</span></button>
          </div>
          {provider === 'openrouter' && <label className="remote-consent"><input type="checkbox" checked={consentRemote} onChange={(event) => setConsentRemote(event.target.checked)} /><span>I approve sending this goal, selected page evidence, and relevant saved-page excerpts to the configured external model. Credentials remain on the local agent.</span></label>}
          <div className="task-disclosure"><span aria-hidden="true">i</span><p>Forms, passwords, purchases, external messages, downloads, and destructive actions are blocked. LIVIA will ask when a task needs an unsupported or unsafe action.</p></div>
        </section>

        {error && <div className="task-alert" role="alert"><span>!</span><p>{error}</p></div>}
        {status && !error && <div className="task-status" role="status"><span className={busy ? 'status-spinner' : 'status-check'}>{busy ? '' : '•'}</span><p>{status}</p></div>}

        {!loading && connected && pages.length === 0 && <section className="connect-help"><span className="connect-symbol">↗</span><div><strong>Select a page from the extension popup</strong><p>Open the website you want LIVIA to work on. Open the LIVIA toolbar popup, choose <b>Enable on this site</b>, then return here and refresh the connection. Browser settings pages and the LIVIA workspace itself cannot be task pages.</p><button type="button" className="text-action" onClick={() => void refreshConnection()}>Refresh browser pages</button></div></section>}

        {parsedEvidence && <section className="evidence-panel"><div className="panel-heading"><div><span className="task-eyebrow">LIVE PAGE EVIDENCE</span><h2>{parsedEvidence.title || selectedPage?.title || 'Selected page'}</h2><a href={parsedEvidence.url} target="_blank" rel="noreferrer">{parsedEvidence.url}</a></div><div className="evidence-heading-actions"><span>{parsedEvidence.elements.length} visible excerpts</span><button type="button" onClick={() => void rememberPage()} disabled={busy || !selectedPage?.enabled}>Remember this page</button></div></div><div className="evidence-list">{parsedEvidence.elements.slice(0, 12).map((item, index) => <article key={`${item.type}-${index}`}><span>{item.type}{item.role ? ` · ${item.role}` : ''}</span><p>{item.text || '(No visible text label)'}</p></article>)}</div>{memories.length > 0 && <div className="memory-evidence"><span className="task-eyebrow">RELATED SAVED PAGES · LOCAL MEMORY</span>{memories.map((memory) => <article key={memory.id}><strong>{memory.title}</strong><span>{memory.url}</span><p>{memory.summary}</p></article>)}</div>}</section>}

        {plan && <section className="plan-panel"><div className="panel-heading"><div><span className="task-eyebrow">PROPOSED PLAN · {provider === 'local' ? 'LOCAL MODEL' : 'EXTERNAL MODEL'}</span><h2>{plan.summary}</h2></div><button type="button" className="reset-task" onClick={resetTask} disabled={busy}>New task</button></div><p className="plan-answer">{plan.answer}</p>
          {progress.length > 0 && <div className="verified-progress"><span className="task-eyebrow">VERIFIED USER-APPROVED ACTIONS</span>{progress.map((item, index) => <div key={`${item.label}-${index}`}><span>✓</span>{item.action}: {item.label}</div>)}</div>}
          {plan.steps.length > 0 && <div className="plan-steps"><h3>Review each proposed step</h3>{plan.steps.map((step, index) => <article className="plan-step" key={`${step.goal}-${index}`}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><div className="step-copy"><strong>{step.goal}</strong><p>{step.reason}</p>{step.target && <small>Target: {step.target}</small>}{step.action === 'search' && <small>Query to fill: {step.value}</small>}</div><span className={`step-kind kind-${step.action}`}>{step.action.toUpperCase()}</span>{['click', 'scroll', 'search'].includes(step.action) && <button type="button" className="review-action" onClick={() => void prepareAction(step)} disabled={busy}>{busy ? 'Checking…' : 'Review action'}</button>}</article>)}</div>}
          {plan.complete && plan.steps.length === 0 && <div className="completion-check"><strong>Visible evidence suggests the task may be complete.</strong><p>Model conclusions are not verification. Check the page yourself before confirming.</p><div><button type="button" className="confirm-complete" onClick={() => setConfirmedComplete(true)}>I verified the result</button><button type="button" className="text-action" onClick={() => { setConfirmedComplete(false); void requestPlan(progress); }} disabled={busy}>Check again</button></div>{confirmedComplete && <p className="user-confirmed">You confirmed completion. LIVIA did not independently verify the overall outcome.</p>}</div>}
          {!plan.complete && plan.steps.length === 0 && <div className="clarification"><strong>LIVIA needs more information or an available action.</strong><p>Review the answer above, clarify the goal, or choose a supported browser step.</p><button type="button" className="text-action" onClick={() => void requestPlan(progress)} disabled={busy}>Inspect and ask again</button></div>}
        </section>}

        {prepared && <section className="approval-pending"><span className="approval-pulse" /><div><strong>Waiting for approval in the LIVIA extension</strong><p>{prepared.warning}</p><p><b>{prepared.target.type}{prepared.target.text ? `: ${prepared.target.text}` : ''}</b> · {prepared.action} · confidence {Math.round(prepared.target.confidence * 100)}%</p><small>Switch to the extension approval tab. This page cannot approve actions.</small><button type="button" className="text-action cancel-approval" onClick={resetTask}>Cancel approval and task</button></div></section>}

        {!connected && <section className="connect-help"><span className="connect-symbol">⌘</span><div><strong>Connect the browser agent</strong><p>Load or update the LIVIA extension, enable it for the page you want, start the local agent, then connect Ollama in the extension popup. The website never receives your model token.</p><ol><li>Set <code>NEXT_PUBLIC_EXTENSION_ID</code> to the installed extension ID.</li><li>Start Ollama and the LIVIA local agent.</li><li>Grant this website origin in the extension and local-agent origin settings.</li></ol></div></section>}

        <footer className="task-footer"><span>LIVIA · BROWSER TASK WORKSPACE</span><span>Every page read is permissioned. Every action is reviewable.</span></footer>
      </div>
    </main>
  );
}
