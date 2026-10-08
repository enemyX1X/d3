const assert = require('node:assert/strict');
const test = require('node:test');
const memory = require('../memory.js');

const pageScene = {
  page: { title: 'React guide', url: 'https://example.com/guide?token=secret#intro' },
  nodes: [
    { type: 'TEXT', text: 'React hydration and server components' },
    { type: 'LINK', text: 'Client rendering reference' },
    { type: 'TEXT', text: 'React hydration and server components' },
    { type: 'INPUT', text: 'do not store field values' }
  ]
};

test('page memory is created from explicit safe scene data and strips query strings', () => {
  const saved = memory.createPageMemory(pageScene, 1234);

  assert.equal(saved.kind, 'page');
  assert.equal(saved.url, 'https://example.com/guide');
  assert.equal(saved.timestamp, 1234);
  assert.match(saved.summary, /React hydration/);
  assert.equal(saved.summary.includes('field values'), false);
  assert.equal(saved.summary.match(/React hydration/g).length, 1);
});

test('page memory rejects invalid or browser-protected URLs', () => {
  assert.equal(memory.createPageMemory(null), null);
  assert.equal(memory.createPageMemory({ ...pageScene, page: { title: 'Settings', url: 'chrome://settings' } }), null);
});

test('memory upsert replaces the same page and enforces storage limits', () => {
  const first = memory.createPageMemory(pageScene, 1);
  const update = memory.createPageMemory(pageScene, 2);
  const other = { ...first, id: 'other', url: 'https://other.example/' };

  assert.deepEqual(memory.upsertMemory([first, other], update, 1), [update]);
  assert.deepEqual(memory.upsertMemory([first], null), [first]);
    const embedded = memory.upsertMemory([], { ...first, embedding: [0.5, 0.25] });
    assert.deepEqual(embedded[0].embedding, [0.5, 0.25]);
    assert.equal(memory.upsertMemory([], { ...first, embedding: [Infinity] })[0].embedding, undefined);
});

test('lexical retrieval ranks relevant pages and caps output', () => {
  const relevant = memory.createPageMemory(pageScene, 10);
  const unrelated = {
    id: 'unrelated', kind: 'page', title: 'Gardening', url: 'https://example.com/garden',
    summary: 'Tomatoes need sun and careful watering.', timestamp: 20
  };
  const results = memory.rankMemories('React hydration', [unrelated, relevant], 20);

  assert.equal(results.length, 1);
  assert.equal(results[0].id, relevant.id);
  assert.ok(results[0].score > 0);
  assert.equal(memory.rankMemories('   ', [relevant]).length, 0);
  assert.equal(memory.rankMemories('react', [relevant], 50).length, 1);
});

test('memory search requests validate query, limit and allowed fields', () => {
  assert.equal(memory.validMemorySearchRequest({ type: 'search-memory', query: 'React', limit: 5 }), true);
  assert.equal(memory.validMemorySearchRequest({ type: 'search-memory', query: ' ', limit: 5 }), false);
  assert.equal(memory.validMemorySearchRequest({ type: 'search-memory', query: 'React', limit: 11 }), false);
  assert.equal(memory.validMemorySearchRequest({ type: 'search-memory', query: 'React', runCode: true }), false);
});

test('remember requests accept only the explicit request shape', () => {
  const record = memory.createPageMemory(pageScene, 1234);
  assert.equal(memory.validRememberRequest({ type: 'remember-page', memory: record }), true);
  assert.equal(memory.validRememberRequest({ type: 'remember-page', memory: record, embedding: [0.1, 0.2] }), true);
  assert.equal(memory.validRememberRequest({ type: 'remember-page', memory: record, embedding: [Infinity] }), false);
  assert.equal(memory.validRememberRequest({ type: 'remember-page', memory: record, script: 'unexpected' }), false);
});

test('hybrid retrieval can rank semantically similar pages without lexical overlap', () => {
  const memories = [
    { id: 'semantic', kind: 'page', title: 'Garden notes', url: 'https://example.com/garden', summary: 'Plant care guide', timestamp: 1, embedding: [0.99, 0.01] },
    { id: 'lexical', kind: 'page', title: 'Other topic', url: 'https://example.com/other', summary: 'Unseen concept', timestamp: 2, embedding: [0.01, 0.99] }
  ];

  const results = memory.rankMemories('unseen concept', memories, 5, [1, 0]);
  assert.equal(results[0].id, 'semantic');
  assert.ok(results[0].score > results[1].score);
  assert.equal('embedding' in results[0], false);
});

  test('hybrid retrieval keeps unembedded records from dominating vector matches', () => {
    const memories = [
      { id: 'lexical', kind: 'page', title: 'unseen concept', url: 'https://example.com/lexical', summary: 'unseen concept', timestamp: 2 },
      { id: 'dense', kind: 'page', title: 'garden notes', url: 'https://example.com/dense', summary: 'plant care', timestamp: 1, embedding: [1, 0] }
    ];
    const results = memory.rankMemories('unseen concept', memories, 5, [1, 0]);

    assert.equal(results[0].id, 'dense');
  });
