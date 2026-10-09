const contentFiles = ['core.js', 'livia-character.js', 'memory.js', 'assistant-panel.js', 'content.js'];
const pendingInjections = new Map();
const approvalLocks = new Set();
importScripts('workspace-origins.js');

function sitePattern(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function injectIntoTab(tab) {
  const pattern = sitePattern(tab?.url);
  if (!tab?.id) return { ok: false, error: 'No active browser tab was found.' };
  if (!pattern) return { ok: false, error: 'Chrome protects this page. Open a normal http:// or https:// website, then enable LIVIA there.' };
  if (self.isLIVIAControlPage(tab.url)) {
    return { ok: false, error: 'The LIVIA task workspace does not receive a page overlay.' };
  }

  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (!granted) return { ok: false, error: 'Grant LIVIA access to this site in the browser prompt, then try again.' };
  const { settings = {} } = await chrome.storage.local.get('settings');
  const host = new URL(tab.url).hostname;
  if (Array.isArray(settings.disabledSites) && settings.disabledSites.includes(host)) {
    return { ok: false, error: 'LIVIA is disabled on this site. Enable it again from the popup.' };
  }

  const pending = pendingInjections.get(tab.id);
  if (pending) return pending;

  const injection = injectOrSync(tab.id);
  pendingInjections.set(tab.id, injection);
  try {
    return await injection;
  } finally {
    if (pendingInjections.get(tab.id) === injection) pendingInjections.delete(tab.id);
  }
}

async function injectOrSync(tabId) {
  try {
    const existing = await chrome.tabs.sendMessage(tabId, { type: 'sync' });
    if (existing?.ok) return { ok: true };
  } catch {
    // No live companion listener exists yet; inject the runtime once.
  }

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: contentFiles });
    await chrome.tabs.sendMessage(tabId, { type: 'sync' });
    return { ok: true };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `Chrome could not add LIVIA to this page: ${detail}` };
  }
}

const agentUrl = 'http://127.0.0.1:4317';

function workspaceSenderAllowed(sender) {
  try {
    return self.LIVIAWorkspaceOrigins.includes(new URL(sender.url).origin);
  } catch {
    return false;
  }
}

function validWorkspaceRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request) || request.type !== 'workspace-request' || typeof request.action !== 'string') return false;
  const shapes = {
    'list-pages': { required: [], optional: [] },
    'get-status': { required: [], optional: [] },
    'get-context': { required: ['tabId', 'goal'], optional: [] },
    'remember-page': { required: ['tabId'], optional: [] },
    'plan': { required: ['tabId', 'goal', 'provider'], optional: ['model', 'progress', 'allowRemoteContext'] },
    'prepare-action': { required: ['tabId', 'target', 'action'], optional: ['value'] },
    'cancel-action': { required: ['approvalId'], optional: [] },
    'get-action-result': { required: ['approvalId'], optional: [] }
  };
  const shape = shapes[request.action];
  const allowed = shape && ['type', 'action', ...shape.required, ...shape.optional];
  return Boolean(shape && Object.keys(request).every((key) => allowed.includes(key)) && shape.required.every((key) => Object.hasOwn(request, key)));
}

async function getEnabledPage(tabId, requireWorkspaceSelection = true) {
  if (!Number.isInteger(tabId)) return { error: 'Choose a browser page first.' };
  if (requireWorkspaceSelection) {
    const selected = await chrome.storage.local.get('liviaWorkspaceTabId');
    if (selected.liviaWorkspaceTabId !== tabId) return { error: 'Select this page from the LIVIA extension popup before using it in the workspace.' };
  }
  const tab = await chrome.tabs.get(tabId);
  const pattern = sitePattern(tab.url);
  if (!tab.id || !pattern) return { error: 'This browser page cannot be inspected.' };
  if (!await chrome.permissions.contains({ origins: [pattern] })) return { error: 'LIVIA does not have permission for this site. Enable it from the extension toolbar on that page.' };
  const { settings = {} } = await chrome.storage.local.get('settings');
  const host = new URL(tab.url).hostname;
  if (settings.paused || settings.disabledSites?.includes(host)) return { error: 'LIVIA is paused or disabled for this site.' };
  return { tab, host };
}

