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
    const tag = String(element.tag || '').toUpperCase();
    const skip = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

    if (skip.has(tag)) return true;
    if (String(element.type || '').toLowerCase() === 'password') return true;
    if (/^(cc-|one-time-code|current-password|new-password)/.test(String(element.autocomplete || '').toLowerCase())) return true;
    if (element.editable === true) return true;
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

  const api = { FORMS, parse, valid, isSensitive, aim, rebuildProgress, points };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LIVIACore = api;
  }
}(typeof self !== 'undefined' ? self : globalThis));
