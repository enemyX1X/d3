const state = { paused: false, disabledSites: [], analysisEnabled: true, host: '', sitePattern: null, siteGranted: false, tabId: null, localAgentToken: '', localAgentGranted: false, localConversation: [], foundElementId: '', foundElementLabel: '' };
const localAgentUrl = 'http://127.0.0.1:4317';
const localAgentPermission = 'http://127.0.0.1/*';
let voiceRecorder = null;
let voiceStream = null;
let voiceAudioContext = null;
let voiceVadTimer = 0;
let voiceChunks = [];
let uploadVoiceOnStop = false;
let voiceAudio = null;
let voiceAudioUrl = '';
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
    if (self.isLIVIAControlPage(url.href)) return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

async function sendCommand(text) {
  if (!state.sitePattern) {
    setMessage('Open a normal website to use LIVIA.');
    return null;
  }
  if (!state.siteGranted || state.disabledSites.includes(state.host)) {
    setMessage('Enable LIVIA for this site first.');
    return null;
  }
  if (!state.tabId) return null;
  try {
    return await chrome.tabs.sendMessage(state.tabId, { type: 'cmd', text });
  } catch (error) {
    setMessage(`Could not reach LIVIA on this tab: ${error instanceof Error ? error.message : String(error)}`);
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

function clearFoundElement() {
  state.foundElementId = '';
  state.foundElementLabel = '';
  document.getElementById('click-confirm').checked = false;
  document.getElementById('scroll-found').disabled = true;
  document.getElementById('click-found').disabled = true;
}

async function inspectScene() {
  clearFoundElement();
  if (!state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
    setMessage('Enable LIVIA on this site first.');
    return;
  }
  const report = document.getElementById('scene-report');
  try {
    const sceneResponse = await chrome.tabs.sendMessage(state.tabId, { type: 'get-scene', maxNodes: 500 });
    if (!sceneResponse?.ok || !sceneResponse.scene) {
      setMessage(sceneResponse?.error || 'Could not inspect this page.');
      return;
    }
    const { scene } = sceneResponse;
    const counts = scene.nodes.reduce((result, node) => {
      result[node.type] = (result[node.type] || 0) + 1;
      return result;
    }, {});
    report.textContent = [
      scene.page.title || 'Untitled page',
      scene.page.url,
      `${scene.nodes.length} visible objects`,
      ...Object.entries(counts).sort(([first], [second]) => first.localeCompare(second)).map(([type, count]) => `${type}: ${count}`),
      'Snapshot stays in this tab.'
    ].join('\n');
    report.setAttribute('aria-hidden', 'false');
    setMessage('Local scene snapshot ready.');
  } catch (error) {
    setMessage(`Could not inspect this tab: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function findSceneElement() {
  clearFoundElement();
  const query = document.getElementById('find-query').value.trim();
  if (!query) {
    setMessage('Describe an element, such as “largest image” or “main button”.');
    return;
  }
  if (!state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
    setMessage('Enable LIVIA on this site first.');
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(state.tabId, { type: 'find-element', query, limit: 3 });
    if (!response?.ok) {
      setMessage(response?.error || 'Could not search visible elements.');
      return;
    }
    const report = document.getElementById('find-report');
    state.foundElementId = response.results[0]?.id || '';
    state.foundElementLabel = response.results[0] ? `${response.results[0].type} ${response.results[0].text || ''}`.trim() : '';
    document.getElementById('click-confirm').checked = false;
    document.getElementById('scroll-found').disabled = !state.foundElementId;
    document.getElementById('click-found').disabled = true;
    report.textContent = response.results.length
      ? response.results.map((item, index) => `${index + 1}. ${item.type}${item.semanticRole ? ` (${item.semanticRole})` : ''}${item.text ? ` — ${item.text}` : ''}\n${Math.round(item.bounds.x)}, ${Math.round(item.bounds.y)} · ${Math.round(item.bounds.w)} × ${Math.round(item.bounds.h)} · confidence ${item.confidence}`).join('\n\n')
      : 'No matching visible element found.';
    report.setAttribute('aria-hidden', 'false');
    setMessage(`Found ${response.results.length} visible match${response.results.length === 1 ? '' : 'es'}.`);
  } catch {
    setMessage('Could not reach LIVIA on this tab.');
  }
}

async function runSelectedElementAction(type) {
  if (!state.foundElementId || !state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
    setMessage('Find a visible element on an enabled site first.');
    return;
  }
  if (type === 'click-element' && !document.getElementById('click-confirm').checked) {
    setMessage('Confirm the selected website action before activating it.');
    return;
  }
  try {
    const response = await chrome.tabs.sendMessage(state.tabId, {
      type,
      id: state.foundElementId,
      ...(type === 'click-element' ? { confirmed: true } : {})
    });
    if (!response?.ok || !response.verified) {
      setMessage(response?.error || 'LIVIA could not verify the action. Inspect the page before retrying.');
      clearFoundElement();
      return;
    }
    setMessage(type === 'scroll-element' ? 'Element scrolled into view and verified.' : `Activated ${state.foundElementLabel}; page change verified.`);
    clearFoundElement();
  } catch {
    setMessage('Action could not be verified. Check the page state before retrying.');
    clearFoundElement();
  }
}

async function sendMemoryRequest(request) {
  if (!state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
    setMessage('Enable LIVIA on this site first.');
    return null;
  }
  try {
    return await chrome.tabs.sendMessage(state.tabId, request);
  } catch (error) {
    setMessage(`Could not reach LIVIA on this tab: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function rememberPage() {
  const sceneResponse = await sendMemoryRequest({ type: 'get-scene', maxNodes: 250 });
  if (!sceneResponse?.ok) {
    setMessage(sceneResponse?.error || 'Could not read this page for local memory.');
    return;
  }
  const memory = LIVIAMemory.createPageMemory(sceneResponse.scene);
  if (!memory) {
    setMessage('This page has no safe title or URL to remember.');
    return;
  }
  const embedding = await requestLocalEmbedding(`${memory.title}\n${memory.summary}`);
  const response = await sendMemoryRequest({ type: 'remember-page', memory, ...(embedding ? { embedding } : {}) });
  if (!response) return;
  if (!response.ok) {
    setMessage(response.error || 'Could not remember this page.');
    return;
  }
  setMessage(embedding ? `Remembered locally with hybrid search: ${response.memory.title}` : `Remembered locally with keyword search: ${response.memory.title}`);
}

async function requestLocalEmbedding(text) {
  if (!state.localAgentToken || !state.localAgentGranted) return null;
  try {
    const response = await fetch(`${localAgentUrl}/v1/embeddings`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { authorization: `Bearer ${state.localAgentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ texts: [text.slice(0, 4_000)] })
    });
    if (!response.ok) return null;
    const result = await response.json();
    const vector = result?.vectors?.[0];
    return result.ok && Array.isArray(vector) && vector.length > 0 && vector.length <= 2048 && vector.every(Number.isFinite) ? vector : null;
  } catch {
    return null;
  }
}

async function searchMemory() {
  const query = document.getElementById('memory-query').value.trim();
  if (!query) {
    setMessage('Enter a few words to search saved pages.');
    return;
  }
  const embedding = await requestLocalEmbedding(query);
  const response = await sendMemoryRequest({ type: 'search-memory', query, limit: 5, ...(embedding ? { embedding } : {}) });
  if (!response) return;
  if (!response.ok) {
    setMessage(response.error || 'Memory search failed.');
    return;
  }
  const report = document.getElementById('memory-report');
  report.textContent = response.results.length
    ? response.results.map((item, index) => `${index + 1}. ${item.title}\n${item.url}\n${item.summary}`).join('\n\n')
    : 'No matching saved pages.';
  report.setAttribute('aria-hidden', 'false');
  setMessage(`${response.results.length} local ${embedding ? 'hybrid' : 'keyword'} result${response.results.length === 1 ? '' : 's'}.`);
}

function renderLocalAgent() {
  const connected = Boolean(state.localAgentToken && state.localAgentGranted);
  document.getElementById('agent-connect').textContent = connected ? 'Disconnect local model' : 'Connect local model';
  document.getElementById('agent-token').disabled = connected;
  document.getElementById('agent-ask').disabled = !connected;
  document.getElementById('agent-vision').disabled = !connected;
  document.getElementById('agent-voice').disabled = !connected;
  document.getElementById('agent-voice').textContent = voiceRecorder ? 'Stop and transcribe' : 'Start local voice input';
  document.getElementById('agent-speak').disabled = !connected || !state.lastAgentResponse;
}

async function connectLocalAgent() {
  const tokenInput = document.getElementById('agent-token');
  const token = tokenInput.value.trim();
  if (token.length < 32) {
    setMessage('Enter the local agent token (at least 32 characters).');
    return;
  }
  try {
    const granted = await chrome.permissions.request({ origins: [localAgentPermission] });
    if (!granted) {
      setMessage('Loopback access was not granted.');
      return;
    }
    const health = await fetch(`${localAgentUrl}/health`, { cache: 'no-store', credentials: 'omit' });
    if (!health.ok) {
      setMessage('Local agent is not responding. Start it and check its allowed extension origin.');
      return;
    }
    await chrome.storage.local.set({ liviaLocalAgentToken: token });
    state.localAgentToken = token;
    state.localAgentGranted = true;
    state.localConversation = [];
    tokenInput.value = '';
    renderLocalAgent();
    setMessage('Connected to the local agent.');
  } catch {
    setMessage('Could not connect. Check that the local agent is running and allows this extension origin.');
  }
}

async function disconnectLocalAgent() {
  stopVoiceCapture(false);
  voiceAudio?.pause();
  voiceAudio = null;
  if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl);
  voiceAudioUrl = '';
  await chrome.storage.local.remove('liviaLocalAgentToken');
  await chrome.permissions.remove({ origins: [localAgentPermission] });
  state.localAgentToken = '';
  state.localAgentGranted = false;
  state.localConversation = [];
  state.lastAgentResponse = '';
  const report = document.getElementById('agent-response');
  report.textContent = '';
  report.setAttribute('aria-hidden', 'true');
  renderLocalAgent();
  setMessage('Local model disconnected.');
}

async function askLocalAgent() {
  const prompt = document.getElementById('agent-prompt').value.trim();
  if (!prompt || prompt.length > 4_000) {
    setMessage('Enter a prompt of 1 to 4,000 characters.');
    return;
  }
  if (!state.localAgentToken || !state.localAgentGranted) {
    setMessage('Connect the local model first.');
    return;
  }

  let outgoingPrompt = prompt;
  if (document.getElementById('agent-page-context').checked) {
    if (!state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
      setMessage('Enable LIVIA on this site before including page context.');
      return;
    }
    try {
      clearFoundElement();
      const sceneResponse = await chrome.tabs.sendMessage(state.tabId, { type: 'get-scene', maxNodes: 250 });
      if (!sceneResponse?.ok) {
        setMessage(sceneResponse?.error || 'Could not read the current page scene.');
        return;
      }
      outgoingPrompt = LIVIACore.createLocalContextPrompt(prompt, sceneResponse.scene, 4_000);
    } catch {
      setMessage('Could not read the current page scene.');
      return;
    }
  }
  const messages = [...state.localConversation.slice(-4), { role: 'user', content: outgoingPrompt }];
  try {
    const response = await fetch(`${localAgentUrl}/v1/chat`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { authorization: `Bearer ${state.localAgentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ task: document.getElementById('agent-task').value, messages })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setMessage(result.error || 'Local model request failed.');
      return;
    }
    state.localConversation.push({ role: 'user', content: prompt.slice(0, 1_800) });
    state.localConversation.push({ role: 'assistant', content: String(result.content).slice(0, 1_800) });
    state.localConversation = state.localConversation.slice(-8);
    state.lastAgentResponse = String(result.content).slice(0, 8_000);
    const report = document.getElementById('agent-response');
    report.textContent = state.localConversation.map((message) => `${message.role === 'user' ? 'You' : 'LIVIA'}: ${message.content}`).join('\n\n');
    report.setAttribute('aria-hidden', 'false');
    renderLocalAgent();
    document.getElementById('agent-prompt').value = '';
    setMessage(`Local response (${result.model}).`);
  } catch {
    setMessage('Local model request failed. Check that Ollama and the agent are running.');
  }
}

function releaseVoiceCapture() {
  window.clearInterval(voiceVadTimer);
  voiceVadTimer = 0;
  voiceStream?.getTracks().forEach((track) => track.stop());
  voiceStream = null;
  if (voiceAudioContext) void voiceAudioContext.close();
  voiceAudioContext = null;
  voiceRecorder = null;
  renderLocalAgent();
}

function stopVoiceCapture(upload = true) {
  if (!voiceRecorder) return;
  uploadVoiceOnStop = upload;
  window.clearInterval(voiceVadTimer);
  voiceVadTimer = 0;
  if (voiceRecorder.state === 'inactive') releaseVoiceCapture();
  else voiceRecorder.stop();
}

async function transcribeVoiceRecording(recording) {
  if (!recording.size || recording.size > 10 * 1024 * 1024) {
    setMessage('Recording is empty or exceeds 10 MB.');
    return;
  }
  setMessage('Transcribing locally...');
  try {
    const response = await fetch(`${localAgentUrl}/v1/speech/transcribe`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { authorization: `Bearer ${state.localAgentToken}`, 'content-type': recording.type || 'audio/webm' },
      body: recording
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setMessage(result.error || 'Local transcription failed.');
      return;
    }
    document.getElementById('agent-prompt').value = result.text;
    setMessage('Transcript ready. Review it, then choose Ask local model.');
  } catch {
    setMessage('Local transcription failed. Check whisper.cpp setup.');
  }
}

async function startLocalVoiceInput() {
  if (voiceRecorder) {
    stopVoiceCapture(true);
    return;
  }
  if (!state.localAgentToken || !state.localAgentGranted || !navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setMessage('Connect local AI and allow microphone access to record.');
    return;
  }
  try {
    voiceStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type));
    voiceRecorder = new MediaRecorder(voiceStream, mimeType ? { mimeType } : undefined);
    voiceChunks = [];
    uploadVoiceOnStop = true;
    const recorder = voiceRecorder;
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size) voiceChunks.push(event.data);
    });
    recorder.addEventListener('stop', () => {
      const shouldUpload = uploadVoiceOnStop;
      const recording = new Blob(voiceChunks, { type: recorder.mimeType || 'audio/webm' });
      voiceChunks = [];
      releaseVoiceCapture();
      if (shouldUpload) void transcribeVoiceRecording(recording);
    }, { once: true });
    recorder.start(250);
    const startedAt = Date.now();
    let heardSpeech = false;
    let lastSpeechAt = startedAt;
    const AudioContextType = window.AudioContext || window.webkitAudioContext;
    if (AudioContextType) {
      voiceAudioContext = new AudioContextType();
      await voiceAudioContext.resume();
      const analyser = voiceAudioContext.createAnalyser();
      analyser.fftSize = 512;
      voiceAudioContext.createMediaStreamSource(voiceStream).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      voiceVadTimer = window.setInterval(() => {
        analyser.getFloatTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
        const now = Date.now();
        if (rms > 0.018) {
          heardSpeech = true;
          lastSpeechAt = now;
        }
        if (now - startedAt >= 15_000 || (heardSpeech && now - lastSpeechAt > 900)) stopVoiceCapture(true);
      }, 100);
    } else {
      voiceVadTimer = window.setTimeout(() => stopVoiceCapture(true), 15_000);
    }
    renderLocalAgent();
    setMessage('Recording locally. Stop speaking or click Stop and transcribe.');
  } catch {
    stopVoiceCapture(false);
    releaseVoiceCapture();
    setMessage('Microphone permission was not granted or recording is unavailable.');
  }
}