async function listWorkspacePages() {
  const stored = await chrome.storage.local.get('liviaWorkspaceTabId');
  if (!Number.isInteger(stored.liviaWorkspaceTabId)) return { ok: true, pages: [] };
  try {
    const access = await getEnabledPage(stored.liviaWorkspaceTabId);
    if (!access.tab) return { ok: true, pages: [] };
    if (self.isLIVIAControlPage(access.tab.url)) return { ok: true, pages: [] };
    return {
      ok: true,
      pages: [{
        tabId: access.tab.id,
        title: String(access.tab.title || access.host).slice(0, 120),
        origin: new URL(access.tab.url).origin,
        enabled: true
      }]
    };
  } catch {
    await chrome.storage.local.remove('liviaWorkspaceTabId');
    return { ok: true, pages: [] };
  }
}

function compactScene(scene) {
  const items = [];
  let remaining = 6_400;
  for (const node of scene.nodes) {
    if (!node?.visible || !['TEXT', 'LINK', 'CARD', 'BUTTON', 'IMAGE', 'VIDEO', 'SECTION', 'NAVIGATION'].includes(node.type)) continue;
    const text = String(node.text || '').replace(/\s+/g, ' ').trim().slice(0, 240);
    const item = { type: node.type, text, ...(node.semanticRole ? { role: String(node.semanticRole).slice(0, 40) } : {}) };
    const cost = JSON.stringify(item).length;
    if (cost > remaining) break;
    items.push(item);
    remaining -= cost;
  }
  return JSON.stringify({ title: scene.page.title, url: scene.page.url, viewport: scene.viewport, elements: items });
}

async function getLocalAgent() {
  const result = await chrome.storage.local.get('liviaLocalAgentToken');
  const token = result.liviaLocalAgentToken;
  const granted = await chrome.permissions.contains({ origins: ['http://127.0.0.1/*'] });
  return typeof token === 'string' && token.length >= 32 && granted ? token : null;
}

async function embedLocally(token, texts) {
  try {
    const response = await fetch(`${agentUrl}/v1/embeddings`, {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ texts })
    });
    if (!response.ok) return [];
    const result = await response.json();
    return result.ok && Array.isArray(result.vectors) ? result.vectors : [];
  } catch {
    return [];
  }
}

async function retrievePageMemory(tabId, goal, token) {
  let embedding;
  if (token) embedding = (await embedLocally(token, [goal]))[0];
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      type: 'search-memory', query: goal.slice(0, 160), limit: 5,
      ...(Array.isArray(embedding) ? { embedding } : {})
    });
    return response?.ok ? response.results.slice(0, 5).map((item) => ({
      title: String(item.title || '').slice(0, 200),
      url: String(item.url || '').slice(0, 500),
      summary: String(item.summary || '').slice(0, 500)
    })) : [];
  } catch {
    return [];
  }
}

async function workspacePlan(request, requireWorkspaceSelection = true) {
  const access = await getEnabledPage(request.tabId, requireWorkspaceSelection);
  if (!access.tab) return { ok: false, error: access.error };
  const token = await getLocalAgent();
  if (!token) return { ok: false, error: 'Connect the local LIVIA agent from the extension popup before planning.' };
  let sceneResponse;
  try {
    sceneResponse = await chrome.tabs.sendMessage(request.tabId, { type: 'get-scene', maxNodes: 250 });
  } catch {
    return { ok: false, error: 'LIVIA could not inspect this page. Reload the page after enabling the extension.' };
  }
  if (!sceneResponse?.ok) return { ok: false, error: sceneResponse?.error || 'Page inspection is unavailable.' };
  const memories = await retrievePageMemory(request.tabId, request.goal, token);
  const context = compactScene(sceneResponse.scene);
  try {
    const response = await fetch(`${agentUrl}/v1/plan`, {
      method: 'POST', cache: 'no-store', credentials: 'omit',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        goal: request.goal,
        context,
        memories,
        provider: request.provider,
        ...(typeof request.model === 'string' ? { model: request.model } : {}),
        allowRemoteContext: request.allowRemoteContext === true,
        progress: Array.isArray(request.progress) ? request.progress.slice(0, 6) : []
      })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) return { ok: false, error: result.error || 'Task planning failed.' };
    const planId = crypto.randomUUID();
    await chrome.storage.local.set({ liviaLastPlan: { id: planId, tabId: request.tabId, goal: request.goal, provider: result.provider, model: result.model, plan: result.plan, createdAt: Date.now() } });
    return { ok: true, planId, page: { title: sceneResponse.scene.page.title, origin: new URL(sceneResponse.scene.page.url).origin }, context, provider: result.provider, model: result.model, memories, plan: result.plan };
  } catch {
    return { ok: false, error: 'The local agent is unavailable. No browser action was taken.' };
  }
}

