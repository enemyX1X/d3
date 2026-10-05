const assert = require('node:assert/strict');
const test = require('node:test');
const core = require('../core.js');

test('sensitive form controls and credential-like elements are excluded', () => {
  assert.equal(core.isSensitive({ tag: 'INPUT', type: 'text' }), true);
  assert.equal(core.isSensitive({ tag: 'DIV', id: 'session-token' }), true);
  assert.equal(core.isSensitive({ tag: 'DIV', isContentEditable: true }), true);
  assert.equal(core.isSensitive({ tag: 'P' }), false);
});

test('remember-page command maps to a fixed validated action', () => {
  const action = core.parse('remember this page');
  assert.deepEqual(action, { action: 'remember' });
  assert.equal(core.valid(action), true);
  assert.equal(core.valid({ action: 'remember', script: 'unexpected' }), false);
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

test('scene requests and snapshots are bounded and strip query strings and unknown fields', () => {
  assert.equal(core.validSceneRequest({ type: 'get-scene', maxNodes: 500 }), true);
  assert.equal(core.validSceneRequest({ type: 'get-scene', maxNodes: 501 }), false);
  assert.equal(core.validSceneRequest({ type: 'get-scene', maxNodes: 1.5 }), false);
  assert.equal(core.validSceneRequest({ type: 'get-scene', execute: 'anything' }), false);

  const scene = core.createSceneGraph({
    page: { url: 'https://example.com/jobs?token=private#results', title: 'Jobs' },
    viewport: { width: 800, height: 600, scrollX: 0, scrollY: 120 },
    timestamp: 10,
    nodes: [{ id: 'item', type: 'TEXT', text: '  Senior   Engineer ', bounds: { x: 2, y: 4, w: 50, h: 12 }, value: 'private form value', confidence: 2 }]
  });

  assert.equal(scene.page.url, 'https://example.com/jobs');
  assert.equal(scene.nodes[0].text, 'Senior Engineer');
  assert.equal(scene.nodes[0].confidence, 1);
  assert.equal('value' in scene.nodes[0], false);
  assert.equal(scene.viewport.scrollY, 120);
});

test('local model page context is opt-in, bounded and excludes invisible nodes', () => {
  const scene = {
    page: { title: 'Example page', url: 'https://example.com/' },
    nodes: [
      { type: 'TEXT', text: 'Visible heading', visible: true },
      { type: 'BUTTON', text: 'Continue', visible: true },
      { type: 'TEXT', text: 'Hidden private text', visible: false },
      { type: 'INPUT', text: 'private form value', visible: true }
    ]
  };
  const plain = core.createLocalContextPrompt('Summarize this');
  const withContext = core.createLocalContextPrompt('Summarize this', scene, 180);

  assert.equal(plain, 'Summarize this');
  assert.match(withContext, /Visible heading/);
  assert.match(withContext, /Continue/);
  assert.doesNotMatch(withContext, /Hidden private text|private form value/);
  assert.ok(withContext.length <= 180);
});

test('find-element validates typed queries and ranks spatial targets', () => {
  const scene = {
    viewport: { width: 1000, height: 800 },
    nodes: [
      { id: 'small-image', type: 'IMAGE', text: 'Logo', visible: true, bounds: { x: 5, y: 10, w: 40, h: 30 }, confidence: 0.9 },
      { id: 'large-image', type: 'IMAGE', text: 'Featured photo', visible: true, bounds: { x: 300, y: 200, w: 360, h: 260 }, confidence: 0.95 },
      { id: 'main-button', type: 'BUTTON', text: 'Apply now', visible: true, bounds: { x: 350, y: 360, w: 240, h: 56 }, confidence: 0.9 },
      { id: 'hidden-button', type: 'BUTTON', text: 'Hidden', visible: false, bounds: { x: 0, y: 0, w: 900, h: 900 }, confidence: 1 }
    ]
  };

  assert.equal(core.validFindElementRequest({ type: 'find-element', query: 'largest image', limit: 3 }), true);
  assert.equal(core.validFindElementRequest({ type: 'find-element', query: 'main button', runCode: true }), false);
  assert.equal(core.findSceneElements(scene, 'largest image')[0].id, 'large-image');
  assert.equal(core.findSceneElements(scene, 'main button')[0].id, 'main-button');
  assert.equal(core.findSceneElements(scene, 'top image')[0].id, 'small-image');
  assert.equal(core.findSceneElements(scene, 'invisible button').length, 0);
});

test('browser actions require scene IDs and explicit confirmation for clicks', () => {
  assert.equal(core.validElementActionRequest({ type: 'scroll-element', id: 'scene-4-42' }), true);
  assert.equal(core.validElementActionRequest({ type: 'click-element', id: 'scene-4-42', confirmed: true }), true);
  assert.equal(core.validElementActionRequest({ type: 'click-element', id: 'scene-4-42' }), false);
  assert.equal(core.validElementActionRequest({ type: 'click-element', id: 'scene-4-42', confirmed: true, script: 'x' }), false);
  assert.equal(core.validElementActionRequest({ type: 'click-element', id: 'scene-9999999999999-42', confirmed: true }), false);
  assert.equal(core.validElementActionRequest({ type: 'click-element', id: 'window.location', confirmed: true }), false);
});

test('browser click safety blocks forms and off-origin links', () => {
  assert.equal(core.canActivateSceneElement({ tagName: 'BUTTON', buttonType: 'button' }), true);
  assert.equal(core.canActivateSceneElement({ tagName: 'BUTTON', buttonType: 'submit' }), false);
  assert.equal(core.canActivateSceneElement({ tagName: 'BUTTON', insideForm: true }), false);
  assert.equal(core.canActivateSceneElement({ tagName: 'A', href: 'https://example.com/next', origin: 'https://example.com' }), true);
  assert.equal(core.canActivateSceneElement({ tagName: 'A', href: 'https://other.example/', origin: 'https://example.com' }), false);
  assert.equal(core.canActivateSceneElement({ tagName: 'A', href: 'javascript:alert(1)', origin: 'https://example.com' }), false);
});

test('click verification requires an observable page change or focus', () => {
  const before = { url: 'https://example.com/', text: 'Open', pressed: null, expanded: 'false' };
  assert.equal(core.verifyElementAction(before, { ...before, focused: false }), false);
  assert.equal(core.verifyElementAction(before, { ...before, focused: false }, true), true);
  assert.equal(core.verifyElementAction(before, { ...before, focused: true }), true);
  assert.equal(core.verifyElementAction(before, { ...before, url: 'https://example.com/next' }), true);
});