async function speakLatestResponse() {
  if (!state.localAgentToken || !state.localAgentGranted || !state.lastAgentResponse) return;
  try {
    const response = await fetch(`${localAgentUrl}/v1/speech/speak`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { authorization: `Bearer ${state.localAgentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ text: state.lastAgentResponse.slice(0, 2_000) })
    });
    if (!response.ok) {
      const error = await response.json();
      setMessage(error.error || 'Local speech synthesis failed.');
      return;
    }
    if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl);
    voiceAudioUrl = URL.createObjectURL(await response.blob());
    voiceAudio = new Audio(voiceAudioUrl);
    voiceAudio.addEventListener('ended', () => {
      if (voiceAudioUrl) URL.revokeObjectURL(voiceAudioUrl);
      voiceAudioUrl = '';
    }, { once: true });
    await voiceAudio.play();
    setMessage('Speaking with local Piper.');
  } catch {
    setMessage('Local speech synthesis failed. Check Piper setup.');
  }
}

async function downsizeScreenshot(dataUrl) {
  const image = new Image();
  image.src = dataUrl;
  await image.decode();
  const scale = Math.min(1, 1280 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Screenshot processing is unavailable.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.72).split(',')[1];
}

async function analyzeScreenshotLocally() {
  if (!state.localAgentToken || !state.localAgentGranted) {
    setMessage('Connect the local model first.');
    return;
  }
  if (!state.siteGranted || state.disabledSites.includes(state.host) || !state.tabId) {
    setMessage('Enable LIVIA on this site before capturing it.');
    return;
  }
  const question = document.getElementById('vision-question').value.trim();
  if (!question || question.length > 500) {
    setMessage('Enter a question of 1 to 500 characters.');
    return;
  }

  try {
    const tab = await getTab();
    if (!tab?.windowId) {
      setMessage('Could not identify the active browser window.');
      return;
    }
    const captured = await chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' });
    const image = await downsizeScreenshot(captured);
    const response = await fetch(`${localAgentUrl}/v1/vision`, {
      method: 'POST',
      cache: 'no-store',
      credentials: 'omit',
      headers: { authorization: `Bearer ${state.localAgentToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ mimeType: 'image/jpeg', image, question })
    });
    const result = await response.json();
    if (!response.ok || !result.ok) {
      setMessage(result.error || 'Local vision request failed.');
      return;
    }
    const report = document.getElementById('vision-response');
    report.textContent = result.content;
    report.setAttribute('aria-hidden', 'false');
    setMessage(`Screenshot analyzed locally (${result.model}).`);
  } catch {
    setMessage('Could not analyze screenshot. Check page permission, local agent, and vision model setup.');
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
  const localSettings = await chrome.storage.local.get('liviaLocalAgentToken');
  state.localAgentToken = typeof localSettings.liviaLocalAgentToken === 'string' ? localSettings.liviaLocalAgentToken : '';
  state.localAgentGranted = await chrome.permissions.contains({ origins: [localAgentPermission] });
  state.siteGranted = state.sitePattern ? await chrome.permissions.contains({ origins: [state.sitePattern] }) : false;
  if (!state.sitePattern) {
    setMessage('The LIVIA task workspace is a control panel. Open another website to inspect it here.');
  }
  if (state.siteGranted && !state.disabledSites.includes(state.host) && state.tabId) {
    await chrome.storage.local.set({ liviaWorkspaceTabId: state.tabId });
    const response = await chrome.runtime.sendMessage({ type: 'enable-site', tabId: state.tabId });
    if (!response?.ok) setMessage(response?.error || 'Could not enable LIVIA on this page.');
  }
  renderState();
  renderLocalAgent();
})();

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    const text = action === 'transform' ? 'become a spaceship' : action === 'play' ? "let's play" : action === 'rebuild' ? 'rebuild the scene' : 'companion mode';
    const response = await sendCommand(text);
    if (response?.ok) setMessage(action === 'play' ? `Sweeping ${response.targets} visible text/image targets.` : '');
    else if (response?.error) setMessage(response.error);
  });
});