async function prepareWorkspaceAction(request, requireWorkspaceSelection = true) {
  if (!['scroll', 'click', 'search'].includes(request.action) || typeof request.target !== 'string' || !request.target.trim() || request.target.length > 120 ||
    (request.action === 'search' && (typeof request.value !== 'string' || !request.value.trim() || request.value.length > 180))) {
    return { ok: false, error: 'Unsupported browser action.' };
  }
  const stored = await chrome.storage.local.get('liviaLastPlan');
  const plan = stored.liviaLastPlan;
  if (!plan || plan.tabId !== request.tabId || Date.now() - plan.createdAt > 10 * 60_000) return { ok: false, error: 'The plan expired. Ask LIVIA to inspect the page again.' };
  if (request.planId && request.planId !== plan.id) return { ok: false, error: 'This proposal is no longer current. Ask LIVIA to plan again.' };
  const access = await getEnabledPage(request.tabId, requireWorkspaceSelection);
  if (!access.tab) return { ok: false, error: access.error };
  const step = plan.plan.steps.find((item) => item.action === request.action && item.target === request.target && (request.action !== 'search' || item.value === request.value));
  if (!step) return { ok: false, error: 'That action is not part of the current plan.' };
  try {
    const found = await chrome.tabs.sendMessage(request.tabId, { type: 'find-element', query: step.target, limit: 3 });
    if (!found?.ok) return { ok: false, error: found?.error || 'Could not locate a matching page element.' };
    if (!found.results.length) return { ok: false, error: 'No visible element matches this step. Inspect the page again.' };
    const candidate = found.results[0];
    if (request.action === 'click' && candidate.type !== 'BUTTON' && candidate.semanticRole !== 'button') {
      return { ok: false, error: 'LIVIA only activates an explicit same-page button. This match is not a button.' };
    }
    if (request.action === 'search' && candidate.type !== 'INPUT') return { ok: false, error: 'This match is not a labeled search input.' };
    const approvalId = crypto.randomUUID();
    const approval = {
      id: approvalId,
      tabId: request.tabId,
      goal: plan.goal,
      action: request.action,
      requireWorkspaceSelection,
      targetId: candidate.id,
      targetType: candidate.type,
      targetText: String(candidate.text || '').slice(0, 200),
      label: `${candidate.type}${candidate.text ? `: ${candidate.text}` : ''}`.slice(0, 200),
      value: request.action === 'search' ? request.value.trim() : '',
      confidence: candidate.confidence,
      bounds: candidate.bounds,
      expiresAt: Date.now() + 2 * 60_000
    };
    await chrome.storage.local.set({ [`liviaApproval-${approvalId}`]: approval });
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL(`approval.html?id=${encodeURIComponent(approvalId)}`), active: true });
    } catch {
      await chrome.storage.local.remove(`liviaApproval-${approvalId}`);
      return { ok: false, error: 'Could not open the extension approval page.' };
    }
    const warning = request.action === 'click' ? 'The extension opened a separate approval page. Nothing has happened yet.' : request.action === 'search' ? 'The extension opened a separate approval page. The query will only be filled, not submitted.' : 'The extension opened a separate approval page. Nothing has scrolled yet.';
    return { ok: true, approvalId, action: request.action, target: candidate, warning };
  } catch {
    return { ok: false, error: 'The page target could not be checked.' };
  }
}

