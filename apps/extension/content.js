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
    smoke: [],
    textDebris: [],
    glassShards: [],
    tracers: [],
    score: 0,
    combo: 0,
    lastHitAt: 0,
    firing: false,
    nextMachineShotAt: 0,
    clearPendingAt: 0,
    clearUntil: 0,
    audioContext: null
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
    if (state.paused || state.disabledSites.includes(location.hostname)) game.firing = false;
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
    if (avatar.mode === 'play') {
      avatar.x = Math.min(64, window.innerWidth * 0.2);
      avatar.y = Math.max(64, window.innerHeight - 72);
    } else {
      avatar.vx *= 0.82;
      avatar.vy *= 0.82;
      avatar.x += (state.pointer.x - avatar.x) * 0.08 + avatar.vx;
      avatar.y += (state.pointer.y - avatar.y) * 0.08 + avatar.vy;
    }

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
    ctx.strokeStyle = avatar.color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = avatar.color;
    ctx.shadowBlur = 12;
    if (target.type === 'IMAGE' && target.imageElement?.complete && target.imageElement.naturalWidth > 0) {
      try {
        ctx.drawImage(target.imageElement, bounds.x, bounds.y, bounds.w, bounds.h);
      } catch {
        ctx.fillStyle = 'rgba(8, 18, 30, 0.58)';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
      ctx.fillStyle = 'rgba(8, 18, 30, 0.18)';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    } else {
      ctx.fillStyle = 'rgba(8, 18, 30, 0.58)';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
    ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
    ctx.shadowBlur = 0;
    if (target.type !== 'IMAGE') {
      ctx.fillStyle = '#f4fbff';
      ctx.font = '12px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      ctx.save();
      ctx.beginPath();
      ctx.rect(bounds.x + 4, bounds.y + 4, Math.max(0, bounds.w - 8), Math.max(0, bounds.h - 8));
      ctx.clip();
      ctx.fillText(target.text, bounds.x + 6, bounds.y + 6, Math.max(0, bounds.w - 12));
      ctx.restore();
    }
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
    if (target.type === 'IMAGE') {
      game.glassShards.push(...LIVIACore.createGlassShards(target.bounds, 32).map((shard) => ({
        ...shard,
        bounds: target.bounds,
        imageElement: target.imageElement
      })));
      if (game.glassShards.length > 128) game.glassShards.splice(0, game.glassShards.length - 128);
    } else {
      game.textDebris.push(...LIVIACore.createTextDebris(target.text, target.bounds));
      if (game.textDebris.length > 144) game.textDebris.splice(0, game.textDebris.length - 144);
    }
    game.particles.push(...LIVIACore.createFragments(target.bounds, 10));
    if (game.particles.length > 160) game.particles.splice(0, game.particles.length - 160);
    game.smoke.push(...LIVIACore.createSmoke(target.bounds, target.type === 'IMAGE' ? 14 : 9));
    if (game.smoke.length > 96) game.smoke.splice(0, game.smoke.length - 96);

    const clearPlan = LIVIACore.planSceneClear(game.targets, now);
    if (clearPlan) {
      game.firing = false;
      game.clearPendingAt = clearPlan.blankAt;
      game.clearUntil = clearPlan.respawnAt;
    }
  }

  function updateGame(delta, now) {
    if (game.firing && now >= game.nextMachineShotAt) fireMachineGun(now);

    for (let index = game.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = game.projectiles[index];
      const previous = { x: projectile.x, y: projectile.y };
      if (projectile.target && !projectile.target.destroyed) {
        projectile.targetPoint.x = projectile.target.bounds.x + projectile.target.bounds.w / 2;
        projectile.targetPoint.y = projectile.target.bounds.y + projectile.target.bounds.h / 2;
        const desired = LIVIACore.aim(projectile, projectile.targetPoint, 780);
        const turn = Math.min(1, delta * 5);
        projectile.vx += (desired.vx - projectile.vx) * turn;
        projectile.vy += (desired.vy - projectile.vy) * turn;
      }
      const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
      const step = projectile.kind === 'bullet'
        ? Math.min(speed * delta, Math.max(0, projectile.range - projectile.distanceTravelled))
        : speed * delta;
      projectile.x += projectile.vx / speed * step;
      projectile.y += projectile.vy / speed * step;
      projectile.life -= delta;
      if (projectile.kind === 'bullet') {
        projectile.distanceTravelled += step;
        const target = LIVIACore.hitTestSegment(game.targets, previous, projectile, 5);
        if (target) {
          destroyTarget(target, now);
          game.projectiles.splice(index, 1);
        } else if (projectile.distanceTravelled >= projectile.range || projectile.life <= 0) {
          game.projectiles.splice(index, 1);
        }
        continue;
      }

      const distance = Math.hypot(projectile.targetPoint.x - projectile.x, projectile.targetPoint.y - projectile.y);
      if (projectile.target && !projectile.target.destroyed && distance < 18) {
        destroyTarget(projectile.target, now);
        game.particles.push(...LIVIACore.createFragments({ x: projectile.x - 16, y: projectile.y - 16, w: 32, h: 32 }, 20));
        game.projectiles.splice(index, 1);
      } else if ((!projectile.target || projectile.target.destroyed) && distance < 18) {
        const target = LIVIACore.hitTest(game.targets, projectile.targetPoint);
        if (target) destroyTarget(target, now);
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

    for (let index = game.textDebris.length - 1; index >= 0; index -= 1) {
      const piece = game.textDebris[index];
      piece.x += piece.vx * delta;
      piece.y += piece.vy * delta;
      piece.vy += 38 * delta;
      piece.rotation += piece.spin * delta;
      piece.life -= delta;
      if (piece.life <= 0) game.textDebris.splice(index, 1);
    }

    for (let index = game.glassShards.length - 1; index >= 0; index -= 1) {
      const shard = game.glassShards[index];
      shard.x += shard.vx * delta;
      shard.y += shard.vy * delta;
      shard.vy += 22 * delta;
      shard.rotation += shard.spin * delta;
      shard.life -= delta;
      if (shard.life <= 0) game.glassShards.splice(index, 1);
    }

    for (let index = game.tracers.length - 1; index >= 0; index -= 1) {
      game.tracers[index].life -= delta;
      if (game.tracers[index].life <= 0) game.tracers.splice(index, 1);
    }

    for (let index = game.smoke.length - 1; index >= 0; index -= 1) {
      const puff = game.smoke[index];
      puff.x += puff.vx * delta;
      puff.y += puff.vy * delta;
      puff.size += 16 * delta;
      puff.life -= delta;
      if (puff.life <= 0) game.smoke.splice(index, 1);
    }
  }

  function drawGame(now) {
    for (const target of game.targets) drawTarget(target, now);
    for (const puff of game.smoke) drawSmoke(puff);

    ctx.save();
    ctx.fillStyle = avatar.color;
    ctx.shadowColor = avatar.color;
    ctx.shadowBlur = 10;
    for (const tracer of game.tracers) {
      ctx.globalAlpha = Math.min(1, tracer.life / 0.11);
      ctx.strokeStyle = '#d8fbff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(tracer.x1, tracer.y1);
      ctx.lineTo(tracer.x2, tracer.y2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const projectile of game.projectiles) {
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.atan2(projectile.vy, projectile.vx));
      if (projectile.kind === 'bullet') {
        ctx.strokeStyle = 'rgba(255, 199, 74, 0.72)';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#ffbf3f';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(-21, 0);
        ctx.lineTo(-4, 0);
        ctx.stroke();
        ctx.fillStyle = '#fff2b0';
        ctx.beginPath();
        ctx.ellipse(0, 0, 5, 2.1, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = '#fff3bd';
        ctx.shadowColor = '#ffb84d';
        ctx.shadowBlur = 16;
        ctx.beginPath();
        ctx.moveTo(12, 0);
        ctx.lineTo(-8, -4);
        ctx.lineTo(-5, 0);
        ctx.lineTo(-8, 4);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }
    for (const particle of game.particles) {
      ctx.globalAlpha = Math.min(1, particle.life);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    for (const piece of game.textDebris) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, piece.life);
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.rotation);
      ctx.font = `600 ${piece.size}px system-ui, sans-serif`;
      ctx.fillStyle = '#f4fbff';
      ctx.fillText(piece.glyph, 0, 0);
      ctx.restore();
    }
    for (const shard of game.glassShards) drawGlassShard(shard);

    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.textBaseline = 'top';
    ctx.fillText(`SCORE ${game.score}   COMBO ${game.combo}`, 16, 16);
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillStyle = '#d7e7f2';
    ctx.fillText('LMB / SPACE  MACHINE GUN     RMB / M  MISSILE', 16, 34);
    ctx.restore();

    drawReticle();
  }

  function drawSmoke(puff) {
    const life = Math.max(0, puff.life / puff.maxLife);
    const radius = puff.size * (1.4 - life * 0.35);
    const gradient = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, radius);
    gradient.addColorStop(0, `rgba(186, 202, 211, ${0.18 * life})`);
    gradient.addColorStop(0.68, `rgba(111, 137, 151, ${0.12 * life})`);
    gradient.addColorStop(1, 'rgba(77, 96, 108, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(puff.x, puff.y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGlassShard(shard) {
    const center = shard.points.reduce((sum, point) => ({ x: sum.x + point.x / 3, y: sum.y + point.y / 3 }), { x: 0, y: 0 });
    ctx.save();
    ctx.globalAlpha = Math.min(1, shard.life);
    ctx.translate(shard.x, shard.y);
    ctx.translate(center.x, center.y);
    ctx.rotate(shard.rotation);
    ctx.translate(-center.x, -center.y);
    ctx.beginPath();
    ctx.moveTo(shard.points[0].x, shard.points[0].y);
    ctx.lineTo(shard.points[1].x, shard.points[1].y);
    ctx.lineTo(shard.points[2].x, shard.points[2].y);
    ctx.closePath();
    ctx.save();
    ctx.clip();
    if (shard.imageElement?.complete && shard.imageElement.naturalWidth > 0) {
      try {
        ctx.drawImage(shard.imageElement, shard.bounds.x, shard.bounds.y, shard.bounds.w, shard.bounds.h);
      } catch {
        ctx.fillStyle = 'rgba(145, 226, 255, 0.5)';
        ctx.fill();
      }
    } else {
      ctx.fillStyle = 'rgba(145, 226, 255, 0.5)';
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(213, 247, 255, 0.95)';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#7ce7ff';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.restore();
  }

  function drawReticle() {
    const target = LIVIACore.hitTest(game.targets, state.pointer);
    const color = target ? '#ffd27a' : '#e8fbff';
    ctx.save();
    ctx.translate(state.pointer.x, state.pointer.y);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0, Math.PI * 2);
    ctx.moveTo(-19, 0);
    ctx.lineTo(-7, 0);
    ctx.moveTo(7, 0);
    ctx.lineTo(19, 0);
    ctx.moveTo(0, -19);
    ctx.lineTo(0, -7);
    ctx.moveTo(0, 7);
    ctx.lineTo(0, 19);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function playWeaponSound(kind) {
    try {
      const AudioContextType = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextType) return;
      if (!game.audioContext) game.audioContext = new AudioContextType();
      if (game.audioContext.state === 'suspended') void game.audioContext.resume();

      const audio = game.audioContext;
      const startAt = audio.currentTime;
      const duration = kind === 'missile' ? 0.32 : 0.055;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = kind === 'missile' ? 'sawtooth' : 'square';
      oscillator.frequency.setValueAtTime(kind === 'missile' ? 190 : 920, startAt);
      oscillator.frequency.exponentialRampToValueAtTime(kind === 'missile' ? 58 : 280, startAt + duration);
      gain.gain.setValueAtTime(kind === 'missile' ? 0.075 : 0.035, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    } catch {
      // Audio is optional; gameplay remains available when browser audio is blocked.
    }
  }

  function fireMachineGun(now = performance.now()) {
    const speed = 1120;
    const targetPoint = { x: state.pointer.x, y: state.pointer.y };
    const velocity = LIVIACore.aim(avatar, targetPoint, speed, { x: 1, y: 0 });
    const angle = Math.atan2(velocity.vy, velocity.vx) + (Math.random() - 0.5) * 0.025;
    const distance = Math.max(18, Math.hypot(targetPoint.x - avatar.x, targetPoint.y - avatar.y));
    game.projectiles.push({
      kind: 'bullet',
      x: avatar.x,
      y: avatar.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.35,
      range: distance,
      distanceTravelled: 0
    });
    if (game.projectiles.filter((projectile) => projectile.kind === 'bullet').length > 84) {
      const oldest = game.projectiles.findIndex((projectile) => projectile.kind === 'bullet');
      if (oldest >= 0) game.projectiles.splice(oldest, 1);
    }
    game.nextMachineShotAt = now + 72;
    playWeaponSound('gun');
  }

  function fireMissile() {
    const target = LIVIACore.hitTest(game.targets, state.pointer);
    const targetPoint = target
      ? { x: target.bounds.x + target.bounds.w / 2, y: target.bounds.y + target.bounds.h / 2 }
      : { x: state.pointer.x, y: state.pointer.y };
    const speed = 780;
    const velocity = LIVIACore.aim(avatar, targetPoint, speed, { x: 0, y: -1 });
    const origin = Math.hypot(targetPoint.x - avatar.x, targetPoint.y - avatar.y) < 36
      ? { x: targetPoint.x - velocity.vx / speed * 54, y: targetPoint.y - velocity.vy / speed * 54 }
      : { x: avatar.x, y: avatar.y };
    game.projectiles.push({
      kind: 'missile',
      x: origin.x,
      y: origin.y,
      vx: velocity.vx,
      vy: velocity.vy,
      target,
      targetPoint,
      life: 2.2
    });
    const missiles = game.projectiles.filter((projectile) => projectile.kind === 'missile');
    if (missiles.length > 12) game.projectiles.splice(game.projectiles.indexOf(missiles[0]), 1);
    playWeaponSound('missile');
  }

  function refreshTargets() {
    const scene = scanVisibleText();
    game.targets = scene
      .filter((element) => {
        const nearestX = Math.max(element.bounds.x, Math.min(avatar.x, element.bounds.x + element.bounds.w));
        const nearestY = Math.max(element.bounds.y, Math.min(avatar.y, element.bounds.y + element.bounds.h));
        return Math.hypot(avatar.x - nearestX, avatar.y - nearestY) >= 96;
      })
      .map((element) => ({ ...element, destroyed: false, destroyedAt: 0, rebuildStartedAt: 0 }));
  }

  function rebuildTargets() {
    const now = performance.now();
    game.clearPendingAt = 0;
    game.clearUntil = 0;
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
        if (game.clearPendingAt && now >= game.clearPendingAt) {
          game.clearPendingAt = 0;
          game.projectiles = [];
          game.particles = [];
          game.smoke = [];
          game.textDebris = [];
          game.glassShards = [];
          game.tracers = [];
        }
        if (game.clearUntil && now >= game.clearUntil) {
          game.clearUntil = 0;
          refreshTargets();
        }
        if (game.clearUntil && !game.clearPendingAt && now < game.clearUntil) {
          frameId = requestAnimationFrame(animate);
          return;
        }
        updateGame(delta, now);
        drawAvatar();
        drawGame(now);
      } else {
        drawAvatar();
      }
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
      const imageElement = isImage ? node : null;
      const imageLabel = imageElement?.getAttribute('alt') || imageElement?.getAttribute('title');
      const text = (isImage ? imageLabel || 'IMAGE TARGET' : node.innerText)?.trim();
      if (!text || (!isImage && text.length < 2)) continue;
      const normalized = text.toLowerCase().replace(/\s+/g, ' ');
      if (!isImage && seen.has(normalized)) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 12 || rect.height < 10 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
      if (!isImage) seen.add(normalized);
      const x = Math.max(0, rect.left);
      const y = Math.max(0, rect.top);
      items.push({
        id: node.id || `el-${Math.random().toString(36).slice(2)}`,
        type: isImage ? 'IMAGE' : 'TEXT',
        text: text.slice(0, 120),
        imageElement,
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
    if (avatar.mode !== 'play' || !shouldOperate()) return;
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
    if (event.button === 0) {
      game.firing = true;
      fireMachineGun();
    } else if (event.button === 2) {
      fireMissile();
    }
  }

  function onPointerUp(event) {
    if (event.button === 0) game.firing = false;
  }

  function onContextMenu(event) {
    if (avatar.mode === 'play' && shouldOperate()) event.preventDefault();
  }

  function onKeyDown(event) {
    if (avatar.mode !== 'play' || !shouldOperate() || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (event.code === 'Space') {
      event.preventDefault();
      game.firing = true;
      fireMachineGun();
    } else if (event.code === 'KeyM') {
      event.preventDefault();
      fireMissile();
    }
  }

  function onKeyUp(event) {
    if (event.code === 'Space') game.firing = false;
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
        game.clearPendingAt = 0;
        game.clearUntil = 0;
        if (action.on) {
          avatar.x = Math.min(64, window.innerWidth * 0.2);
          avatar.y = Math.max(64, window.innerHeight - 72);
          refreshTargets();
        } else {
          game.targets = [];
          game.projectiles = [];
          game.particles = [];
          game.textDebris = [];
          game.glassShards = [];
          game.tracers = [];
          game.firing = false;
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
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('contextmenu', onContextMenu);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => { game.firing = false; });
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
