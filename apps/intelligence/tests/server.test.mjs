import assert from 'node:assert/strict';
import test from 'node:test';
import { createIntelligenceServer } from '../server.mjs';

const token = 'local-intelligence-token-with-over-thirty-two-characters';

async function withServer({ pool, crawler }, run) {
  const server = createIntelligenceServer({ token, allowedOrigins: ['http://localhost:3000'], pool, crawler });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try { await run(baseUrl); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function authHeaders(extra = {}) {
  return { authorization: `Bearer ${token}`, ...extra };
}

test('intelligence API checks database health and requires auth for source operations', async () => {
  const calls = [];
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (sql.includes('INSERT INTO sources')) return { rows: [{ source_id: '00000000-0000-4000-8000-000000000001', url: values[0], domain: values[1], source_name: values[2], authority_score: values[5] }] };
    if (sql.includes('FROM sources ORDER BY')) return { rows: [{ source_name: 'Official transport', authority_level: 'OFFICIAL' }] };
    return { rows: [] };
  } };
  const crawler = { crawlSource: async (sourceId) => ({ ok: true, pagesFetched: 1, pagesChanged: 1, changesDetected: 0, sourceId }) };

  await withServer({ pool, crawler }, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await health.json(), { ok: true, service: 'livia-intelligence', database: 'connected' });

    const denied = await fetch(`${baseUrl}/api/sources`);
    assert.equal(denied.status, 401);

    const added = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      body: JSON.stringify({ url: 'https://transport.example.in/notices', source_name: 'Transport Notices', source_type: 'GOVERNMENT', authority_level: 'OFFICIAL', jurisdiction: 'Karnataka', country: 'India' })
    });
    assert.equal(added.status, 201);
    assert.equal((await added.json()).source.authority_score, 0.9);
    assert.equal(calls.some((call) => call.sql.includes('INSERT INTO sources')), true);

    const sources = await fetch(`${baseUrl}/api/sources`, { headers: authHeaders() });
    assert.equal(sources.status, 200);
    assert.equal((await sources.json()).sources.length, 1);

    const crawl = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ sourceId: '00000000-0000-4000-8000-000000000001' })
    });
    assert.equal(crawl.status, 200);
    assert.equal((await crawl.json()).changesDetected, 0);
  });
});

test('intelligence API accepts IPv6 loopback hosts while enforcing auth', async () => {
  const pool = { query: async (sql) => {
    if (sql === 'SELECT 1') return { rows: [{ '?column?': 1 }] };
    if (sql.includes('INSERT INTO sources')) return { rows: [{ source_id: '00000000-0000-4000-8000-000000000001', url: 'https://transport.example.in/notices', domain: 'transport.example.in', source_name: 'Transport Notices', authority_score: 0.9 }] };
    if (sql.includes('FROM sources ORDER BY')) return { rows: [{ source_name: 'Official transport', authority_level: 'OFFICIAL' }] };
    return { rows: [] };
  } };
  const crawler = { crawlSource: async (sourceId) => ({ ok: true, pagesFetched: 1, pagesChanged: 1, changesDetected: 0, sourceId }) };
  const server = createIntelligenceServer({ token, allowedOrigins: ['http://localhost:3000'], pool, crawler });
  await new Promise((resolve) => server.listen(0, '::1', resolve));
  const baseUrl = `http://[::1]:${server.address().port}`;
  try {
    const response = await fetch(`${baseUrl}/api/sources`, {
      method: 'POST',
      headers: authHeaders({ 'content-type': 'application/json', origin: 'http://localhost:3000' }),
      body: JSON.stringify({ url: 'https://transport.example.in/notices', source_name: 'Transport Notices', source_type: 'GOVERNMENT', authority_level: 'OFFICIAL', jurisdiction: 'Karnataka', country: 'India' })
    });
    assert.equal(response.status, 201);
    assert.equal((await response.json()).source.source_name, 'Transport Notices');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('intelligence API rejects disallowed origins and malformed crawl input', async () => {
  const pool = { query: async () => ({ rows: [] }) };
  const crawler = { crawlSource: async () => { throw new Error('should not crawl'); } };
  await withServer({ pool, crawler }, async (baseUrl) => {
    const deniedOrigin = await fetch(`${baseUrl}/api/sources`, { headers: authHeaders({ origin: 'https://attacker.example' }) });
    assert.equal(deniedOrigin.status, 403);

    const malformed = await fetch(`${baseUrl}/api/crawl`, {
      method: 'POST', headers: authHeaders({ 'content-type': 'application/json' }), body: JSON.stringify({ sourceId: '../private' })
    });
    assert.equal(malformed.status, 400);
  });
});