async function executeWorkspaceAction(approval, approved) {
  if (!approval || approval.expiresAt < Date.now()) return { ok: false, error: 'Approval expired. Prepare the action again.' };
  if (approved !== true) return { ok: true, declined: true, verified: false, error: 'Action was declined. Nothing was changed.' };
  const access = await getEnabledPage(approval.tabId, approval.requireWorkspaceSelection !== false);
  if (!access.tab) return { ok: false, error: access.error };
  try {
    const result = await chrome.tabs.sendMessage(approval.tabId, {
      type: approval.action === 'scroll' ? 'scroll-element' : approval.action === 'search' ? 'fill-search' : 'click-element',
      id: approval.targetId,
      ...(approval.action === 'scroll' ? {} : approval.action === 'search' ? { value: approval.value, confirmed: true } : { confirmed: true })
    });
    const audit = { action: approval.action, label: approval.label, verified: Boolean(result?.ok && result.verified), createdAt: Date.now() };
    const previous = await chrome.storage.local.get('liviaBrowserAudit');
    await chrome.storage.local.set({ liviaBrowserAudit: [audit, ...(previous.liviaBrowserAudit || [])].slice(0, 50) });
    if (!audit.verified) return { ok: false, error: result?.error || 'The page did not verify the action. Inspect its current state.' };
    return { ok: true, verified: true, action: approval.action, label: approval.label };
  } catch {
    return { ok: false, error: 'The page closed or changed before this action could be verified.' };
  }
}

async function approveFromExtensionPage(request) {
  if (typeof request.approvalId !== 'string' || request.approvalId.length > 80 || typeof request.approved !== 'boolean') return { ok: false, error: 'Invalid approval request.' };
  if (approvalLocks.has(request.approvalId)) return { ok: false, error: 'This approval is already being processed.' };
  approvalLocks.add(request.approvalId);
  const key = `liviaApproval-${request.approvalId}`;
  try {
    const stored = await chrome.storage.local.get(key);
    const approval = stored[key];
    await chrome.storage.local.remove(key);
    const result = await executeWorkspaceAction(approval, request.approved);
    await chrome.storage.local.set({ [`liviaActionResult-${request.approvalId}`]: { ...result, action: approval?.action, createdAt: Date.now() } });
    return result;
  } finally {
    approvalLocks.delete(request.approvalId);
  }
}

async function getExtensionApproval(approvalId) {
  if (typeof approvalId !== 'string' || approvalId.length > 80) return { ok: false, error: 'Invalid approval reference.' };
  const key = `liviaApproval-${approvalId}`;
  const stored = await chrome.storage.local.get(key);
  const approval = stored[key];
  if (!approval || approval.expiresAt < Date.now()) {
    await chrome.storage.local.remove(key);
    return { ok: false, error: 'This approval expired. Return to LIVIA and prepare the action again.' };
  }
  try {
    const tab = await chrome.tabs.get(approval.tabId);
    const access = await getEnabledPage(approval.tabId, approval.requireWorkspaceSelection !== false);
    if (!access.tab) return { ok: false, error: access.error };
    return {
      ok: true,
      approval: {
        id: approval.id,
        goal: approval.goal,
        pageTitle: String(tab.title || access.host).slice(0, 120),
        origin: new URL(tab.url).origin,
        action: approval.action,
        targetType: approval.targetType,
        targetText: approval.targetText,
        value: approval.value,
        confidence: approval.confidence,
        expiresAt: approval.expiresAt
      }
    };
  } catch {
    return { ok: false, error: 'The target page is no longer available.' };
  }
}

async function getWorkspaceActionResult(approvalId) {
  if (typeof approvalId !== 'string' || approvalId.length > 80) return { ok: false, error: 'Invalid approval reference.' };
  const key = `liviaActionResult-${approvalId}`;
  const result = await chrome.storage.local.get(key);
  if (!result[key]) return { ok: true, pending: true };
  await chrome.storage.local.remove(key);
  return result[key];
}

async function cancelWorkspaceApproval(approvalId) {
  if (typeof approvalId !== 'string' || approvalId.length > 80) return { ok: false, error: 'Invalid approval reference.' };
  const approvalKey = `liviaApproval-${approvalId}`;
  const stored = await chrome.storage.local.get(approvalKey);
  if (!stored[approvalKey]) return { ok: false, error: 'This approval is no longer pending.' };
  await chrome.storage.local.remove(approvalKey);
  await chrome.storage.local.set({ [`liviaActionResult-${approvalId}`]: { ok: true, declined: true, verified: false, error: 'Approval cancelled from the LIVIA workspace.', createdAt: Date.now() } });
  return { ok: true, cancelled: true };
}

