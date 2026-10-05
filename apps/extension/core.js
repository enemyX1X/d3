(function (root) {
  const FORMS = ['sphere', 'cube', 'ball', 'spaceship', 'drone', 'robot', 'particle'];
  const FORM_MAP = [
    ['spaceship', /spaceship|ship|rocket/],
    ['robot', /robot/],
    ['drone', /drone/],
    ['cube', /cube|box/],
    ['ball', /ball/],
    ['sphere', /sphere|orb/],
    ['particle', /particle|dust|cloud/]
  ];

  function parse(input) {
    const text = String(input || '').toLowerCase().slice(0, 200);

    if (/tiny|small|shrink|mini/.test(text)) return { action: 'scale', value: 0.5 };
    if (/huge|big|giant|grow|large/.test(text)) return { action: 'scale', value: 2 };
    if (/normal size|reset size/.test(text)) return { action: 'scale', value: 1 };
    if (/rebuild|reconstruct|restore/.test(text)) return { action: 'rebuild' };
    if (/destroy (everything|all)|blow up/.test(text)) return { action: 'destroy' };
    if (/companion|stop playing|calm|exit|stop/.test(text)) return { action: 'game', on: false };
    if (/play|game|shoot|target/.test(text)) return { action: 'game', on: true };
    if (/come here|follow|here/.test(text)) return { action: 'move' };

    for (const [form, regex] of FORM_MAP) {
      if (regex.test(text)) return { action: 'transform', form };
    }

    return null;
  }

  function valid(action) {
    if (!action || typeof action !== 'object') return false;

    switch (action.action) {
      case 'transform':
        return FORMS.includes(action.form);
      case 'scale':
        return typeof action.value === 'number' && action.value >= 0.25 && action.value <= 3;
      case 'game':
        return typeof action.on === 'boolean';
      case 'move':
      case 'destroy':
      case 'rebuild':
        return true;
      default:
        return false;
    }
  }

  function isSensitive(element) {
    if (!element || typeof element !== 'object') return true;
    const tag = String(element.tagName || element.tag || '').toUpperCase();
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);
    const name = element.getAttribute?.('name') || element.name || '';
    const id = element.getAttribute?.('id') || element.id || '';
    const autocomplete = element.getAttribute?.('autocomplete') || element.autocomplete || '';
    const role = element.getAttribute?.('role') || element.role || '';
    const identity = `${name} ${id} ${autocomplete}`.toLowerCase();

    if (skip.has(tag)) return true;
    if (String(element.type || '').toLowerCase() === 'password') return true;
    if (/^(cc-|one-time-code|current-password|new-password|webauthn)/.test(String(autocomplete).toLowerCase())) return true;
    if (/(password|passwd|token|secret|credit.?card|card.?number|cvv|cvc|otp|one.?time.?code)/.test(identity)) return true;
    if (element.editable === true || element.isContentEditable === true || element.contentEditable === 'true') return true;
    if (String(role).toLowerCase() === 'textbox') return true;
    return false;
  }

  function isPrimaryViewportCandidate(element, rect, viewportWidth, viewportHeight) {
    if (!element || !rect || !viewportWidth || !viewportHeight) return false;
    const rectWidth = Number(rect.width ?? rect.w ?? 0);
    const rectHeight = Number(rect.height ?? rect.h ?? 0);
    const tag = String(element.tagName || element.tag || '').toUpperCase();
    const combined = `${element.id || ''} ${element.className || ''} ${tag}`.toLowerCase();
    const primaryHints = [
      'movie_player',
      'html5-video-player',
      'html5-video-container',
      'html5-main-video',
      'video-stream',
      'ytp-player-content',
      'ytp-iv-video-content',
      'ytd-player',
      'video-player',
      'player-container'
    ];
    const largeEnough = rectWidth >= viewportWidth * 0.55 && rectHeight >= viewportHeight * 0.4;
    const looksLikePrimaryPlayer = primaryHints.some((needle) => combined.includes(needle));
    return looksLikePrimaryPlayer && largeEnough;
  }

  function aim(from, to, speed, fallback = { x: 0, y: -1 }) {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let distance = Math.hypot(dx, dy);
    if (distance < 0.001) {
      dx = fallback.x;
      dy = fallback.y;
      distance = Math.hypot(dx, dy) || 1;
    }
    return {
      vx: (dx / distance) * speed,
      vy: (dy / distance) * speed
    };
  }

  function rebuildProgress(startAt, now, duration) {
    const progress = Math.min(1, Math.max(0, (now - startAt) / duration));
    return {
      p: progress,
      e: 1 - Math.pow(1 - progress, 3),
      done: progress >= 1
    };
  }

  function points(combo) {
    return 10 * Math.max(0, Math.floor(combo));
  }

  function planSceneClear(targets, now, debrisDuration = 1700, blankDuration = 60_000) {
    if (!targets.length || targets.some((target) => !target.destroyed)) return null;
    const blankAt = now + Math.max(0, debrisDuration);
    return { blankAt, respawnAt: blankAt + Math.max(0, blankDuration) };
  }

  function hitTest(targets, point) {
    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      const bounds = target.bounds;
      if (target.destroyed || !bounds) continue;
      if (point.x >= bounds.x && point.x <= bounds.x + bounds.w && point.y >= bounds.y && point.y <= bounds.y + bounds.h) {
        return target;
      }
    }
    return null;
  }

  function hitTestSegment(targets, from, to, radius = 0) {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;

    for (let index = targets.length - 1; index >= 0; index -= 1) {
      const target = targets[index];
      if (target.destroyed || !target.bounds) continue;
      const bounds = target.bounds;
      const left = bounds.x - radius;
      const right = bounds.x + bounds.w + radius;
      const top = bounds.y - radius;
      const bottom = bounds.y + bounds.h + radius;
      const p = [-deltaX, deltaX, -deltaY, deltaY];
      const q = [from.x - left, right - from.x, from.y - top, bottom - from.y];
      let start = 0;
      let end = 1;
      let intersects = true;

      for (let edge = 0; edge < 4; edge += 1) {
        if (Math.abs(p[edge]) < 1e-9) {
          if (q[edge] < 0) intersects = false;
          continue;
        }
        const ratio = q[edge] / p[edge];
        if (p[edge] < 0) start = Math.max(start, ratio);
        else end = Math.min(end, ratio);
        if (start > end) intersects = false;
      }

      if (intersects) return target;
    }
    return null;
  }

  function createFragments(bounds, count, random = Math.random) {
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;
    const fragmentCount = Math.min(64, Math.max(1, Math.floor(count)));

    return Array.from({ length: fragmentCount }, () => {
      const angle = random() * Math.PI * 2;
      const speed = 50 + random() * 190;
      return {
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.55 + random() * 0.75,
        size: 1.5 + random() * 3.5
      };
    });
  }

  function createTextDebris(text, bounds, random = Math.random) {
    const glyphs = Array.from(String(text || '')).slice(0, 72);
    const columns = Math.max(1, Math.ceil(Math.sqrt(glyphs.length * Math.max(0.25, bounds.w / Math.max(bounds.h, 1)))));
    const rows = Math.max(1, Math.ceil(glyphs.length / columns));

    return glyphs.map((glyph, index) => {
      const angle = random() * Math.PI * 2;
      const speed = 80 + random() * 210;
      return {
        glyph,
        x: bounds.x + ((index % columns) + 0.5) * (bounds.w / columns),
        y: bounds.y + (Math.floor(index / columns) + 0.5) * (bounds.h / rows),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rotation: 0,
        spin: (random() - 0.5) * 9,
        life: 0.65 + random() * 0.75,
        size: 9 + random() * 5
      };
    });
  }

  function createGlassShards(bounds, count = 32, random = Math.random) {
    const shardCount = Math.min(64, Math.max(8, Math.floor(count)));
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    return Array.from({ length: shardCount }, (_, index) => {
      const angleA = (index / shardCount) * Math.PI * 2;
      const angleB = ((index + 1) / shardCount) * Math.PI * 2;
      const radiusA = 0.72 + random() * 0.28;
      const radiusB = 0.72 + random() * 0.28;
      const points = [
        { x: centerX, y: centerY },
        { x: centerX + Math.cos(angleA) * bounds.w * radiusA, y: centerY + Math.sin(angleA) * bounds.h * radiusA },
        { x: centerX + Math.cos(angleB) * bounds.w * radiusB, y: centerY + Math.sin(angleB) * bounds.h * radiusB }
      ];
      const shardX = points.reduce((sum, point) => sum + point.x, 0) / 3;
      const shardY = points.reduce((sum, point) => sum + point.y, 0) / 3;
      const velocity = aim({ x: centerX, y: centerY }, { x: shardX, y: shardY }, 65 + random() * 180);

      return {
        points,
        x: 0,
        y: 0,
        vx: velocity.vx,
        vy: velocity.vy,
        rotation: 0,
        spin: (random() - 0.5) * 7,
        life: 0.8 + random() * 0.75
      };
    });
  }

  function createSmoke(bounds, count = 8, random = Math.random) {
    const puffCount = Math.min(24, Math.max(1, Math.floor(count)));
    const centerX = bounds.x + bounds.w / 2;
    const centerY = bounds.y + bounds.h / 2;

    return Array.from({ length: puffCount }, () => ({
      x: centerX + (random() - 0.5) * bounds.w * 0.6,
      y: centerY + (random() - 0.5) * bounds.h * 0.6,
      vx: (random() - 0.5) * 55,
      vy: -25 - random() * 65,
      life: 0.75 + random() * 0.7,
      maxLife: 1.45,
      size: 8 + random() * 22
    }));
  }

  const api = { FORMS, parse, valid, isSensitive, isPrimaryViewportCandidate, aim, rebuildProgress, points, planSceneClear, hitTest, hitTestSegment, createFragments, createTextDebris, createGlassShards, createSmoke };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LIVIACore = api;
  }
}(typeof self !== 'undefined' ? self : globalThis));
