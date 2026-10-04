const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../core.js');

test('sensitive form controls and credential-like elements are excluded', () => {
  assert.equal(core.isSensitive({ tag: 'INPUT', type: 'text' }), true);
  assert.equal(core.isSensitive({ tag: 'DIV', id: 'session-token' }), true);
  assert.equal(core.isSensitive({ tag: 'DIV', isContentEditable: true }), true);
  assert.equal(core.isSensitive({ tag: 'P' }), false);
});

test('virtual hit testing selects the topmost live target', () => {
  const first = { id: 'first', bounds: { x: 10, y: 20, w: 30, h: 40 } };
  const second = { id: 'second', bounds: { x: 15, y: 25, w: 20, h: 20 } };

  assert.equal(core.hitTest([first, second], { x: 18, y: 28 }), second);
  assert.equal(core.hitTest([{ ...first, destroyed: true }], { x: 18, y: 28 }), null);
  assert.equal(core.hitTest([first], { x: 5, y: 5 }), null);
});

test('fragment effects stay within the configured cap', () => {
  const fragments = core.createFragments({ x: 0, y: 0, w: 20, h: 10 }, 1000, () => 0.5);

  assert.equal(fragments.length, 64);
  assert.ok(fragments.every((fragment) => Number.isFinite(fragment.x + fragment.y + fragment.vx + fragment.vy)));
  assert.ok(fragments.every((fragment) => fragment.life > 0 && fragment.size > 0));
});