async function handleWorkspaceRequest(request) {
  if (!validWorkspaceRequest(request)) return { ok: false, error: 'Invalid workspace request.' };
  if (request.action === 'list-pages') return listWorkspacePages();
  if (request.action === 'get-status') {
    const token = await getLocalAgent();
    if (!token) return { ok: true, connected: false, providers: null };
    try {
      const response = await fetch(`${agentUrl}/v1/providers`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store', credentials: 'omit' });
      const result = await response.json();
      return { ok: true, connected: response.ok && result.ok, providers: result.providers || null };
    } catch {
      return { ok: true, connected: false, providers: null };
    }
  }
  if (request.action === 'get-context') {
    const access = await getEnabledPage(request.tabId);
    if (!access.tab) return { ok: false, error: access.error };
    try {
      const scene = await chrome.tabs.sendMessage(request.tabId, { type: 'get-scene', maxNodes: 250 });
      if (!scene?.ok) return { ok: false, error: scene?.error || 'Page inspection failed.' };
      const memories = await retrievePageMemory(request.tabId, request.goal, await getLocalAgent());
      return { ok: true, context: compactScene(scene.scene), memories, page: { title: scene.scene.page.title, origin: new URL(scene.scene.page.url).origin } };
    } catch {
      return { ok: false, error: 'Could not inspect this page.' };
    }
  }
  if (request.action === 'remember-page') {
    const access = await getEnabledPage(request.tabId);
    if (!access.tab) return { ok: false, error: access.error };
    try {
      return await chrome.tabs.sendMessage(request.tabId, { type: 'remember-page' });
    } catch {
      return { ok: false, error: 'Could not save this page. Reload it after enabling LIVIA.' };
    }
  }
  if (request.action === 'plan') {
    if (typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 1_000 || !['local', 'openrouter'].includes(request.provider)) return { ok: false, error: 'Enter a task and select a configured model.' };
    if (request.provider === 'openrouter' && request.allowRemoteContext !== true) return { ok: false, error: 'Approve sending page evidence to the external model before planning.' };
    if (request.allowRemoteContext !== undefined && typeof request.allowRemoteContext !== 'boolean') return { ok: false, error: 'Invalid external-context consent.' };
    return workspacePlan(request);
  }
  if (request.action === 'prepare-action') return prepareWorkspaceAction(request);
  if (request.action === 'cancel-action') return cancelWorkspaceApproval(request.approvalId);
  return getWorkspaceActionResult(request.approvalId);
}

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    await injectIntoTab(await chrome.tabs.get(tabId));
  } catch {
    // The tab may close before its state can be restored.
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') void injectIntoTab(tab);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const selected = await chrome.storage.local.get('liviaWorkspaceTabId');
  if (selected.liviaWorkspaceTabId === tabId) await chrome.storage.local.remove('liviaWorkspaceTabId');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id) return false;

  if (request?.type === 'livia-get-workspace-approval') {
    if (!sender.url?.startsWith(`${chrome.runtime.getURL('approval.html')}?`)) {
      sendResponse({ ok: false, error: 'Approval details are available only in the LIVIA extension page.' });
      return false;
    }
    getExtensionApproval(request.approvalId).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Could not load the approval.' }));
    return true;
  }

  if (request?.type === 'livia-approve-workspace-action') {
    if (sender.url !== chrome.runtime.getURL('approval.html') && !sender.url?.startsWith(`${chrome.runtime.getURL('approval.html')}?`)) {
      sendResponse({ ok: false, error: 'Approval decisions must come from the LIVIA extension page.' });
      return false;
    }
    approveFromExtensionPage(request).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'The approval could not be completed.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-plan') {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId) || typeof request.goal !== 'string' || !request.goal.trim() || request.goal.length > 1_000 ||
      !['local', 'openrouter'].includes(request.provider) || (request.model !== undefined && (typeof request.model !== 'string' || !request.model.trim() || request.model.length > 160)) ||
      (request.provider === 'openrouter' && request.allowRemoteContext !== true)) {
      sendResponse({ ok: false, error: 'Enter a task, select an available model, and approve external context when requested.' });
      return false;
    }
    workspacePlan({ tabId, goal: request.goal, provider: request.provider, model: request.model, allowRemoteContext: request.allowRemoteContext === true, progress: Array.isArray(request.progress) ? request.progress.slice(0, 6) : [] }, false)
      .then(sendResponse).catch(() => sendResponse({ ok: false, error: 'LIVIA could not prepare a plan.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-status') {
    handleWorkspaceRequest({ type: 'workspace-request', action: 'get-status' })
      .then(sendResponse).catch(() => sendResponse({ ok: false, connected: false, providers: null, error: 'Could not check AI provider availability.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-prepare') {
    const tabId = sender.tab?.id;
    if (!Number.isInteger(tabId) || typeof request.planId !== 'string' || request.planId.length > 80 || typeof request.target !== 'string' || !['scroll', 'click', 'search'].includes(request.action)) {
      sendResponse({ ok: false, error: 'Invalid proposed action.' });
      return false;
    }
    prepareWorkspaceAction({ tabId, planId: request.planId, target: request.target, action: request.action, ...(typeof request.value === 'string' ? { value: request.value } : {}) }, false)
      .then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Could not prepare the action for approval.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-result') {
    getWorkspaceActionResult(request.approvalId).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Could not check the approval result.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-cancel') {
    cancelWorkspaceApproval(request.approvalId).then(sendResponse).catch(() => sendResponse({ ok: false, error: 'Could not cancel the approval.' }));
    return true;
  }

  if (request?.type === 'livia-assistant-remember') {
    const tabId = sender.tab?.id;
    getEnabledPage(tabId, false).then((access) => {
      if (!access.tab) return sendResponse({ ok: false, error: access.error });
      return chrome.tabs.sendMessage(tabId, { type: 'remember-page' }).then(sendResponse);
    }).catch(() => sendResponse({ ok: false, error: 'Could not save this page.' }));
    return true;
  }

  if (request?.type === 'assistant-news') {
    if (typeof request.topic !== 'string' || !request.topic.trim() || request.topic.length > 120) {
      sendResponse({ ok: false, error: 'Enter a shorter page topic to search.' });
      return false;
    }
    chrome.tabs.create({ url: `https://news.google.com/search?q=${encodeURIComponent(request.topic.trim())}` })
      .then(() => sendResponse({ ok: true, message: `Opened Google News for: ${request.topic.trim()}` }))
      .catch(() => sendResponse({ ok: false, error: 'Could not open Google News.' }));
    return true;
  }

  if (request?.type === 'assistant-translate') {
    const languages = new Set(['en', 'es', 'fr', 'de', 'hi']);
    const pageUrl = sender.tab?.url;
    if (!languages.has(request.language) || typeof pageUrl !== 'string' || !/^https?:\/\//i.test(pageUrl)) {
      sendResponse({ ok: false, error: 'This page cannot be sent to Google Translate.' });
      return false;
    }
    const translateUrl = `https://translate.google.com/translate?sl=auto&tl=${request.language}&u=${encodeURIComponent(pageUrl)}`;
    chrome.tabs.create({ url: translateUrl })
      .then(() => sendResponse({ ok: true, message: 'Opened Google Translate in a new tab.' }))
      .catch(() => sendResponse({ ok: false, error: 'Could not open Google Translate.' }));
    return true;
  }

  if (request?.type === 'assistant-capture') {
    if (!Number.isInteger(sender.tab?.windowId)) {
      sendResponse({ ok: false, error: 'Could not identify the current browser window.' });
      return false;
    }
    chrome.tabs.captureVisibleTab(sender.tab.windowId, { format: 'png' }, (dataUrl) => {
      const error = chrome.runtime.lastError;
      if (error || !dataUrl) {
        sendResponse({ ok: false, error: error?.message || 'Screenshot capture was denied.' });
        return;
      }
      sendResponse({ ok: true, dataUrl });
    });
    return true;
  }

  if (request?.type !== 'enable-site' || !Number.isInteger(request.tabId)) return false;
  chrome.tabs.get(request.tabId)
    .then((tab) => injectIntoTab(tab))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'Could not read the active tab. Open a normal website and try again.' }));
  return true;
});

chrome.runtime.onMessageExternal.addListener((request, sender, sendResponse) => {
  if (!workspaceSenderAllowed(sender)) {
    sendResponse({ ok: false, error: 'This website is not authorized to control LIVIA.' });
    return false;
  }
  handleWorkspaceRequest(request)
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'LIVIA could not complete the workspace request.' }));
  return true;
});
