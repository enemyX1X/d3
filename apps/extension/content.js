(() => {
  if (window.__liviaContentInitialized) return;
  window.__liviaContentInitialized = true;

  const { parse, valid, isSensitive } = self.LIVIACore;
  const state = {
    paused: false,
    disabledSites: [],
    analysisEnabled: true,
    host: location.hostname,
    pointer: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
  };

  const avatar = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
    vx: 0,
    vy: 0,
    form: 'sphere',
    scale: 1,
    color: '#7cf3ff',
    mode: 'companion'
  };

  const overlay = document.createElement('div');
  overlay.id = 'livia-companion';
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  overlay.appendChild(canvas);
  document.documentElement.appendChild(overlay);

  const ctx = canvas.getContext('2d');
  let frameId = 0;

  function loadSettings() {
    chrome.storage.local.get('settings', (result) => {
      const settings = result.settings || {};
      state.paused = Boolean(settings.paused);
      state.disabledSites = Array.isArray(settings.disabledSites) ? settings.disabledSites : [];
      state.analysisEnabled = settings.analysisEnabled !== false;
    });
  }

  function isSiteDisabled() {
    return state.disabledSites.includes(location.hostname);
  }

  function shouldOperate() {
    return !state.paused && !isSiteDisabled() && state.analysisEnabled;
  }

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function drawAvatar() {
    if (!ctx) return;
    const size = 22 * avatar.scale;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    avatar.vx *= 0.82;
    avatar.vy *= 0.82;
    avatar.x += (state.pointer.x - avatar.x) * 0.08 + avatar.vx;
    avatar.y += (state.pointer.y - avatar.y) * 0.08 + avatar.vy;

    ctx.save();
    ctx.translate(avatar.x, avatar.y);
    const gradient = ctx.createRadialGradient(-size, -size, 6, 0, 0, size * 1.6);
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(0.4, avatar.color);
    gradient.addColorStop(1, '#0a1823');
    ctx.fillStyle = gradient;
    ctx.strokeStyle = avatar.color;
    ctx.shadowColor = avatar.color;
    ctx.shadowBlur = 18;

    switch (avatar.form) {
      case 'sphere':
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'cube':
        ctx.fillRect(-size, -size, size * 2, size * 2);
        ctx.strokeRect(-size, -size, size * 2, size * 2);
        break;
      case 'spaceship':
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.3);
        ctx.lineTo(size * 0.9, size);
        ctx.lineTo(0, size * 0.7);
        ctx.lineTo(-size * 0.9, size);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      case 'robot':
        ctx.fillRect(-size * 0.8, -size * 0.8, size * 1.6, size * 1.6);
        ctx.strokeRect(-size * 0.8, -size * 0.8, size * 1.6, size * 1.6);
        break;
      case 'drone':
        ctx.beginPath();
        ctx.arc(0, 0, size * 0.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      case 'particle':
        for (let i = 0; i < 12; i += 1) {
          const angle = (Math.PI * 2 * i) / 12 + performance.now() / 900;
          const r = size * (0.8 + (i % 4) * 0.2);
          ctx.fillRect(Math.cos(angle) * r, Math.sin(angle) * r, 4, 4);
        }
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
    }

    ctx.restore();
  }

  function animate() {
    if (shouldOperate()) {
      drawAvatar();
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    frameId = requestAnimationFrame(animate);
  }

  function scanVisibleText() {
    if (!state.analysisEnabled) return [];

    const nodes = Array.from(document.body.querySelectorAll('h1, h2, h3, h4, p, li, a, span, div'));
    const items = [];
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (isSensitive(node)) continue;
      const text = node.innerText?.trim();
      if (!text || text.length < 2) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 10) continue;
      items.push({
        id: node.id || `el-${Math.random().toString(36).slice(2)}`,
        type: 'TEXT',
        text: text.slice(0, 120),
        bounds: { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
      });
    }
    return items.slice(0, 35);
  }

  function onPointerMove(event) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  }

  function handleMessage(request, sender, sendResponse) {
    if (!request || typeof request !== 'object') return false;
    if (request.type === 'sync') {
      loadSettings();
      sendResponse({ ok: true, state: { form: avatar.form, scale: avatar.scale, color: avatar.color } });
      return true;
    }

    if (request.type === 'cmd') {
      const action = parse(request.text || '');
      if (!action) {
        sendResponse({ ok: false, error: 'Command not understood.' });
        return true;
      }
      if (!valid(action)) {
        sendResponse({ ok: false, error: 'Unsupported command shape.' });
        return true;
      }

      if (action.action === 'transform') avatar.form = action.form;
      if (action.action === 'scale') avatar.scale = action.value;
      if (action.action === 'game') avatar.mode = action.on ? 'play' : 'companion';
      sendResponse({ ok: true, action });
      return true;
    }

    return false;
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  document.addEventListener('pointermove', onPointerMove);
  window.addEventListener('resize', resizeCanvas);
  loadSettings();
  resizeCanvas();
  animate();

  console.info('[LIVIA] extension content layer ready.');
  console.info('[LIVIA] permitted scene scan:', scanVisibleText());
})();
