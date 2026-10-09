(() => {
  function create(overlay) {
    const host = document.createElement('section');
    host.setAttribute('aria-label', 'LIVIA task assistant');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:none;pointer-events:none;';
    overlay.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        :host { color-scheme: dark; }
        * { box-sizing: border-box; }
        .sheet { position:fixed; top:76px; right:18px; display:grid; grid-template-rows:auto auto minmax(0,1fr); gap:13px; width:min(430px,calc(100vw - 28px)); max-height:calc(100vh - 94px); padding:16px; overflow:hidden; pointer-events:auto; border:1px solid rgba(175,225,235,.42); border-radius:15px; background:linear-gradient(145deg,rgba(13,22,30,.93),rgba(7,13,20,.94)); color:#edf6ff; font:13px/1.5 'Segoe UI',sans-serif; box-shadow:0 22px 70px rgba(0,0,0,.53),0 0 34px rgba(115,210,230,.12); backdrop-filter:blur(22px) saturate(135%); animation:sheet-in 260ms cubic-bezier(.18,.78,.26,1) both; }
        header { display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .identity { display:flex; align-items:center; gap:10px; min-width:0; }
        .mark { display:grid; flex:none; width:31px; height:31px; place-items:center; border:1px solid rgba(200,241,105,.4); border-radius:9px 9px 9px 3px; background:rgba(200,241,105,.1); color:#d2ff7a; font-weight:800; }
        .brand { display:block; font-size:12px; font-weight:750; letter-spacing:.15em; }
        .connection { display:flex; align-items:center; gap:6px; margin-top:2px; color:#95a9b7; font-size:9px; }
        .dot { width:6px; height:6px; flex:none; border-radius:50%; background:#79848c; }
        .dot.ready { background:#c8f169; box-shadow:0 0 8px #c8f16988; }
        .dot.busy { background:#77d8ed; animation:pulse 1s infinite; }
        .dot.approval { background:#f49b73; }
        button,textarea,select { font:inherit; }
        button { color:inherit; cursor:pointer; }
        .close { display:grid; width:30px; height:30px; flex:none; place-items:center; border:1px solid rgba(205,225,235,.2); border-radius:7px; background:rgba(255,255,255,.035); font-size:18px; }
        .quick { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
        .quick button { min-height:34px; padding:7px 9px; text-align:left; border:1px solid rgba(180,220,230,.17); border-radius:7px; background:rgba(165,220,235,.055); color:#d7e8ed; font-size:10px; animation:card-in 330ms both; }
        .quick button:nth-child(2) { animation-delay:35ms; }
        .quick button:nth-child(3) { animation-delay:70ms; }
        .quick button:nth-child(4) { animation-delay:105ms; }
        .quick button:hover { border-color:rgba(200,241,105,.45); background:rgba(200,241,105,.08); }
        .quick button.memory { color:#dff5b5; }
        .conversation { display:grid; grid-template-rows:minmax(0,1fr) auto; min-height:0; overflow:hidden; border:1px solid rgba(180,220,230,.16); border-radius:9px; background:rgba(2,8,14,.3); }
        .feed { min-height:0; padding:11px; overflow:auto; scrollbar-color:#527080 transparent; }
        .welcome { margin:0; color:#9eb2c0; font-size:11px; }
        .composer { display:grid; gap:8px; padding:10px; border-top:1px solid rgba(180,220,230,.14); background:rgba(1,7,12,.35); }
        textarea { display:block; width:100%; min-height:68px; max-height:130px; padding:9px 10px; resize:vertical; border:1px solid rgba(180,220,230,.22); border-radius:7px; outline:none; background:rgba(7,15,23,.92); color:#f0f6f8; font-size:12px; }
        textarea:focus,select:focus { border-color:rgba(200,241,105,.62); box-shadow:0 0 0 2px rgba(200,241,105,.1); }
        .controls { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:7px; }
        select { width:100%; min-width:0; min-height:35px; padding:0 8px; border:1px solid rgba(180,220,230,.2); border-radius:6px; background:#101a22; color:#c6d6dc; font-size:10px; }
        .send { min-height:35px; padding:0 12px; border:1px solid #c8f169; border-radius:6px; background:#c8f169; color:#14200d; font-size:10px; font-weight:750; }
        .send:disabled { opacity:.45; cursor:default; }
        .consent { display:flex; gap:7px; align-items:flex-start; color:#e1bea9; font-size:9px; line-height:1.45; }
        .consent input { margin:2px 0 0; accent-color:#f49b73; }
        .status { min-height:15px; margin:0; color:#9eb3c0; font-size:9px; }
        .status.error { color:#f2a68d; }
        .result-card { margin:9px 0; padding:10px; border:1px solid rgba(180,220,230,.15); border-radius:7px; background:rgba(161,220,235,.045); animation:card-in 260ms both; }
        .eyebrow { margin:0 0 5px; color:#c8f169; font:600 8px/1.4 monospace; letter-spacing:.08em; text-transform:uppercase; }
        .summary { margin:0; color:#ecf3ee; font-size:12px; font-weight:650; }
        .answer { margin:6px 0 0; color:#bacbd0; font-size:10px; white-space:pre-wrap; overflow-wrap:anywhere; }
        .source-evidence { margin-top:8px; padding-top:7px; border-top:1px solid rgba(180,220,230,.12); }
        .source-excerpt { margin:4px 0; color:#a9bec3; font-size:9px; }
        .source-link { display:block; margin-top:5px; color:#c8f169; font-size:9px; overflow-wrap:anywhere; }
        .step { margin-top:8px; padding-top:8px; border-top:1px solid rgba(180,220,230,.12); }
        .step strong { display:block; color:#e1ebea; font-size:10px; }
        .step p { margin:3px 0 0; color:#9fb2b8; font-size:9px; }
        .step small { display:block; margin-top:3px; color:#d0dfc0; font-size:9px; overflow-wrap:anywhere; }
        .step button { min-height:30px; margin-top:7px; padding:0 9px; border:1px solid rgba(200,241,105,.35); border-radius:5px; background:rgba(200,241,105,.08); color:#def7aa; font-size:9px; }
        .wait { margin-top:8px; padding:8px; border:1px solid rgba(244,155,115,.35); border-radius:6px; color:#f0c4b2; font-size:9px; }
        @keyframes sheet-in { from { opacity:0; transform:translateY(-9px) scale(.985); } to { opacity:1; transform:translateY(0) scale(1); } }
        @keyframes card-in { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 50% { opacity:.4; } }
        @media (max-width:560px) { .sheet { top:auto; right:0; bottom:0; width:100vw; max-height:86vh; border-radius:18px 18px 0 0; padding:13px; } .feed { min-height:140px; } }
        @media (prefers-reduced-motion:reduce) { *,*::before,*::after { animation-duration:.01ms!important; animation-iteration-count:1!important; } }
      </style>
      <section class="sheet" role="dialog" aria-modal="false" aria-label="LIVIA browser task assistant">
        <header><div class="identity"><span class="mark">L</span><span><strong class="brand">LIVIA</strong><span class="connection"><i class="dot"></i><span class="connection-text">CHECKING LOCAL MODELS</span></span></span></div><button class="close" type="button" aria-label="Close LIVIA">×</button></header>
        <div class="quick" aria-label="Quick tasks"></div>
        <div class="conversation"><div class="feed" aria-live="polite"><p class="welcome">Tell me what you want to accomplish on this page. I’ll inspect it, show evidence, and propose actions for your approval.</p></div><form class="composer"><textarea maxlength="1000" aria-label="Describe your task" placeholder="What should I do on this page?"></textarea><div class="controls"><select aria-label="AI model"><option value="local">Local / offline</option><option value="openrouter">External provider</option></select><button class="send" type="submit">Plan task ↗</button></div><label class="consent" hidden><input type="checkbox"><span>Allow sending this goal and page evidence to the external model.</span></label><p class="status" role="status"></p></form></div>
      </section>`;

    const hostElement = shadow.querySelector('.sheet');
    const closeButton = shadow.querySelector('.close');
    const feed = shadow.querySelector('.feed');
    const form = shadow.querySelector('.composer');
    const taskInput = shadow.querySelector('textarea');
    const modelSelect = shadow.querySelector('select');
    const submitButton = shadow.querySelector('.send');
    const consent = shadow.querySelector('.consent');
    const consentInput = shadow.querySelector('.consent input');
    const status = shadow.querySelector('.status');
    const connectionDot = shadow.querySelector('.dot');
    const connectionText = shadow.querySelector('.connection-text');
    const quickList = shadow.querySelector('.quick');
    const state = { open: false, providers: null, busy: false, approvalId: '', planId: '', actionTimer: 0, progress: [] };

    function callWorker(message) {
      return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(message, (response) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message || 'LIVIA extension request failed.'));
          else if (!response) reject(new Error('LIVIA extension did not respond.'));
          else resolve(response);
        });
      });
    }

    function setStatus(message, isError = false) {
      status.textContent = message;
      status.classList.toggle('error', isError);
      connectionDot.className = `dot${state.busy ? ' busy' : state.approvalId ? ' approval' : state.providers?.local?.available ? ' ready' : ''}`;
    }

    function appendPlan(result) {
      const card = document.createElement('article');
      card.className = 'result-card';
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = `PROPOSAL · ${result.provider === 'local' ? 'LOCAL MODEL' : 'EXTERNAL MODEL'} · ${result.model || 'configured model'}`;
      const summary = document.createElement('p');
      summary.className = 'summary';
      summary.textContent = result.plan.summary;
      const answer = document.createElement('p');
      answer.className = 'answer';
      answer.textContent = result.plan.answer;
      card.append(eyebrow, summary, answer);
      try {
        const evidence = JSON.parse(result.context || '{}');
        const source = document.createElement('div');
        source.className = 'source-evidence';
        const sourceTitle = document.createElement('p');
        sourceTitle.className = 'eyebrow';
        sourceTitle.textContent = `PAGE EVIDENCE · ${String(evidence.title || result.page?.title || 'Selected page').slice(0, 120)}`;
        source.appendChild(sourceTitle);
        for (const item of (evidence.elements || []).slice(0, 4)) {
          if (!item.text) continue;
          const excerpt = document.createElement('p');
          excerpt.className = 'source-excerpt';
          excerpt.textContent = `${item.type}: ${item.text}`;
          source.appendChild(excerpt);
        }
        for (const memory of (result.memories || []).slice(0, 3)) {
          const citation = document.createElement('a');
          citation.className = 'source-link';
          citation.href = memory.url;
          citation.target = '_blank';
          citation.rel = 'noreferrer';
          citation.textContent = `Saved source: ${memory.title}`;
          source.appendChild(citation);
        }
        card.appendChild(source);
      } catch {
        // Keep the model result readable if an evidence snapshot is unavailable.
      }
      for (const [index, step] of result.plan.steps.entries()) {
        const row = document.createElement('div');
        row.className = 'step';
        const title = document.createElement('strong');
        title.textContent = `${index + 1}. ${step.goal}`;
        const reason = document.createElement('p');
        reason.textContent = step.reason;
        row.append(title, reason);
        if (step.target) {
          const target = document.createElement('small');
          target.textContent = `Target: ${step.target}`;
          row.appendChild(target);
        }
        if (step.action === 'search' && step.value) {
          const query = document.createElement('small');
          query.textContent = `Query: ${step.value}`;
          row.appendChild(query);
        }
        if (['click', 'scroll', 'search'].includes(step.action)) {
          const actionButton = document.createElement('button');
          actionButton.type = 'button';
          actionButton.textContent = step.action === 'search' ? 'Review query fill' : `Review ${step.action}`;
          actionButton.addEventListener('click', () => { void prepareAction(step); });
          row.appendChild(actionButton);
        }
        card.appendChild(row);
      }
      if (result.plan.complete && !result.plan.steps.length) {
        const completion = document.createElement('p');
        completion.className = 'wait';
        completion.textContent = 'Visible evidence may satisfy the goal. Check the page yourself before treating it as complete.';
        card.appendChild(completion);
      }
      feed.appendChild(card);
      feed.scrollTop = feed.scrollHeight;
    }

    async function refreshModels() {
      try {
        const response = await callWorker({ type: 'livia-assistant-status' });
        if (!response.ok || !response.connected) throw new Error('Connect the local agent in the extension popup.');
        state.providers = response.providers;
        const local = response.providers?.local;
        const remote = response.providers?.openrouter;
        modelSelect.options[0].textContent = `Local / offline${local?.available ? ` · ${local.model}` : ' · unavailable'}`;
        modelSelect.options[1].textContent = `External provider${remote?.configured ? ` · ${remote.model}` : ' · not configured'}`;
        connectionText.textContent = local?.available ? `LOCAL MODEL READY · ${local.model}` : 'LOCAL MODEL NOT AVAILABLE';
        connectionDot.className = `dot${local?.available ? ' ready' : ''}`;
        setStatus(local?.available ? 'This page stays on your device with the local model.' : 'Install/configure a local model or choose a configured external provider.', !local?.available && !remote?.configured);
      } catch (error) {
        state.providers = null;
        connectionText.textContent = 'LOCAL AGENT NOT CONNECTED';
        setStatus(error instanceof Error ? error.message : 'Local agent not connected.', true);
      }
    }

    function quickTask(label, text, action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = label;
      if (action === 'remember') button.classList.add('memory');
      button.addEventListener('click', () => {
        if (action === 'remember') void rememberPage();
        else {
          taskInput.value = text;
          taskInput.focus();
        }
      });
      quickList.appendChild(button);
    }

    quickTask('Summarize this page', 'Summarize this page in clear sections. Include the main points and cite visible evidence.');
    quickTask('Explain the main idea', 'Explain the purpose of this page and identify its main sections.');
    quickTask('Find a search field', 'Find the labeled search field on this page and explain what I can search for.');
    quickTask('Save this page to memory', '', 'remember');

    function toggle(forceOpen) {
      state.open = typeof forceOpen === 'boolean' ? forceOpen : !state.open;
      host.style.display = state.open ? 'block' : 'none';
      if (state.open) {
        void refreshModels();
        taskInput.focus({ preventScroll: true });
      }
    }

    async function planTask(progress = state.progress) {
      const goal = taskInput.value.trim();
      if (!goal || state.busy) return;
      const provider = modelSelect.value;
      const allowRemoteContext = provider === 'openrouter' && consentInput.checked;
      if (provider === 'openrouter' && !allowRemoteContext) {
        setStatus('Check the external-data consent before using the remote model.', true);
        return;
      }
      if (provider === 'local' && !state.providers?.local?.available) {
        setStatus('The selected local model is unavailable. Connect Ollama or choose a configured external provider.', true);
        return;
      }
      if (provider === 'openrouter' && !state.providers?.openrouter?.configured) {
        setStatus('No external provider is configured on the local agent.', true);
        return;
      }
      state.busy = true;
      submitButton.disabled = true;
      setStatus(progress.length ? 'Checking the page again after the approved action…' : 'Understanding the visible page and saved-page memory…');
      try {
        const response = await callWorker({ type: 'livia-assistant-plan', goal, provider, allowRemoteContext, progress });
        if (!response.ok) throw new Error(response.error || 'Could not plan this task.');
        state.planId = response.planId || '';
        appendPlan(response);
        setStatus(`Proposal ready for ${response.page?.title || document.title}. Nothing has been done yet.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Task planning failed.', true);
      } finally {
        state.busy = false;
        submitButton.disabled = false;
        connectionDot.className = `dot${state.approvalId ? ' approval' : state.providers?.local?.available ? ' ready' : ''}`;
      }
    }

    async function prepareAction(step) {
      if (state.busy) return;
      state.busy = true;
      setStatus('Checking that the proposed page target is still visible…');
      try {
        const response = await callWorker({ type: 'livia-assistant-prepare', planId: state.planId, target: step.target, action: step.action, ...(step.action === 'search' ? { value: step.value } : {}) });
        if (!response.ok || !response.approvalId) throw new Error(response.error || 'Could not prepare the action.');
        state.approvalId = response.approvalId;
        setStatus(`${response.warning || 'Review the action in the LIVIA approval tab.'} Q stays here while you review.`);
        connectionDot.className = 'dot approval';
        pollApproval(step);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not prepare this action.', true);
      } finally {
        state.busy = false;
      }
    }

    function pollApproval(step) {
      window.clearInterval(state.actionTimer);
      state.actionTimer = window.setInterval(async () => {
        try {
          const response = await callWorker({ type: 'livia-assistant-result', approvalId: state.approvalId });
          if (response.pending) return;
          window.clearInterval(state.actionTimer);
          state.actionTimer = 0;
          state.approvalId = '';
          if (response.declined) {
            setStatus('Action declined. Nothing was changed.');
            connectionDot.className = `dot${state.providers?.local?.available ? ' ready' : ''}`;
            return;
          }
          if (!response.ok || !response.verified) {
            setStatus(response.error || 'The page did not verify the action. Inspect before continuing.', true);
            return;
          }
          state.progress = [...state.progress, { action: step.action, label: response.label || step.target, verified: true }].slice(-6);
          setStatus('Action verified. Rechecking the page against your task…');
          await planTask(state.progress);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : 'Could not read the approval result.', true);
        }
      }, 1200);
    }

    async function rememberPage() {
      try {
        const response = await callWorker({ type: 'livia-assistant-remember' });
        setStatus(response.ok ? `Saved ${response.memory?.title || document.title} to local page memory.` : response.error || 'Could not save this page.', !response.ok);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'Could not save this page.', true);
      }
    }

    modelSelect.addEventListener('change', () => {
      consent.hidden = modelSelect.value !== 'openrouter';
      if (modelSelect.value === 'openrouter') consentInput.focus();
    });
    form.addEventListener('submit', (event) => { event.preventDefault(); void planTask(); });
    closeButton.addEventListener('click', () => toggle(false));

    return {
      toggle,
      contains(target) { return host.contains(target); },
      dispose() { window.clearInterval(state.actionTimer); host.remove(); }
    };
  }

  self.LIVIAAssistantPanel = { create };
})();
