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
    audioContext: null,
    startedAt: 0,
    clearSeconds: 0,
    totalTargets: 0,
    screenFlash: 0,
    screenShake: 0
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

  function drawTargetMask(target) {
    const bounds = target.bounds;
    ctx.fillStyle = target.coverColor || '#fff';
    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
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
    if (target.type === 'IMAGE' && target.imageElement?.complete && target.imageElement.naturalWidth > 0) {
      try {
        ctx.drawImage(target.imageElement, bounds.x, bounds.y, bounds.w, bounds.h);
      } catch {
        ctx.fillStyle = target.coverColor || '#fff';
        ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      }
    } else if (target.type === 'IMAGE') {
      ctx.fillStyle = target.coverColor || '#fff';
      ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
    }
    if (target.type !== 'IMAGE') {
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
    if (target.type === 'IMAGE') {
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
    game.smoke.push(...LIVIACore.createSmoke(target.bounds, target.type === 'IMAGE' ? 14 : 9));
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
    const shakeX = (Math.random() - 0.5) * game.screenShake;
    const shakeY = (Math.random() - 0.5) * game.screenShake;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    for (const target of game.targets) drawTargetMask(target);
    for (const target of game.targets) drawTarget(target, now);
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
    ctx.fillText(`TARGETS  ${remainingTargets}/${game.totalTargets}     LMB / SPACE  FIRE     RMB / M  MISSILE`, 16, 34);

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
          drawClearScorecard(now);
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
    const items = [];
    const maxTargets = 2400;
    const ignored = 'form, input, textarea, select, button, [contenteditable="true"], [role="textbox"], [aria-hidden="true"], [data-livia-ignore], script, style, noscript, svg, #livia-companion';

    function getCoverColor(element) {
      let current = element;
      while (current) {
        const color = window.getComputedStyle(current).backgroundColor;
        if (color && color !== 'transparent') {
          if (!color.startsWith('rgba(') || Number(color.slice(5, -1).split(',')[3]) >= 0.95) return color;
        }
        current = current.parentElement;
      }
      return '#fff';
    }

    function visibleStyle(element) {
      if (!(element instanceof HTMLElement) || isSensitive(element) || element.closest(ignored)) return null;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < 0.05) return null;
      return style;
    }

    const images = document.body.querySelectorAll('img');
    for (const image of images) {
      if (items.length >= 180) break;
      if (!image.complete || !image.naturalWidth || !visibleStyle(image)) continue;
      const rect = image.getBoundingClientRect();
      if (rect.width < 24 || rect.height < 18 || rect.right <= 0 || rect.bottom <= 0 || rect.left >= window.innerWidth || rect.top >= window.innerHeight) continue;
      const style = window.getComputedStyle(image);
      const x = Math.max(0, rect.left);
      const y = Math.max(0, rect.top);
      items.push({
        id: image.id || `image-${items.length}`,
        type: 'IMAGE',
        text: image.getAttribute('alt') || image.getAttribute('title') || 'IMAGE TARGET',
        coverColor: getCoverColor(image),
        imageElement: image,
        bounds: { x, y, w: Math.min(rect.right, window.innerWidth) - x, h: Math.min(rect.bottom, window.innerHeight) - y }
      });
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let textNode;
    let scannedWords = 0;
    while (items.length < maxTargets && (textNode = walker.nextNode())) {
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

  function onPointerDown(event) {
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
    if (avatar.mode === 'play' && shouldOperate() && (event.button === 0 || event.button === 2)) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (event.button === 0) game.firing = false;
  }

  function onContextMenu(event) {
    if (avatar.mode === 'play' && shouldOperate()) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function onKeyDown(event) {
    if (avatar.mode !== 'play' || !shouldOperate() || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return;
    if (event.code === 'Space') {
      event.preventDefault();
      event.stopPropagation();
      game.firing = true;
      fireMachineGun();
    } else if (event.code === 'KeyM') {
      event.preventDefault();
      event.stopPropagation();
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
          game.score = 0;
          game.combo = 0;
          game.clearSeconds = 0;
          game.startedAt = performance.now();
          game.projectiles = [];
          game.particles = [];
          game.smoke = [];
          game.textDebris = [];
          game.glassShards = [];
          refreshTargets();
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
