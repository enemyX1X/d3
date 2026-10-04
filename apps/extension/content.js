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

  const game = {
    targets: [],
    projectiles: [],
    particles: [],
    score: 0,
    combo: 0,
    lastHitAt: 0
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
  let lastFrameAt = 0;
  let scanTimer = 0;

  function applySettings(settings) {
    state.paused = Boolean(settings.paused);
    state.disabledSites = Array.isArray(settings.disabledSites) ? settings.disabledSites : [];
    state.analysisEnabled = settings.analysisEnabled !== false;
    if (!state.analysisEnabled && avatar.mode === 'play') {
      avatar.mode = 'companion';
      game.targets = [];
      game.projectiles = [];
    }
  }

  function applyAvatar(saved) {
    if (!saved || typeof saved !== 'object') return;
    if (LIVIACore.FORMS.includes(saved.form)) avatar.form = saved.form;
    if (typeof saved.scale === 'number' && saved.scale >= 0.25 && saved.scale <= 3) avatar.scale = saved.scale;
    if (typeof saved.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(saved.color)) avatar.color = saved.color;
  }

  function loadSettings() {
    chrome.storage.local.get(['settings', 'avatar'], (result) => {
      applySettings(result.settings || {});
      applyAvatar(result.avatar);
    });
  }

  function persistAvatar() {
    chrome.storage.local.set({ avatar: { form: avatar.form, scale: avatar.scale, color: avatar.color } });
  }

  function isSiteDisabled() {
    return state.disabledSites.includes(location.hostname);
  }

  function shouldOperate() {
    return !state.paused && !isSiteDisabled();
  }

  function resizeCanvas() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    ctx?.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function drawAvatar() {
    if (!ctx) return;
    const size = 22 * avatar.scale;
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

  function drawTarget(target, now) {
    if (target.destroyed && now - target.destroyedAt >= 5200) {
      target.destroyed = false;
      target.rebuildStartedAt = 0;
    }
    if (target.destroyed && !target.rebuildStartedAt) return;

    let alpha = 1;
    let scale = 1;
    if (target.rebuildStartedAt) {
      const progress = LIVIACore.rebuildProgress(target.rebuildStartedAt, now, 620);
      alpha = progress.e;
      scale = 0.72 + progress.e * 0.28;
      if (progress.done) {
        target.destroyed = false;
        target.rebuildStartedAt = 0;
      }
    }

    const bounds = target.bounds;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-(bounds.x + bounds.w / 2), -(bounds.y + bounds.h / 2));
    ctx.fillStyle = 'rgba(8, 18, 30, 0.58)';
    ctx.strokeStyle = avatar.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = avatar.color;
    ctx.shadowBlur = 12;
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#f4fbff';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.save();
    ctx.beginPath();
    ctx.rect(bounds.x + 4, bounds.y + 4, Math.max(0, bounds.w - 8), Math.max(0, bounds.h - 8));
    ctx.clip();
    ctx.fillText(target.text, bounds.x + 6, bounds.y + 6, Math.max(0, bounds.w - 12));
    ctx.restore();
    ctx.restore();
  }

  function destroyTarget(target, now) {
    if (!target || target.destroyed) return;
    target.destroyed = true;
    target.destroyedAt = now;
    target.rebuildStartedAt = 0;
    game.combo = now - game.lastHitAt < 1400 ? game.combo + 1 : 1;
    game.lastHitAt = now;
    game.score += LIVIACore.points(game.combo);
    game.particles.push(...LIVIACore.createFragments(target.bounds, 16));
    if (game.particles.length > 192) game.particles.splice(0, game.particles.length - 192);
  }

  function updateGame(delta, now) {
    for (let index = game.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = game.projectiles[index];
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.life -= delta;
      const target = LIVIACore.hitTest(game.targets, projectile);
      if (target) {
        destroyTarget(target, now);
        game.projectiles.splice(index, 1);
      } else if (projectile.life <= 0) {
        game.projectiles.splice(index, 1);
      }
    }

    for (let index = game.particles.length - 1; index >= 0; index -= 1) {
      const particle = game.particles[index];
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += 28 * delta;
      particle.life -= delta;
      if (particle.life <= 0) game.particles.splice(index, 1);
    }
  }

  function drawGame(now) {
    for (const target of game.targets) drawTarget(target, now);

    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.fillStyle = avatar.color;
    ctx.shadowColor = avatar.color;
    ctx.shadowBlur = 10;
    for (const projectile of game.projectiles) {
      ctx.beginPath();
      ctx.arc(projectile.x, projectile.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.min(1, particle.life);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${game.score}   COMBO ${game.combo}`, 16, 16);
    ctx.restore();
  }

  function fireProjectile() {
    const velocity = LIVIACore.aim(avatar, state.pointer, 760);
    game.projectiles.push({ x: avatar.x, y: avatar.y, ...velocity, life: 1.8 });
    if (game.projectiles.length > 24) game.projectiles.shift();
  }

  function refreshTargets() {
    const scene = scanVisibleText();
    game.targets = scene.map((element) => ({ ...element, destroyed: false, destroyedAt: 0, rebuildStartedAt: 0 }));
  }

  function rebuildTargets() {
    const now = performance.now();
    for (const target of game.targets) {
      if (target.destroyed) target.rebuildStartedAt = now;
    }
  }

  function destroyAllTargets() {
    const now = performance.now();
    for (const target of game.targets) destroyTarget(target, now);
  }

  function animate() {
    if (document.hidden) {
      frameId = 0;
      return;
    }
    const now = performance.now();
    const delta = lastFrameAt ? Math.min((now - lastFrameAt) / 1000, 0.05) : 0;
    lastFrameAt = now;

    if (shouldOperate()) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      if (avatar.mode === 'play') {
        updateGame(delta, now);
        drawGame(now);
      }
      drawAvatar();
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    frameId = requestAnimationFrame(animate);
  }

  function scanVisibleText() {
    if (!state.analysisEnabled) return [];

    const nodes = Array.from(document.body.querySelectorAll('h1, h2, h3, h4, p, li, a, [role="heading"], img'));
    const items = [];
    const seen = new Set();
    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) continue;
      if (isSensitive(node)) continue;
      if (node.closest('form, input, textarea, select, button, [contenteditable="true"], [role="textbox"], [aria-hidden="true"], [data-livia-ignore], #livia-companion')) continue;
      const style = window.getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;
      const isImage = node.tagName === 'IMG';
      const text = (isImage ? node.getAttribute('alt') || node.getAttribute('title') : node.innerText)?.trim();
      if (!text || text.length < 2) continue;
      const normalized = text.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(normalized)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 10 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
      seen.add(normalized);
      const x = Math.max(0, rect.left);
      const y = Math.max(0, rect.top);
      items.push({
        id: node.id || `el-${Math.random().toString(36).slice(2)}`,
        type: isImage ? 'IMAGE' : 'TEXT',
        text: text.slice(0, 120),
        bounds: { x, y, w: Math.min(rect.right, window.innerWidth) - x, h: Math.min(rect.bottom, window.innerHeight) - y }
      });
      if (items.length >= 60) break;
    }
    return items;
  }

  function onPointerMove(event) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  }

  function onPointerDown(event) {
    if (avatar.mode === 'play' && shouldOperate() && event.button === 0) fireProjectile();
  }

  function handleMessage(request, sender, sendResponse) {
    if (!request || typeof request !== 'object') return false;
    if (sender?.id && sender.id !== chrome.runtime.id) return false;
    if (request.type === 'sync') {
      chrome.storage.local.get(['settings', 'avatar'], (result) => {
        applySettings(result.settings || {});
        applyAvatar(result.avatar);
        sendResponse({ ok: true, state: { form: avatar.form, scale: avatar.scale, color: avatar.color } });
      });
      return true;
    }

    if (request.type === 'cmd') {
      if (typeof request.text !== 'string' || request.text.length > 200) {
        sendResponse({ ok: false, error: 'Commands must be 1 to 200 characters.' });
        return true;
      }
      const action = parse(request.text);
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
      if (action.action === 'game') {
        if (action.on && !state.analysisEnabled) {
          sendResponse({ ok: false, error: 'Enable page analysis to create local game targets.' });
          return true;
        }
        avatar.mode = action.on ? 'play' : 'companion';
        if (action.on) refreshTargets();
        else {
          game.targets = [];
          game.projectiles = [];
          game.particles = [];
        }
      }
      if (action.action === 'destroy') destroyAllTargets();
      if (action.action === 'rebuild') rebuildTargets();
      if (action.action === 'move') {
        avatar.x = state.pointer.x;
        avatar.y = state.pointer.y;
      }
      persistAvatar();
      sendResponse({ ok: true, action, score: game.score });
      return true;
    }

    return false;
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.settings) applySettings(changes.settings.newValue || {});
    if (changes.avatar) applyAvatar(changes.avatar.newValue);
  });
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', resizeCanvas);
  window.addEventListener('scroll', () => {
    if (avatar.mode !== 'play') return;
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(refreshTargets, 180);
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else if (!frameId) {
      lastFrameAt = 0;
      frameId = requestAnimationFrame(animate);
    }
  });
  loadSettings();
  resizeCanvas();
  frameId = requestAnimationFrame(animate);
})();
