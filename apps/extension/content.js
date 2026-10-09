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
    heading: 0,
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
    audioContext: null,
    startedAt: 0,
    clearSeconds: 0,
    totalTargets: 0,
    screenFlash: 0,
    screenShake: 0,
    moveKeys: { up: false, down: false, left: false, right: false },
    jumpFrom: null,
    jumpTo: null,
    jumpStartedAt: 0,
    jumpIndex: -1
  };

  const overlay = document.createElement('div');
  overlay.id = 'livia-companion';
  overlay.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647;';

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0;';
  overlay.appendChild(canvas);

  const characterCanvas = document.createElement('canvas');
  characterCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:1;';
  overlay.appendChild(characterCanvas);
  document.documentElement.appendChild(overlay);

  const ctx = canvas.getContext('2d');
  const character = self.LIVIACharacter?.create(characterCanvas, chrome.runtime.getURL('assets/box-02_robot.glb'));
  const assistantPanel = self.LIVIAAssistantPanel?.create(overlay);
  const assistantWidget = { contains: (target) => assistantPanel?.contains(target) || false };
  let frameId = 0;
  let lastFrameAt = 0;
  let scanTimer = 0;
  let sceneGeneration = 0;
  const sceneElementById = new Map();

  function toggleAssistantWidget(forceOpen) {
    assistantPanel?.toggle(forceOpen);
  }

  function applySettings(settings) {
    state.paused = Boolean(settings.paused);
    state.disabledSites = Array.isArray(settings.disabledSites) ? settings.disabledSites : [];
    state.analysisEnabled = settings.analysisEnabled !== false;
    if (state.paused || state.disabledSites.includes(location.hostname)) {
      game.firing = false;
      game.moveKeys = { up: false, down: false, left: false, right: false };
    }
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

  function drawAvatar(delta = 0) {
    if (!ctx) return;
    const previousX = avatar.x;
    const previousY = avatar.y;
    const size = 22 * avatar.scale;
    let moving = false;
    if (avatar.mode === 'play') {
      if (game.jumpFrom && game.jumpTo) {
        const progress = Math.min(1, Math.max(0, (performance.now() - game.jumpStartedAt) / 1000));
        const eased = progress * progress * (3 - 2 * progress);
        avatar.x = game.jumpFrom.x + (game.jumpTo.x - game.jumpFrom.x) * eased;
        avatar.y = game.jumpFrom.y + (game.jumpTo.y - game.jumpFrom.y) * eased;
        moving = progress < 1;
        if (progress >= 1) {
          game.jumpFrom = null;
          game.jumpTo = null;
          game.jumpStartedAt = 0;
        }
      } else {
        const horizontal = Number(game.moveKeys.right) - Number(game.moveKeys.left);
        const vertical = Number(game.moveKeys.down) - Number(game.moveKeys.up);
        const magnitude = Math.hypot(horizontal, vertical) || 1;
        const moveX = horizontal / magnitude;
        const moveY = vertical / magnitude;
        avatar.x = Math.max(28, Math.min(window.innerWidth - 28, avatar.x + moveX * 360 * delta));
        avatar.y = Math.max(28, Math.min(window.innerHeight - 28, avatar.y + moveY * 360 * delta));
        moving = horizontal !== 0 || vertical !== 0;
      }
      if (Math.hypot(state.pointer.x - avatar.x, state.pointer.y - avatar.y) > 5) {
        avatar.heading = Math.atan2(state.pointer.x - avatar.x, avatar.y - state.pointer.y);
      }
    } else {
      avatar.vx *= 0.82;
      avatar.vy *= 0.82;
      avatar.x += (state.pointer.x - avatar.x) * 0.08 + avatar.vx;
      avatar.y += (state.pointer.y - avatar.y) * 0.08 + avatar.vy;
    }
    const travelX = avatar.x - previousX;
    const travelY = avatar.y - previousY;
    moving ||= Math.hypot(travelX, travelY) > 0.45;

    if (character) {
      character.update({
        x: avatar.x,
        y: avatar.y,
        heading: avatar.heading,
        moving,
        scale: avatar.scale
      });
      if (character.ready) return;
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

  function drawTargetMask(target) {
    const bounds = target.bounds;
    ctx.fillStyle = target.coverColor || '#fff';
    ctx.fillRect(bounds.x - 2, bounds.y - 2, bounds.w + 4, bounds.h + 4);
  }

  function mediaSize(element) {
    if (element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0) {
      return { width: element.naturalWidth, height: element.naturalHeight };
    }
    if (element instanceof HTMLVideoElement && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && element.videoWidth > 0) {
      return { width: element.videoWidth, height: element.videoHeight };
    }
    if (element instanceof HTMLCanvasElement && element.width > 0 && element.height > 0) {
      return { width: element.width, height: element.height };
    }
    return null;
  }

  function drawMediaSurface(element, bounds) {
    if (!mediaSize(element)) return false;
    try {
      ctx.drawImage(element, bounds.x, bounds.y, bounds.w, bounds.h);
      return true;
    } catch {
      return false;
    }
  }

  function drawTarget(target, now) {
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
    if (scale !== 1) {
      ctx.translate(bounds.x + bounds.w / 2, bounds.y + bounds.h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(bounds.x + bounds.w / 2), -(bounds.y + bounds.h / 2));
    }
    if (target.type === 'IMAGE') {
      if (!drawMediaSurface(target.imageElement, bounds)) {
        ctx.fillStyle = target.coverColor || '#fff';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
    } else if (target.type === 'FRAME') {
      ctx.fillStyle = target.coverColor || 'rgba(12, 18, 28, 0.96)';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      ctx.strokeStyle = 'rgba(124, 243, 255, 0.72)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(bounds.x + 1, bounds.y + 1, Math.max(0, bounds.w - 2), Math.max(0, bounds.h - 2));
      ctx.fillStyle = '#d9f7ff';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'center';
      ctx.fillText(target.text || 'EMBEDDED PLAYER', bounds.x + bounds.w / 2, bounds.y + bounds.h / 2, Math.max(0, bounds.w - 16));
      ctx.textAlign = 'start';
    }
    if (target.type === 'TEXT') {
      ctx.fillStyle = target.textColor || '#17212b';
      ctx.font = target.font || '12px system-ui, sans-serif';
      ctx.textBaseline = 'top';
      const words = target.text.split(/\s+/);
      const maxWidth = Math.max(0, bounds.w);
      const lineHeight = target.lineHeight || 15;
      let line = '';
      let lineY = bounds.y;
      for (const word of words) {
        const next = line ? `${line} ${word}` : word;
        if (line && ctx.measureText(next).width > maxWidth) {
          ctx.fillText(line, bounds.x, lineY, maxWidth);
          lineY += lineHeight;
          line = word;
          if (lineY + lineHeight > bounds.y + bounds.h) break;
        } else {
          line = next;
        }
      }
      if (line && lineY < bounds.y + bounds.h + lineHeight) {
        ctx.fillText(line, bounds.x, lineY, maxWidth);
      }
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
    if (target.type !== 'TEXT') {
      game.glassShards.push(...LIVIACore.createGlassShards(target.bounds, 32).map((shard) => ({
        ...shard,
        bounds: target.bounds,
        imageElement: target.imageElement
      })));
      if (game.glassShards.length > 128) game.glassShards.splice(0, game.glassShards.length - 128);
    } else {
      game.textDebris.push(...LIVIACore.createTextDebris(target.text, target.bounds).map((piece) => ({
        ...piece,
        color: target.textColor || '#17212b'
      })));
      if (game.textDebris.length > 144) game.textDebris.splice(0, game.textDebris.length - 144);
    }
    game.particles.push(...LIVIACore.createFragments(target.bounds, 10));
    if (game.particles.length > 160) game.particles.splice(0, game.particles.length - 160);
    game.smoke.push(...LIVIACore.createSmoke(target.bounds, target.type !== 'TEXT' ? 14 : 9));
    if (game.smoke.length > 96) game.smoke.splice(0, game.smoke.length - 96);
    game.tracers.push({
      x1: target.bounds.x + target.bounds.w / 2,
      y1: target.bounds.y + target.bounds.h / 2,
      x2: target.bounds.x + target.bounds.w / 2 + (Math.random() - 0.5) * 14,
      y2: target.bounds.y + target.bounds.h / 2 + (Math.random() - 0.5) * 14,
      life: 0.12
    });

    const clearPlan = LIVIACore.planSceneClear(game.targets, now);
    if (clearPlan) {
      game.firing = false;
      game.clearSeconds = game.startedAt ? Math.max(0, (now - game.startedAt) / 1000) : 0;
      game.score += Math.max(0, Math.round((10 - game.clearSeconds) * 25));
      game.clearPendingAt = clearPlan.blankAt;
      game.clearUntil = clearPlan.respawnAt;
    }
  }

  function updateGame(delta, now) {
    game.screenFlash = Math.max(0, game.screenFlash - delta * 1.8);
    game.screenShake = Math.max(0, game.screenShake * 0.86 - delta * 1.5);

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
    ctx.save();

    for (const target of game.targets) {
      if (!LIVIACore.needsTargetMask(target)) continue;
      drawTargetMask(target);
      if (target.rebuildStartedAt) drawTarget(target, now);
    }
    for (const puff of game.smoke) drawSmoke(puff);

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
      ctx.fillStyle = piece.color;
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
    const remainingTargets = game.targets.reduce((remaining, target) => remaining + Number(!target.destroyed), 0);
    const controlsHint = window.innerWidth < 620
      ? 'WASD MOVE  SPACE HOP  MOUSE AIM/FIRE  Q ASSIST'
      : 'WASD MOVE  SPACE HOP  MOUSE AIM  LMB FIRE  RMB/M MISSILE  Q ASSIST';
    ctx.fillText(`TARGETS ${remainingTargets}/${game.totalTargets}  ${controlsHint}`, 16, 34);

    if (game.screenFlash > 0.02) {
      ctx.fillStyle = `rgba(255, 250, 220, ${Math.min(0.18, game.screenFlash)})`;
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
    }
    ctx.restore();

    drawReticle();
  }

  function drawClearScorecard(now) {
    ctx.save();
    const width = Math.min(520, window.innerWidth - 32);
    const height = 220;
    const x = (window.innerWidth - width) / 2;
    const y = (window.innerHeight - height) / 2;
    const secondsRemaining = Math.max(0, Math.ceil((game.clearUntil - now) / 1000));
    const wipeAlpha = Math.min(1, 0.72 + Math.sin(now / 180) * 0.08);

    const bg = ctx.createRadialGradient(window.innerWidth / 2, window.innerHeight / 2, 40, window.innerWidth / 2, window.innerHeight / 2, Math.max(window.innerWidth, window.innerHeight) * 0.7);
    bg.addColorStop(0, `rgba(17, 24, 37, ${0.42 + wipeAlpha * 0.38})`);
    bg.addColorStop(0.5, 'rgba(4, 8, 15, 0.9)');
    bg.addColorStop(1, 'rgba(1, 2, 4, 1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

    ctx.fillStyle = 'rgba(5, 12, 18, 0.8)';
    ctx.strokeStyle = '#7cf3ff';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = '#7cf3ff';
    ctx.shadowBlur = 24;
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x, y, width, height);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7cf3ff';
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillText('SCREEN WIPED', window.innerWidth / 2, y + 38);
    ctx.fillStyle = '#dfefff';
    ctx.font = '700 38px system-ui, sans-serif';
    ctx.fillText(`${game.clearSeconds.toFixed(2)} s`, window.innerWidth / 2, y + 94);
    ctx.fillStyle = '#f3f7fb';
    ctx.font = '600 15px system-ui, sans-serif';
    ctx.fillText(`CLEAR TIME`, window.innerWidth / 2, y + 124);
    ctx.fillText(`SCORE  ${game.score}`, window.innerWidth / 2, y + 154);
    ctx.fillStyle = '#93a8b7';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`NEXT SCENE IN ${secondsRemaining}s`, window.innerWidth / 2, y + 188);
    ctx.textAlign = 'start';
    ctx.restore();
  }

  function drawSmoke(puff) {
    const life = Math.max(0, puff.life / puff.maxLife);
    const radius = puff.size * (1.4 - life * 0.35);
    const gradient = ctx.createRadialGradient(puff.x, puff.y, 0, puff.x, puff.y, radius);
    gradient.addColorStop(0, `rgba(77, 89, 99, ${0.44 * life})`);
    gradient.addColorStop(0.68, `rgba(111, 126, 137, ${0.30 * life})`);
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
    if (!drawMediaSurface(shard.imageElement, shard.bounds)) {
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
    const bullet = {
      kind: 'bullet',
      x: avatar.x,
      y: avatar.y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 1.35,
      range: distance,
      distanceTravelled: 0
    };
    game.projectiles.push(bullet);
    if (game.projectiles.filter((projectile) => projectile.kind === 'bullet').length > 84) {
      const oldest = game.projectiles.findIndex((projectile) => projectile.kind === 'bullet');
      if (oldest >= 0) game.projectiles.splice(oldest, 1);
    }
    const muzzleX = avatar.x + Math.cos(angle) * 18;
    const muzzleY = avatar.y + Math.sin(angle) * 18;
    game.tracers.push({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + Math.cos(angle) * 54,
      y2: muzzleY + Math.sin(angle) * 54,
      life: 0.1
    });
    game.particles.push(...LIVIACore.createFragments({ x: muzzleX - 10, y: muzzleY - 10, w: 20, h: 20 }, 4));
    game.nextMachineShotAt = now + 72;
    game.screenFlash = Math.min(1, game.screenFlash + 0.18);
    game.screenShake = Math.min(20, game.screenShake + 3.8);
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
    const missile = {
      kind: 'missile',
      x: origin.x,
      y: origin.y,
      vx: velocity.vx,
      vy: velocity.vy,
      target,
      targetPoint,
      life: 2.2
    };
    game.projectiles.push(missile);
    const missiles = game.projectiles.filter((projectile) => projectile.kind === 'missile');
    if (missiles.length > 12) game.projectiles.splice(game.projectiles.indexOf(missiles[0]), 1);
    game.tracers.push({
      x1: origin.x,
      y1: origin.y,
      x2: origin.x + velocity.vx * 0.12,
      y2: origin.y + velocity.vy * 0.12,
      life: 0.18
    });
    game.screenFlash = Math.min(1, game.screenFlash + 0.22);
    game.screenShake = Math.min(26, game.screenShake + 5.4);
    character?.jump();
    playWeaponSound('missile');
  }

  function refreshTargets() {
    game.targets = scanVisibleText()
      .sort((first, second) => first.bounds.y - second.bounds.y || first.bounds.x - second.bounds.x)
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

  function buildPageScene(maxNodes = 250) {
    sceneGeneration += 1;
    sceneElementById.clear();
    const roots = [document.body || document.documentElement];
    const visitedRoots = new Set(roots);
    for (let rootIndex = 0; rootIndex < roots.length && roots.length < 64; rootIndex += 1) {
      for (const element of roots[rootIndex].querySelectorAll('*')) {
        if (element.shadowRoot && !visitedRoots.has(element.shadowRoot)) {
          roots.push(element.shadowRoot);
          visitedRoots.add(element.shadowRoot);
          if (roots.length >= 64) break;
        }
      }
    }

    const nodes = [];
    const ids = new WeakMap();
    const pageId = 'page';
    const pageRect = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
    nodes.push({ id: pageId, type: 'PAGE', parentId: null, children: [], text: document.title, bounds: pageRect, visible: true, source: 'dom', confidence: 1 });
    ids.set(document.body || document.documentElement, pageId);

    function classify(element, role) {
      const tag = element.tagName.toLowerCase();
      if (role === 'dialog' || tag === 'dialog') return 'DIALOG';
      if (role === 'menu' || tag === 'menu') return 'MENU';
      if (tag === 'nav' || role === 'navigation') return 'NAVIGATION';
      if (tag === 'table' || role === 'table' || role === 'grid') return 'TABLE';
      if (tag === 'form' || role === 'form') return 'FORM';
      if (tag === 'button' || role === 'button') return 'BUTTON';
      if (tag === 'a' || role === 'link') return 'LINK';
      if (tag === 'img' || tag === 'picture' || tag === 'canvas' || role === 'img') return 'IMAGE';
      if (tag === 'video') return 'VIDEO';
      if (tag === 'iframe') return 'FRAME';
      if (tag === 'input') return ['checkbox', 'radio', 'range'].includes(element.type) || LIVIACore.isSafeSearchInput(element) ? 'INPUT' : null;
      if (tag === 'article' || ['article', 'listitem'].includes(role) || /\b(card|tile)\b/i.test(element.className || '')) return 'CARD';
      if (/^(h[1-6]|p|li|dt|dd|blockquote|figcaption)$/.test(tag) || ['heading', 'paragraph', 'note'].includes(role)) return 'TEXT';
      if (/^(main|section|header|footer|aside)$/.test(tag) || ['main', 'region', 'complementary'].includes(role)) return 'SECTION';
      if (tag === 'svg' || role === 'icon') return 'ICON';
      return null;
    }

    for (const root of roots) {
      for (const element of root.querySelectorAll('*')) {
        if (nodes.length >= maxNodes) break;
        if (!(element instanceof HTMLElement || element instanceof SVGElement)) continue;
        if (element.closest?.('#livia-companion, [hidden], [inert], [data-livia-ignore]')) continue;
        const role = (element.getAttribute('role') || '').toLowerCase();
        const type = classify(element, role);
        if (!type) continue;
        if (element.closest?.('[contenteditable="true"], [role="textbox"], input[type="password"], textarea, [autocomplete="current-password"], [autocomplete="new-password"]')) continue;
        if (element.closest?.('form') && !['BUTTON', 'LINK', 'INPUT'].includes(type)) continue;
        if (!['BUTTON', 'LINK', 'INPUT'].includes(type) && LIVIACore.isSensitive(element)) continue;
        if (element instanceof HTMLInputElement && !['checkbox', 'radio', 'range'].includes(element.type) && !LIVIACore.isSafeSearchInput(element)) continue;
        if (element instanceof HTMLFormElement) continue;

        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05 || rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;

        const active = element === document.activeElement;
        const accessibleLabel = element.getAttribute('aria-label') || element.getAttribute('alt') || element.getAttribute('title') || (type === 'INPUT' ? element.getAttribute('placeholder') : '') || '';
        const text = type === 'INPUT' ? accessibleLabel : accessibleLabel || (type === 'TEXT' ? element.innerText || element.textContent || '' : element.innerText || '');
        let parentElement = element.parentElement || element.getRootNode?.().host || null;
        while (parentElement && !ids.has(parentElement)) {
          parentElement = parentElement.parentElement || parentElement.getRootNode?.().host || null;
        }
        const parentId = parentElement ? ids.get(parentElement) || pageId : pageId;

        const id = `scene-${sceneGeneration}-${nodes.length}`;
        const ariaSource = Boolean(role || accessibleLabel);
        const node = {
          id,
          type,
          parentId,
          children: [],
          ...(text ? { text: String(text).replace(/\s+/g, ' ').trim().slice(0, 400) } : {}),
          ...(role ? { semanticRole: role } : {}),
          bounds: { x: Math.max(0, rect.left), y: Math.max(0, rect.top), w: Math.min(rect.right, window.innerWidth) - Math.max(0, rect.left), h: Math.min(rect.bottom, window.innerHeight) - Math.max(0, rect.top) },
          visible: true,
          interactive: ['BUTTON', 'LINK', 'INPUT'].includes(type) || element.tabIndex >= 0,
          selected: element.getAttribute('aria-selected') === 'true' || element.getAttribute('aria-pressed') === 'true',
          focused: active,
          color: style.color,
          style: { font: style.font, backgroundColor: style.backgroundColor, display: style.display },
          source: ariaSource ? 'aria' : 'dom',
          confidence: ariaSource ? 0.95 : 0.82
        };
        nodes.push(node);
        ids.set(element, id);
        sceneElementById.set(id, element);
        const parent = nodes.find((candidate) => candidate.id === parentId);
        if (parent) parent.children.push(id);
      }
    }

    const url = `${location.origin}${location.pathname}`;
    return LIVIACore.createSceneGraph({
      page: { url, title: document.title },
      viewport: { width: window.innerWidth, height: window.innerHeight, scrollX: window.scrollX, scrollY: window.scrollY },
      nodes,
      timestamp: Date.now()
    });
  }

  function saveCurrentPageMemory(sendResponse) {
    if (!state.analysisEnabled) {
      sendResponse({ ok: false, error: 'Enable page analysis to remember this page.' });
      return false;
    }
    if (!self.LIVIAMemory) {
      sendResponse({ ok: false, error: 'Local memory is unavailable. Reload the extension and page.' });
      return false;
    }
    const memory = self.LIVIAMemory.createPageMemory(buildPageScene(250));
    if (!memory) {
      sendResponse({ ok: false, error: 'This page has no safe title or URL to remember.' });
      return false;
    }
    chrome.storage.local.get('pageMemories', (result) => {
      const memories = self.LIVIAMemory.upsertMemory(result.pageMemories, memory);
      chrome.storage.local.set({ pageMemories: memories }, () => {
        const error = chrome.runtime.lastError;
        if (error) sendResponse({ ok: false, error: 'Could not save local memory.' });
        else sendResponse({ ok: true, memory: { title: memory.title, url: memory.url, timestamp: memory.timestamp } });
      });
    });
    return true;
  }

  function storePageMemory(request, sendResponse) {
    if (!state.analysisEnabled) {
      sendResponse({ ok: false, error: 'Enable page analysis to remember this page.' });
      return false;
    }
    if (!self.LIVIAMemory?.validPageMemory(request.memory)) {
      sendResponse({ ok: false, error: 'Invalid local page-memory record.' });
      return false;
    }
    const memory = { ...request.memory };
    const embedding = self.LIVIAMemory.cleanEmbedding(request.embedding);
    if (embedding) memory.embedding = embedding;
    else delete memory.embedding;
    chrome.storage.local.get('pageMemories', (result) => {
      const memories = self.LIVIAMemory.upsertMemory(result.pageMemories, memory);
      chrome.storage.local.set({ pageMemories: memories }, () => {
        const error = chrome.runtime.lastError;
        if (error) sendResponse({ ok: false, error: 'Could not save local memory.' });
        else sendResponse({ ok: true, memory: { title: memory.title, url: memory.url, timestamp: memory.timestamp, embedded: Boolean(embedding) } });
      });
    });
    return true;
  }

  function searchPageMemory(request, sendResponse) {
    if (!self.LIVIAMemory?.validMemorySearchRequest(request)) {
      sendResponse({ ok: false, error: 'Enter a search query of 1 to 160 characters.' });
      return false;
    }
    chrome.storage.local.get('pageMemories', (result) => {
      const results = self.LIVIAMemory.rankMemories(request.query, result.pageMemories || [], request.limit || 5, request.embedding);
      sendResponse({ ok: true, results });
    });
    return true;
  }

  function getSceneActionTarget(id) {
    const element = sceneElementById.get(id);
    if (!(element instanceof HTMLElement) || !element.isConnected || element.closest('[contenteditable="true"], [role="textbox"], [hidden], [inert], [aria-hidden="true"]')) return null;
    if (element.closest('form') && !LIVIACore.isSafeSearchInput(element)) return null;
    const style = window.getComputedStyle(element);
    const bounds = element.getBoundingClientRect();
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05 || bounds.width < 1 || bounds.height < 1 || bounds.right <= 0 || bounds.bottom <= 0 || bounds.left >= window.innerWidth || bounds.top >= window.innerHeight) return null;
    return element;
  }

  function actionClickIsAllowed(element) {
    return LIVIACore.canActivateSceneElement({
      tagName: element.tagName,
      role: element.getAttribute('role'),
      disabled: element.disabled === true || element.getAttribute('aria-disabled') === 'true',
      insideForm: Boolean(element.closest('form')),
      ariaHidden: element.getAttribute('aria-hidden') === 'true',
      buttonType: element instanceof HTMLButtonElement ? element.type : '',
      download: element instanceof HTMLAnchorElement && element.hasAttribute('download'),
      target: element instanceof HTMLAnchorElement ? element.target : '',
      href: element instanceof HTMLAnchorElement ? element.href : '',
      origin: location.origin
    });
  }

  function handleSceneAction(request, sendResponse) {
    if (!LIVIACore.validElementActionRequest(request)) {
      sendResponse({ ok: false, error: 'Invalid browser-action request.' });
      return false;
    }
    const element = getSceneActionTarget(request.id);
    if (!element) {
      sendResponse({ ok: false, error: 'That scene target is stale or no longer visible. Find it again.' });
      return false;
    }
    if (request.type === 'scroll-element') {
      element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      window.setTimeout(() => {
        const bounds = element.getBoundingClientRect();
        const verified = bounds.width > 0 && bounds.height > 0 && bounds.bottom > 0 && bounds.right > 0 && bounds.top < window.innerHeight && bounds.left < window.innerWidth;
        sendResponse({ ok: verified, verified, error: verified ? undefined : 'Scroll target could not be brought into the viewport.' });
      }, 550);
      return true;
    }
    if (request.type === 'fill-search') {
      if (!LIVIACore.isSafeSearchInput(element) || element.disabled || element.readOnly || !element.isConnected) {
        sendResponse({ ok: false, error: 'The target is not an available, labeled search field.' });
        return false;
      }
      const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      if (!valueSetter) {
        sendResponse({ ok: false, error: 'This browser cannot safely update the search field.' });
        return false;
      }
      try {
        element.focus();
        valueSetter.call(element, request.value.trim());
        element.dispatchEvent(new Event('input', { bubbles: true }));
        element.dispatchEvent(new Event('change', { bubbles: true }));
        const verified = element.value === request.value.trim();
        sendResponse({ ok: verified, verified, error: verified ? undefined : 'The search field did not keep the approved query.' });
      } catch {
        sendResponse({ ok: false, error: 'The search field rejected the approved query.' });
      }
      return false;
    }
    if (!actionClickIsAllowed(element)) {
      sendResponse({ ok: false, error: 'For safety, LIVIA cannot activate form controls, external links, downloads, or new-tab links.' });
      return false;
    }

    const before = {
      url: location.href,
      text: element.textContent,
      pressed: element.getAttribute('aria-pressed'),
      expanded: element.getAttribute('aria-expanded')
    };
    let changed = false;
    const observedRoot = element.getRootNode();
    const observer = new MutationObserver(() => { changed = true; });
    observer.observe(observedRoot, { subtree: true, childList: true, attributes: true, characterData: true });
    try {
      element.click();
    } catch {
      observer.disconnect();
      sendResponse({ ok: false, error: 'The target rejected the click.' });
      return false;
    }
    window.setTimeout(() => {
      observer.disconnect();
      const verified = LIVIACore.verifyElementAction(before, {
        url: location.href,
        text: element.textContent,
        pressed: element.getAttribute('aria-pressed'),
        expanded: element.getAttribute('aria-expanded'),
        focused: document.activeElement === element
      }, changed);
      sendResponse({ ok: verified, verified, error: verified ? undefined : 'Click was sent, but LIVIA could not verify a page change. Check before retrying.' });
    }, 650);
    return true;
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
          game.screenFlash = 1;
          game.screenShake = 18;
        }
        if (game.clearUntil && now >= game.clearUntil) {
          game.clearUntil = 0;
          avatar.mode = 'companion';
          game.startedAt = 0;
          game.targets = [];
          game.totalTargets = 0;
        }
        if (game.clearUntil && !game.clearPendingAt && now < game.clearUntil) {
          character?.update({ x: avatar.x, y: avatar.y, heading: 0, moving: false, scale: avatar.scale });
          drawClearScorecard(now);
          frameId = requestAnimationFrame(animate);
          return;
        }
        updateGame(delta, now);
        drawAvatar(delta);
        drawGame(now);
      } else {
        drawAvatar(delta);
      }
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    frameId = requestAnimationFrame(animate);
  }

  function scanVisibleText() {
    if (!state.analysisEnabled) return [];
    const items = [];
    const maxTargets = 2400;
    const ignored = 'form, input, textarea, select, button, [contenteditable="true"], [role="textbox"], [data-livia-ignore], script, style, noscript, svg, #livia-companion';

    function collectOpenRoots(root) {
      const roots = [root];
      const visited = new Set(roots);
      for (let index = 0; index < roots.length && roots.length < 128; index += 1) {
        for (const element of roots[index].querySelectorAll('*')) {
          if (element.shadowRoot && !visited.has(element.shadowRoot)) {
            roots.push(element.shadowRoot);
            visited.add(element.shadowRoot);
            if (roots.length >= 128) break;
          }
        }
      }
      return roots;
    }

    function isIgnored(element, includeAriaHidden = true) {
      let current = element;
      while (current) {
        if (current.matches?.(ignored) || current.matches?.('[hidden], [inert]') || (includeAriaHidden && current.matches?.('[aria-hidden="true"]'))) return true;
        current = current.parentElement || current.getRootNode?.().host || null;
      }
      return false;
    }

    const roots = collectOpenRoots(document.body || document.documentElement || document);

    function isNonInteractiveSurface(element, allowAriaHidden = false) {
      if (!(element instanceof Element)) return false;
      if (element.closest?.('button, input, textarea, select, summary, [role="button"], [role="textbox"]')) return true;
      const excluded = allowAriaHidden
        ? '[hidden], [inert], [data-livia-ignore]'
        : '[hidden], [inert], [aria-hidden="true"], [data-livia-ignore]';
      return Boolean(element.closest?.(excluded));
    }

    function getCoverColor(element) {
      let current = element;
      while (current) {
        const color = window.getComputedStyle(current).backgroundColor;
        if (color && color !== 'transparent') {
          if (!color.startsWith('rgba(') || Number(color.slice(5, -1).split(',')[3]) >= 0.95) return color;
        }
        current = current.parentElement || current.getRootNode?.().host || null;
      }
      return '#fff';
    }

    function visibleStyle(element, isMedia = false) {
      if (!(element instanceof Element) || isSensitive(element) || isIgnored(element, !isMedia) || isNonInteractiveSurface(element, isMedia)) return null;
      if (element.hidden || element.closest?.('[hidden], [inert]') || (!isMedia && element.closest?.('[aria-hidden="true"]'))) return null;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return null;
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return null;
      return style;
    }

    function addVisualTarget(element, fallbackFrame = false) {
      if (items.length >= 320 || !visibleStyle(element, true)) return;
      const rect = element.getBoundingClientRect();
      const isFrame = fallbackFrame || element instanceof HTMLIFrameElement;
      const minimumSize = isFrame ? 64 : 28;
      if (rect.width < minimumSize || rect.height < minimumSize || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) return;

      let current = element;
      while (current) {
        if (LIVIACore.isPrimaryViewportCandidate(current, current.getBoundingClientRect(), window.innerWidth, window.innerHeight)) return;
        current = current.parentElement || current.getRootNode?.().host || null;
      }

      if (fallbackFrame) {
        const area = Math.max(1, rect.width * rect.height);
        const alreadyCovered = items.some((target) => {
          if (target.type === 'TEXT') return false;
          const overlapWidth = Math.max(0, Math.min(rect.right, target.bounds.x + target.bounds.w) - Math.max(rect.left, target.bounds.x));
          const overlapHeight = Math.max(0, Math.min(rect.bottom, target.bounds.y + target.bounds.h) - Math.max(rect.top, target.bounds.y));
          return overlapWidth * overlapHeight / area > 0.78;
        });
        if (alreadyCovered) return;
      } else if (!isFrame && !(element instanceof HTMLVideoElement) && !mediaSize(element)) {
        return;
      }
      const x = Math.max(0, rect.left);
      const y = Math.max(0, rect.top);
      const label = element.getAttribute('title') || element.getAttribute('aria-label') || (element instanceof HTMLVideoElement ? 'VIDEO TARGET' : element instanceof HTMLCanvasElement ? 'CANVAS TARGET' : isFrame ? 'EMBEDDED PLAYER' : 'IMAGE TARGET');
      items.push({
        id: element.id || `visual-${items.length}`,
        type: isFrame ? 'FRAME' : 'IMAGE',
        text: element instanceof HTMLImageElement ? element.getAttribute('alt') || label : label,
        coverColor: getCoverColor(element),
        imageElement: isFrame ? null : element,
        bounds: { x, y, w: Math.min(rect.right, window.innerWidth) - x, h: Math.min(rect.bottom, window.innerHeight) - y }
      });
    }

    const visualSelector = 'img, video, canvas';
    for (const root of roots) {
      for (const element of root.querySelectorAll(visualSelector)) addVisualTarget(element);
    }
    for (const element of document.querySelectorAll(visualSelector)) addVisualTarget(element);

    const textNodes = [];
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) textNodes.push(textNode);
    }
    let scannedWords = 0;
    for (const textNode of textNodes) {
      if (items.length >= maxTargets || scannedWords >= 18_000) break;
      const element = textNode.parentElement;
      const style = element && visibleStyle(element);
      const value = textNode.nodeValue || '';
      if (!style || !/\S/.test(value)) continue;

      const lines = new Map();
      const wordPattern = /\S+/g;
      let word;
      while ((word = wordPattern.exec(value)) && items.length + lines.size < maxTargets && scannedWords < 18_000) {
        scannedWords += 1;
        const range = document.createRange();
        range.setStart(textNode, word.index);
        range.setEnd(textNode, word.index + word[0].length);
        for (const rect of range.getClientRects()) {
          if (rect.width < 1 || rect.height < 6 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
          const key = Math.round(rect.top);
          let line = lines.get(key);
          if (!line) {
            line = { text: [], left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
            lines.set(key, line);
          }
          line.text.push(word[0]);
          line.left = Math.min(line.left, rect.left);
          line.right = Math.max(line.right, rect.right);
          line.top = Math.min(line.top, rect.top);
          line.bottom = Math.max(line.bottom, rect.bottom);
        }
      }

      for (const line of lines.values()) {
        if (items.length >= maxTargets) break;
        const x = Math.max(0, line.left - 1);
        const y = Math.max(0, line.top - 1);
        const right = Math.min(window.innerWidth, line.right + 1);
        const bottom = Math.min(window.innerHeight, line.bottom + 1);
        items.push({
          id: `text-${items.length}`,
          type: 'TEXT',
          text: line.text.join(' '),
          coverColor: getCoverColor(element),
          textColor: style.color,
          font: style.font,
          lineHeight: Number.parseFloat(style.lineHeight) || Number.parseFloat(style.fontSize) * 1.2,
          wordTarget: true,
          bounds: { x, y, w: right - x, h: bottom - y }
        });
      }
    }
    return items;
  }

  function onPointerMove(event) {
    state.pointer.x = event.clientX;
    state.pointer.y = event.clientY;
  }

  function jumpToNextTarget() {
    if (!game.targets.length) {
      character?.jump();
      return;
    }
    for (let offset = 1; offset <= game.targets.length; offset += 1) {
      const index = (game.jumpIndex + offset) % game.targets.length;
      const target = game.targets[index];
      if (target.destroyed) continue;
      game.jumpIndex = index;
      const centerX = target.bounds.x + target.bounds.w / 2;
      const centerY = target.bounds.y + target.bounds.h / 2;
      const directionX = centerX - avatar.x;
      const directionY = centerY - avatar.y;
      const distance = Math.hypot(directionX, directionY) || 1;
      const unitX = directionX / distance;
      const unitY = directionY / distance;
      const edgeDistance = Math.abs(unitX) * target.bounds.w / 2 + Math.abs(unitY) * target.bounds.h / 2;
      const landingDistance = edgeDistance + 68;
      game.jumpFrom = { x: avatar.x, y: avatar.y };
      game.jumpTo = {
        x: Math.max(32, Math.min(window.innerWidth - 32, centerX - unitX * landingDistance)),
        y: Math.max(32, Math.min(window.innerHeight - 32, centerY - unitY * landingDistance))
      };
      game.jumpStartedAt = performance.now();
      character?.jump();
      return;
    }
    character?.jump();
  }

  function onPointerDown(event) {
    if (assistantWidget.contains(event.target)) return;
    if (avatar.mode !== 'play' || !shouldOperate()) return;
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
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
    if (assistantWidget.contains(event.target)) return;
    if (avatar.mode === 'play' && shouldOperate() && (event.button === 0 || event.button === 2)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.button === 0) game.firing = false;
  }

  function onContextMenu(event) {
    if (assistantWidget.contains(event.target)) return;
    if (avatar.mode === 'play' && shouldOperate()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onKeyDown(event) {
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (assistantWidget.contains(target)) return;
    if (event.code === 'KeyQ' && !event.repeat) {
      event.preventDefault();
      event.stopPropagation();
      toggleAssistantWidget();
      return;
    }
    if (avatar.mode !== 'play' || !shouldOperate() || event.repeat) return;
    const movementKeys = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    if (movementKeys[event.code]) {
      event.preventDefault();
      event.stopPropagation();
      game.moveKeys[movementKeys[event.code]] = true;
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      jumpToNextTarget();
    } else if (event.code === 'KeyM') {
      event.preventDefault();
      event.stopPropagation();
      fireMissile();
    }
  }

  function onKeyUp(event) {
    const movementKeys = { KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };
    if (movementKeys[event.code]) game.moveKeys[movementKeys[event.code]] = false;
  }

  function handleMessage(request, sender, sendResponse) {
    if (!request || typeof request !== 'object') return false;
    if (sender?.id && sender.id !== chrome.runtime.id) return false;
    if (request.type === 'remember-page') {
      if (!self.LIVIAMemory?.validRememberRequest(request)) {
        sendResponse({ ok: false, error: 'Invalid page-memory request.' });
        return false;
      }
      if (request.memory) return storePageMemory(request, sendResponse);
      return saveCurrentPageMemory(sendResponse);
    }
    if (request.type === 'search-memory') return searchPageMemory(request, sendResponse);
    if (request.type === 'get-scene') {
      if (!LIVIACore.validSceneRequest(request)) {
        sendResponse({ ok: false, error: 'Invalid scene request.' });
        return false;
      }
      if (!state.analysisEnabled) {
        sendResponse({ ok: false, error: 'Enable page analysis to inspect this page.' });
        return false;
      }
      sendResponse({ ok: true, scene: buildPageScene(request.maxNodes || 250) });
      return false;
    }
    if (request.type === 'find-element') {
      if (!LIVIACore.validFindElementRequest(request)) {
        sendResponse({ ok: false, error: 'Invalid element-finding request.' });
        return false;
      }
      if (!state.analysisEnabled) {
        sendResponse({ ok: false, error: 'Enable page analysis to find visible elements.' });
        return false;
      }
      const scene = buildPageScene(500);
      sendResponse({ ok: true, results: LIVIACore.findSceneElements(scene, request.query, request.limit || 3) });
      return false;
    }
    if (request.type === 'scroll-element' || request.type === 'click-element' || request.type === 'fill-search') return handleSceneAction(request, sendResponse);
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

      if (action.action === 'remember') return saveCurrentPageMemory(sendResponse);

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
          game.score = 0;
          game.combo = 0;
          game.clearSeconds = 0;
          game.moveKeys = { up: false, down: false, left: false, right: false };
          game.jumpFrom = null;
          game.jumpTo = null;
          game.jumpIndex = -1;
          game.startedAt = performance.now();
          game.projectiles = [];
          game.particles = [];
          game.smoke = [];
          game.textDebris = [];
          game.glassShards = [];
          refreshTargets();
          game.jumpIndex = -1;
          game.jumpFrom = null;
          game.jumpTo = null;
          if (!game.targets.length) {
            avatar.mode = 'companion';
            game.startedAt = 0;
            sendResponse({ ok: false, error: 'No visible text or images were found in this viewport.' });
            return true;
          }
          game.startedAt = performance.now();
          game.totalTargets = game.targets.length;
        } else {
          game.targets = [];
          game.jumpFrom = null;
          game.jumpTo = null;
          game.moveKeys = { up: false, down: false, left: false, right: false };
          game.projectiles = [];
          game.particles = [];
          game.textDebris = [];
          game.glassShards = [];
          game.tracers = [];
          game.firing = false;
          game.startedAt = 0;
        }
      }
      if (action.action === 'destroy') {
        sendResponse({ ok: false, error: 'Use the mouse or keyboard weapons to clear targets.' });
        return true;
      }
      if (action.action === 'rebuild') rebuildTargets();
      if (action.action === 'move') {
        avatar.x = state.pointer.x;
        avatar.y = state.pointer.y;
      }
      persistAvatar();
      sendResponse({ ok: true, action, score: game.score, targets: game.targets.length, clearSeconds: game.clearSeconds });
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
  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('pointerup', onPointerUp, true);
  document.addEventListener('contextmenu', onContextMenu, true);
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', () => {
    game.firing = false;
    game.moveKeys = { up: false, down: false, left: false, right: false };
  });
  window.addEventListener('resize', () => {
    resizeCanvas();
    if (avatar.mode === 'play') refreshTargets();
  });
  window.addEventListener('scroll', () => {
    if (avatar.mode !== 'play') return;
    window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(refreshTargets, 40);
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
