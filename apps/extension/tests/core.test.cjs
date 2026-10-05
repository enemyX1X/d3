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

test('fast bullet segments hit crossed targets but not missed targets', () => {
  const target = { id: 'target', bounds: { x: 40, y: 30, w: 20, h: 20 } };

  assert.equal(core.hitTestSegment([target], { x: 0, y: 40 }, { x: 100, y: 40 }, 2), target);
  assert.equal(core.hitTestSegment([target], { x: 0, y: 0 }, { x: 100, y: 0 }, 2), null);
});

test('scene clear waits for debris then blanks for one minute', () => {
  const allDestroyed = [{ destroyed: true }, { destroyed: true }];
  const partlyAlive = [{ destroyed: true }, { destroyed: false }];

  assert.deepEqual(core.planSceneClear(allDestroyed, 500), { blankAt: 2200, respawnAt: 62200 });
  assert.equal(core.planSceneClear(partlyAlive, 500), null);
  assert.equal(core.planSceneClear([], 500), null);
});

test('fragment effects stay within the configured cap', () => {
  const fragments = core.createFragments({ x: 0, y: 0, w: 20, h: 10 }, 1000, () => 0.5);

  assert.equal(fragments.length, 64);
  assert.ok(fragments.every((fragment) => Number.isFinite(fragment.x + fragment.y + fragment.vx + fragment.vy)));
  assert.ok(fragments.every((fragment) => fragment.life > 0 && fragment.size > 0));
});

test('aiming never produces a stationary shot', () => {
  const velocity = core.aim({ x: 4, y: 8 }, { x: 4, y: 8 }, 500);

  assert.ok(Math.hypot(velocity.vx, velocity.vy) > 499);
});

test('text debris contains bounded moving glyphs', () => {
  const debris = core.createTextDebris('LIVIA', { x: 0, y: 0, w: 100, h: 20 }, () => 0.5);

  assert.deepEqual(debris.map((piece) => piece.glyph), ['L', 'I', 'V', 'I', 'A']);
  assert.ok(debris.every((piece) => Number.isFinite(piece.x + piece.y + piece.vx + piece.vy + piece.spin)));
});

test('image glass shards are bounded triangles with outward motion', () => {
  const shards = core.createGlassShards({ x: 5, y: 10, w: 80, h: 40 }, 100, () => 0.5);

  assert.equal(shards.length, 64);
  assert.ok(shards.every((shard) => shard.points.length === 3));
  assert.ok(shards.every((shard) => Math.hypot(shard.vx, shard.vy) > 0));
});

test('smoke puffs stay capped and have finite drifting motion', () => {
  const smoke = core.createSmoke({ x: 0, y: 0, w: 40, h: 20 }, 100, () => 0.5);

  assert.equal(smoke.length, 24);
  assert.ok(smoke.every((puff) => Number.isFinite(puff.x + puff.y + puff.vx + puff.vy + puff.size)));
});

test('large main video viewport is excluded while smaller thumbnails remain targetable', () => {
  const viewport = { id: 'movie_player', className: 'html5-video-player', tagName: 'DIV' };
  const mainVideo = { id: '', className: 'video-stream html5-main-video', tagName: 'VIDEO' };
  const smallTile = { id: 'thumb-1', className: 'ytd-thumbnail', tagName: 'DIV' };

  assert.equal(core.isPrimaryViewportCandidate(viewport, { x: 0, y: 0, w: 1400, h: 900 }, 1600, 900), true);
  assert.equal(core.isPrimaryViewportCandidate(mainVideo, { x: 0, y: 0, w: 1400, h: 800 }, 1600, 900), true);
  assert.equal(core.isPrimaryViewportCandidate(smallTile, { x: 0, y: 0, w: 220, h: 140 }, 1600, 900), false);
  assert.equal(core.isPrimaryViewportCandidate({ id: 'other', className: 'card', tagName: 'DIV' }, { x: 0, y: 0, w: 260, h: 160 }, 1600, 900), false);
});

test('live targets stay native until hit; destroyed and rebuilding targets are masked', () => {
  assert.equal(core.needsTargetMask({ destroyed: false, rebuildStartedAt: 0 }), false);
  assert.equal(core.needsTargetMask({ destroyed: true, rebuildStartedAt: 0 }), true);
  assert.equal(core.needsTargetMask({ destroyed: true, rebuildStartedAt: 100 }), true);
});