document.getElementById('pause').addEventListener('click', async () => {
  state.paused = !state.paused;
  await saveSettings();
  renderState();
});

document.getElementById('inspect').addEventListener('click', inspectScene);
document.getElementById('find-element').addEventListener('click', findSceneElement);
document.getElementById('scroll-found').addEventListener('click', () => runSelectedElementAction('scroll-element'));
document.getElementById('click-found').addEventListener('click', () => runSelectedElementAction('click-element'));
document.getElementById('click-confirm').addEventListener('change', (event) => {
  document.getElementById('click-found').disabled = !state.foundElementId || !event.target.checked;
});
document.getElementById('remember').addEventListener('click', rememberPage);
document.getElementById('recall').addEventListener('click', searchMemory);
document.getElementById('agent-connect').addEventListener('click', () => {
  if (state.localAgentToken && state.localAgentGranted) void disconnectLocalAgent();
  else void connectLocalAgent();
});
document.getElementById('agent-ask').addEventListener('click', askLocalAgent);
document.getElementById('agent-vision').addEventListener('click', analyzeScreenshotLocally);
document.getElementById('agent-voice').addEventListener('click', startLocalVoiceInput);
document.getElementById('agent-speak').addEventListener('click', speakLatestResponse);

document.getElementById('site').addEventListener('click', async () => {
  if (!state.host || !state.sitePattern || !state.tabId) {
    setMessage('The LIVIA task workspace is not an inspectable task page. Open another website.');
    return;
  }

  if (state.siteGranted && !state.disabledSites.includes(state.host)) {
    state.disabledSites.push(state.host);
    await saveSettings();
    await chrome.permissions.remove({ origins: [state.sitePattern] });
    state.siteGranted = false;
    const selected = await chrome.storage.local.get('liviaWorkspaceTabId');
    if (selected.liviaWorkspaceTabId === state.tabId) await chrome.storage.local.remove('liviaWorkspaceTabId');
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
    await chrome.storage.local.set({ liviaWorkspaceTabId: state.tabId });
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
  if (response) {
    const startedSweep = response.ok && response.action?.action === 'game' && response.action.on;
    setMessage(startedSweep ? `Sweeping ${response.targets} visible text/image targets.` : response.ok ? 'Done.' : response.error || 'Command failed.');
  }
});

