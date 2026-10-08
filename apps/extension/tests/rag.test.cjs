const assert = require('node:assert/strict');
const test = require('node:test');
const rag = require('../rag.js');

const DOC = `# Acme API Reference

The Acme API lets teams manage billing, webhooks, and rate limits programmatically for their accounts.

## Authentication

Send your key in the Authorization header. Keys that begin with sk_live_ are production keys and must never be shared.
Rotate keys every ninety days from the dashboard under Security settings.

## Rate limits

| Plan | Requests per minute | Burst |
|------|---------------------|-------|
| Free | 60 | 10 |
| Pro | 600 | 100 |
| Enterprise | 6000 | 1000 |

Exceeding the limit returns HTTP 429 with a Retry-After header.

## Webhooks

### Error code ERR-4091

ERR-4091 means the webhook signature did not match. Recompute the HMAC using the signing secret and compare in constant time.

### Retry policy

Failed deliveries are retried with exponential backoff for up to three days.

\`\`\`js
const delay = Math.min(2 ** attempt * 1000, 3_600_000);
\`\`\`

## Billing

Invoices are generated on the first day of each month. Taxes are calculated from the billing address on file.
`;

test('chunking preserves heading paths, tables, and code blocks', () => {
  const { children, parents, docSummary } = rag.chunkMarkdown(DOC, { title: 'Acme API Reference' });
  assert.ok(parents.length >= 4);
  assert.match(docSummary, /Acme API Reference/);

  const table = children.find((c) => c.text.includes('| Plan |'));
  assert.ok(table, 'table chunk exists');
  assert.ok(table.text.includes('| Enterprise | 6000 | 1000 |'), 'table kept whole');
  assert.equal(table.path, 'Acme API Reference > Rate limits');

  const err = children.find((c) => c.text.includes('ERR-4091'));
  assert.equal(err.path, 'Acme API Reference > Webhooks > Error code ERR-4091');

  const code = children.find((c) => c.text.includes('```js'));
  assert.ok(code && code.text.trim().endsWith('```'), 'code fence intact');
  assert.ok(children.every((c) => c.docSummary === docSummary), 'every child carries the document summary');
});

test('tokenizer keeps exact identifiers and their parts', () => {
  const tokens = rag.tokenize('Why does ERR-4091 happen on sk_live_ keys?');
  assert.ok(tokens.includes('err-4091'));
  assert.ok(tokens.includes('err'));
  assert.ok(tokens.includes('4091'));
  assert.ok(!tokens.includes('why'));
});

test('RRF fuses ranked lists with k = 60', () => {
  const fused = rag.rrf([[1, 2, 3], [3, 1, 4]], 60);
  const byId = Object.fromEntries(fused.map((f) => [f.id, f.score]));
  assert.ok(Math.abs(byId[1] - (1 / 61 + 1 / 62)) < 1e-12);
  assert.ok(Math.abs(byId[3] - (1 / 63 + 1 / 61)) < 1e-12);
  assert.equal(fused[0].id, 1);
  assert.ok(byId[4] < byId[2] + 1e-9 || byId[4] > 0);
});

test('hybrid search finds exact IDs that semantic matching alone would blur', () => {
  const index = rag.buildIndex(DOC, { title: 'Acme API Reference' });
  const result = rag.search(index, 'what does ERR-4091 mean');
  assert.equal(result.confident, true);
  assert.equal(result.results[0].path, 'Acme API Reference > Webhooks > Error code ERR-4091');
  assert.match(result.results[0].snippet, /signature did not match/);
});

test('natural-language questions retrieve the right section and parent context', () => {
  const index = rag.buildIndex(DOC, { title: 'Acme API Reference' });

  const limits = rag.search(index, 'how many requests per minute on the Pro plan');
  assert.equal(limits.confident, true);
  assert.equal(limits.results[0].path, 'Acme API Reference > Rate limits');
  assert.match(limits.results[0].context, /Retry-After/, 'parent context is returned, not just the child');

  const retry = rag.search(index, 'how are failed webhook deliveries retried');
  assert.match(retry.results[0].path, /Retry policy/);

  const auth = rag.search(index, 'how often should I rotate keys');
  assert.match(auth.results[0].path, /Authentication/);
});

test('confidence gate refuses unrelated questions instead of guessing', () => {
  const index = rag.buildIndex(DOC, { title: 'Acme API Reference' });
  const result = rag.search(index, 'what is the best recipe for sourdough bread');
  assert.equal(result.confident, false);
  assert.deepEqual(result.results, []);
});

test('empty and hostile input is handled safely', () => {
  const index = rag.buildIndex('', { title: 'Empty' });
  assert.equal(rag.search(index, 'anything').confident, false);
  assert.equal(rag.search(rag.buildIndex(DOC), '   ').confident, false);
  assert.equal(rag.search(null, 'x').confident, false);
});

test('child chunks respect size bounds for prose sections', () => {
  const para = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about gardening tools and soil.`).join(' ');
  const md = `# Garden\n\n## Soil\n\n${para}\n\n${para}\n\n${para}\n`;
  const { children } = rag.chunkMarkdown(md, { title: 'Garden' });
  assert.ok(children.length > 1);
  for (const child of children) {
    const words = child.text.split(/\s+/).length;
    assert.ok(words <= 320, `child too large: ${words}`);
  }
});

test('custom embed and rerank hooks are honoured', () => {
  let embedCalls = 0;
  let rerankCalls = 0;
  const index = rag.buildIndex(DOC, { title: 'Acme' }, {
    embed: (text, idf) => { embedCalls += 1; return rag.embed(text, idf); },
    rerank: (q, c, idf) => { rerankCalls += 1; return rag.crossScore(q, c, idf); }
  });
  rag.search(index, 'webhook signature');
  assert.ok(embedCalls > 1);
  assert.ok(rerankCalls > 0);
});
