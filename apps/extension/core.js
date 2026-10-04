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

  function aim(from, to, speed) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy) || 1;
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

  const api = { FORMS, parse, valid, isSensitive, aim, rebuildProgress, points, hitTest, createFragments };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LIVIACore = api;
  }
}(typeof self !== 'undefined' ? self : globalThis));
