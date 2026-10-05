const contentFiles = ['core.js', 'livia-character.js', 'content.js'];
const pendingInjections = new Map();

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

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || request?.type !== 'enable-site' || !Number.isInteger(request.tabId)) return false;
  chrome.tabs.get(request.tabId)
    .then((tab) => injectIntoTab(tab))
    .then(sendResponse)
    .catch(() => sendResponse({ ok: false, error: 'Could not read the active tab. Open a normal website and try again.' }));
  return true;
});
