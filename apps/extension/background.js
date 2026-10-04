const contentFiles = ['core.js', 'content.js'];

function sitePattern(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function hasSiteAccess(tab) {
  const pattern = sitePattern(tab?.url);
  if (!tab?.id || !pattern) return false;
  const granted = await chrome.permissions.contains({ origins: [pattern] });
  if (!granted) return false;
  const { settings = {} } = await chrome.storage.local.get('settings');
  const host = new URL(tab.url).hostname;
  return !Array.isArray(settings.disabledSites) || !settings.disabledSites.includes(host);
}

async function injectIntoTab(tab) {
  if (!(await hasSiteAccess(tab))) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: contentFiles });
    await chrome.tabs.sendMessage(tab.id, { type: 'sync' });
    return true;
  } catch {
    return false;
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
    .then((enabled) => sendResponse({ ok: enabled }))
    .catch(() => sendResponse({ ok: false, error: 'This page does not permit companion access.' }));
  return true;
});
