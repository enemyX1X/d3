const state = { paused: false, disabledSites: [], analysisEnabled: true, host: '' };
const messageEl = document.getElementById('message');
const statusEl = document.querySelector('.status');

function setMessage(text) {
  messageEl.textContent = text;
}

async function getTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function sendCommand(text) {
  const tab = await getTab();
  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: 'cmd', text });
    return result;
  } catch {
    setMessage('This page does not permit companion access.');
    return null;
  }
}

function renderState() {
  const isDisabled = state.disabledSites.includes(state.host);
  statusEl.textContent = state.paused || isDisabled ? '○ PAUSED' : '● ACTIVE';
  document.getElementById('pause').textContent = state.paused ? 'Resume companion' : 'Pause companion';
  document.getElementById('site').textContent = isDisabled ? 'Enable on this site' : 'Disable on this site';
  document.getElementById('analysis').textContent = state.analysisEnabled ? 'Disable page analysis' : 'Enable page analysis';
}

(async function initialize() {
  const tab = await getTab();
  state.host = tab && tab.url ? new URL(tab.url).hostname : '';

  const result = await chrome.storage.local.get('settings');
  Object.assign(state, result.settings || {});
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
  await chrome.storage.local.set({ settings: state });
  renderState();
});

document.getElementById('site').addEventListener('click', async () => {
  if (!state.host) {
    setMessage('This page does not permit companion access.');
    return;
  }

  if (state.disabledSites.includes(state.host)) {
    state.disabledSites = state.disabledSites.filter((site) => site !== state.host);
  } else {
    state.disabledSites.push(state.host);
  }
  await chrome.storage.local.set({ settings: state });
  renderState();
});

document.getElementById('analysis').addEventListener('click', async () => {
  state.analysisEnabled = !state.analysisEnabled;
  await chrome.storage.local.set({ settings: state });
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
