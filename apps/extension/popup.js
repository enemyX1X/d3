const state = { paused: false, disabledSites: [], analysisEnabled: true, host: '', sitePattern: null, siteGranted: false, tabId: null };
const messageEl = document.getElementById('message');
const statusEl = document.querySelector('.status');

function setMessage(text) {
  messageEl.textContent = text;
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function patternFor(tab) {
  try {
    const url = new URL(tab.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

function saveSettings() {
  return chrome.storage.local.set({
    settings: {
      paused: state.paused,
      disabledSites: state.disabledSites,
      analysisEnabled: state.analysisEnabled
    }
  });
}

async function sendCommand(text) {
  if (!state.sitePattern) {
    setMessage('Chrome protects this page. Open a normal http:// or https:// website to use LIVIA.');
    return null;
  }
  if (!state.siteGranted || state.disabledSites.includes(state.host)) {
    setMessage('Enable LIVIA for this site first.');
    return null;
  }
  const tab = await getTab();
  if (!tab?.id) return null;
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'cmd', text });
    return result;
  } catch (error) {
    setMessage(`Could not reach LIVIA on this tab: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function renderState() {
  const isEnabled = state.siteGranted && !state.disabledSites.includes(state.host);
  statusEl.textContent = !state.sitePattern ? '○ OPEN A WEBSITE' : state.paused ? '○ PAUSED' : isEnabled ? '● ACTIVE' : '○ SITE ACCESS OFF';
  document.getElementById('pause').textContent = state.paused ? 'Resume companion' : 'Pause companion';
  const siteButton = document.getElementById('site');
  siteButton.textContent = !state.sitePattern ? 'Open a webpage to enable' : isEnabled ? 'Disable on this site' : 'Enable on this site';
  siteButton.disabled = !state.sitePattern;
  siteButton.title = !state.sitePattern ? 'Browser settings and extension pages do not allow content scripts.' : '';
  document.getElementById('analysis').textContent = state.analysisEnabled ? 'Disable page analysis' : 'Enable page analysis';
}

(async function initialize() {
  const tab = await getTab();
  state.tabId = tab?.id || null;
  state.sitePattern = patternFor(tab);
  state.host = tab?.url ? new URL(tab.url).hostname : '';

  const result = await chrome.storage.local.get('settings');
  const settings = result.settings || {};
  state.paused = Boolean(settings.paused);
  state.disabledSites = Array.isArray(settings.disabledSites) ? settings.disabledSites : [];
  state.analysisEnabled = settings.analysisEnabled !== false;
  state.siteGranted = state.sitePattern ? await chrome.permissions.contains({ origins: [state.sitePattern] }) : false;
  if (!state.sitePattern) {
    setMessage('Chrome protects this page. Open a normal http:// or https:// website, then enable LIVIA there.');
  }
  if (state.siteGranted && !state.disabledSites.includes(state.host) && state.tabId) {
    const response = await chrome.runtime.sendMessage({ type: 'enable-site', tabId: state.tabId });
    if (!response?.ok) setMessage(response?.error || 'Could not enable LIVIA on this page.');
  }
  renderState();
})();

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    const text =
      action === 'transform' ? 'become a spaceship' :
      action === 'play' ? "let's play" :
      action === 'rebuild' ? 'rebuild the scene' :
      'companion mode';

    const response = await sendCommand(text);
    if (response && response.ok) setMessage('');
  });
});

document.getElementById('pause').addEventListener('click', async () => {
  state.paused = !state.paused;
  await saveSettings();
  renderState();
});

document.getElementById('site').addEventListener('click', async () => {
  if (!state.host || !state.sitePattern || !state.tabId) {
    setMessage('Chrome protects this page. Open a normal http:// or https:// website, then enable LIVIA there.');
    return;
  }

  if (state.siteGranted && !state.disabledSites.includes(state.host)) {
    state.disabledSites.push(state.host);
    await saveSettings();
    await chrome.permissions.remove({ origins: [state.sitePattern] });
    state.siteGranted = false;
    setMessage('LIVIA is disabled on this site.');
  } else {
    const granted = await chrome.permissions.request({ origins: [state.sitePattern] });
    if (!granted) {
      setMessage('Site access was not granted.');
      return;
    }
    state.siteGranted = true;
    state.disabledSites = state.disabledSites.filter((site) => site !== state.host);
    await saveSettings();
    const response = await chrome.runtime.sendMessage({ type: 'enable-site', tabId: state.tabId });
    if (!response?.ok) setMessage(response?.error || 'Could not enable LIVIA on this page.');
    else setMessage('LIVIA is enabled on this site.');
  }
  renderState();
});

document.getElementById('analysis').addEventListener('click', async () => {
  state.analysisEnabled = !state.analysisEnabled;
  await saveSettings();
  renderState();
});

document.getElementById('delete').addEventListener('click', async () => {
  await chrome.storage.local.clear();
  Object.assign(state, { paused: false, disabledSites: [], analysisEnabled: true });
  renderState();
  setMessage('Local data deleted.');
});

document.getElementById('command').addEventListener('keydown', async (event) => {
  if (event.key !== 'Enter') return;
  const text = event.target.value.trim();
  if (!text) return;
  event.target.value = '';
  const response = await sendCommand(text);
  if (response) setMessage(response.ok ? 'Done.' : response.error || 'Command failed.');
});
