import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createDatabase } from './db.mjs';
import { createCrawler } from './crawler.mjs';
import { listSources, registerSource } from './source-registry.mjs';
import { hybridSearch } from './retrieval.mjs';
import { temporalQuery } from './temporal.mjs';

const MAX_BODY_BYTES = 32_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sendJson(response, status, data, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers
  });
  response.end(JSON.stringify(data));
}

function isLoopbackHost(header) {
  if (typeof header !== 'string') return false;
  try {
    const host = new URL(`http://${header}`).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return host === '127.0.0.1' || host === 'localhost' || host === '::1';
  } catch {
    return false;
  }
}

function authorized(header, token) {
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('body-too-large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function createRateLimiter(maxRequests = 60, windowMs = 60_000, now = Date.now) {
  const buckets = new Map();
  return (key) => {
    const current = now();
    const bucket = buckets.get(key);
    if (!bucket || current - bucket.startedAt >= windowMs) {
      buckets.set(key, { startedAt: current, count: 1 });
      return false;
    }
    bucket.count += 1;
    return bucket.count > maxRequests;
  };
}

export function createIntelligenceServer({ pool, crawler, token, allowedOrigins = [], now = Date.now } = {}) {
  if (!pool || !crawler) throw new Error('Database pool and crawler are required.');
  if (typeof token !== 'string' || token.length < 32) throw new Error('INTELLIGENCE_API_TOKEN must contain at least 32 characters.');
  const origins = new Set(allowedOrigins);
  const rateLimited = createRateLimiter(60, 60_000, now);

  return createServer(async (request, response) => {
    if (!isLoopbackHost(request.headers.host)) {
      sendJson(response, 403, { ok: false, error: 'Loopback host required.' });
      return;
    }
    const origin = request.headers.origin;
    if (origin && !origins.has(origin)) {
      sendJson(response, 403, { ok: false, error: 'Origin is not allowed.' });
      return;
    }
    const corsHeaders = origin ? {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, content-type',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      vary: 'Origin'
    } : {};
    if (request.method === 'OPTIONS') {
      response.writeHead(204, corsHeaders);
      response.end();
      return;
    }

    const url = new URL(request.url || '/', 'http://127.0.0.1');
    if (request.method === 'GET' && url.pathname === '/api/health') {
      try {
        await pool.query('SELECT 1');
        sendJson(response, 200, { ok: true, service: 'livia-intelligence', database: 'connected' }, corsHeaders);
      } catch {
        sendJson(response, 503, { ok: false, service: 'livia-intelligence', database: 'unavailable' }, corsHeaders);
      }
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { ok: false, error: 'Route not found.' }, corsHeaders);
      return;
    }
    if (!authorized(request.headers.authorization, token)) {
      sendJson(response, 401, { ok: false, error: 'Authentication required.' }, corsHeaders);
      return;
    }
    if (rateLimited(request.socket.remoteAddress || 'loopback')) {
      sendJson(response, 429, { ok: false, error: 'Rate limit reached. Retry shortly.' }, corsHeaders);
      return;
    }

    try {
      if (request.method === 'GET' && url.pathname === '/api/sources') {
        const limit = Number(url.searchParams.get('limit') || 100);
        if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
          sendJson(response, 400, { ok: false, error: 'limit must be from 1 to 200.' }, corsHeaders);
          return;
        }
        sendJson(response, 200, { ok: true, sources: await listSources(pool, limit) }, corsHeaders);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/sources') {
        const body = await readJson(request);
        const source = await registerSource(pool, body);
        sendJson(response, 201, { ok: true, source }, corsHeaders);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/crawl') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => key !== 'sourceId') || !UUID_PATTERN.test(body.sourceId || '')) {
          sendJson(response, 400, { ok: false, error: 'Provide only a valid sourceId.' }, corsHeaders);
          return;
        }
        const result = await crawler.crawlSource(body.sourceId);
        sendJson(response, result.ok ? 200 : result.skipped ? 409 : 404, result, corsHeaders);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/changes') {
        const limit = Number(url.searchParams.get('limit') || 50);
        if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
          sendJson(response, 400, { ok: false, error: 'limit must be from 1 to 100.' }, corsHeaders);
          return;
        }
        const result = await pool.query(
          `SELECT change.change_id, change.change_types, change.summary, change.evidence, change.significance, change.confidence, change.detected_at,
             source.source_name, source.url AS source_url, source.authority_level, source.authority_score,
             document.canonical_url, document.title,
             previous.version_number AS previous_version, current.version_number AS current_version
           FROM changes AS change
           JOIN sources AS source ON source.source_id = change.source_id
           JOIN documents AS document ON document.document_id = change.document_id
           LEFT JOIN document_versions AS previous ON previous.version_id = change.previous_version_id
           JOIN document_versions AS current ON current.version_id = change.current_version_id
           ORDER BY change.detected_at DESC LIMIT $1`, [limit]
        );
        sendJson(response, 200, { ok: true, changes: result.rows }, corsHeaders);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/search') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.query !== 'string' || !body.query.trim()) {
          sendJson(response, 400, { ok: false, error: 'Provide a non-empty query string.' }, corsHeaders);
          return;
        }
        const limit = Number(body.limit || 5);
        if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
          sendJson(response, 400, { ok: false, error: 'limit must be from 1 to 20.' }, corsHeaders);
          return;
        }
        const result = await pool.query(
          `SELECT source.source_id, source.source_name, source.url, source.authority_level, source.authority_score,
             document.document_id, document.canonical_url, document.title,
             version.version_id, version.normalized_text, version.published_at, version.effective_from, version.effective_until
           FROM document_versions AS version
           JOIN documents AS document ON document.document_id = version.document_id
           JOIN sources AS source ON source.source_id = document.source_id
           ORDER BY version.retrieved_at DESC LIMIT 200`
        );
        const records = result.rows.map((row) => ({
          id: row.version_id,
          title: row.title || row.source_name,
          text: row.normalized_text,
          url: row.canonical_url || row.url,
          authority: row.authority_score ?? 0.2,
          source_id: row.source_id,
          source_name: row.source_name,
          published_at: row.published_at,
          effective_from: row.effective_from,
          effective_until: row.effective_until
        }));
        const hits = hybridSearch({ query: body.query, records, limit });
        sendJson(response, 200, { ok: true, query: body.query, results: hits }, corsHeaders);
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/ask') {
        const body = await readJson(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || typeof body.query !== 'string' || !body.query.trim()) {
          sendJson(response, 400, { ok: false, error: 'Provide a non-empty query string.' }, corsHeaders);
          return;
        }
        const limit = Number(body.limit || 2);
        if (!Number.isInteger(limit) || limit < 1 || limit > 10) {
          sendJson(response, 400, { ok: false, error: 'limit must be from 1 to 10.' }, corsHeaders);
          return;
        }
        const result = await pool.query(
          `SELECT source.source_id, source.source_name, source.url, source.authority_level, source.authority_score,
             document.document_id, document.canonical_url, document.title,
             version.version_id, version.normalized_text, version.published_at, version.effective_from, version.effective_until
           FROM document_versions AS version
           JOIN documents AS document ON document.document_id = version.document_id
           JOIN sources AS source ON source.source_id = document.source_id
           ORDER BY version.retrieved_at DESC LIMIT 200`
        );
        const records = result.rows.map((row) => ({
          id: row.version_id,
          title: row.title || row.source_name,
          text: row.normalized_text,
          url: row.canonical_url || row.url,
          authority: row.authority_score ?? 0.2,
          source_id: row.source_id,
          source_name: row.source_name,
          published_at: row.published_at,
          effective_from: row.effective_from,
          effective_until: row.effective_until
        }));
        const timeline = temporalQuery({ query: body.query, records, limit });
        sendJson(response, 200, { ok: true, query: body.query, timeline, evidence: timeline.previous || timeline.current ? [timeline.previous, timeline.current].filter(Boolean) : [] }, corsHeaders);
        return;
      }

      const changeMatch = url.pathname.match(/^\/api\/changes\/([0-9a-f-]+)$/i);
      if (request.method === 'GET' && changeMatch && UUID_PATTERN.test(changeMatch[1])) {
        const result = await pool.query(
          `SELECT change.change_id, change.change_types, change.summary, change.added_blocks, change.removed_blocks, change.evidence, change.significance, change.confidence, change.detected_at,
             source.source_name, source.url AS source_url, source.authority_level, source.authority_score,
             document.canonical_url, document.title,
             previous.version_number AS previous_version, previous.normalized_text AS previous_text,
             current.version_number AS current_version, current.normalized_text AS current_text
           FROM changes AS change
           JOIN sources AS source ON source.source_id = change.source_id
           JOIN documents AS document ON document.document_id = change.document_id
           LEFT JOIN document_versions AS previous ON previous.version_id = change.previous_version_id
           JOIN document_versions AS current ON current.version_id = change.current_version_id
           WHERE change.change_id = $1`, [changeMatch[1]]
        );
        if (!result.rows.length) {
          sendJson(response, 404, { ok: false, error: 'Change not found.' }, corsHeaders);
          return;
        }
        const row = result.rows[0];
        sendJson(response, 200, { ok: true, change: { ...row, previous_text: row.previous_text?.slice(0, 50_000), current_text: row.current_text?.slice(0, 50_000) } }, corsHeaders);
        return;
      }
      sendJson(response, 404, { ok: false, error: 'Route not found.' }, corsHeaders);
    } catch (error) {
      const tooLarge = error instanceof Error && error.message === 'body-too-large';
      const clientError = error instanceof TypeError || /Source|URL|authority|frequency|characters|fields|HTTPS/.test(error instanceof Error ? error.message : '');
      sendJson(response, tooLarge ? 413 : clientError ? 400 : 500, { ok: false, error: tooLarge ? 'Request body exceeds 32 KB.' : clientError ? error.message : 'Intelligence request failed.' }, corsHeaders);
    }
  });
}

export function startScheduler(crawler, { intervalMs = 60_000, logger = console } = {}) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await crawler.crawlDueSources(10); }
    catch (error) { logger.error('Scheduled crawl failed.', error); }
    finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const token = process.env.INTELLIGENCE_API_TOKEN;
  if (!token || token.length < 32) {
    console.error('Set INTELLIGENCE_API_TOKEN to a unique random value of at least 32 characters.');
    process.exitCode = 1;
  } else {
    const pool = createDatabase();
    const crawler = createCrawler({ pool });
    const allowedOrigins = (process.env.INTELLIGENCE_ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000,http://[::1]:3000')
      .split(',').map((origin) => origin.trim()).filter(Boolean);
    const port = Number(process.env.INTELLIGENCE_PORT || 4320);
    try {
      await pool.query('SELECT 1');
      const server = createIntelligenceServer({ pool, crawler, token, allowedOrigins });
      server.listen(port, '127.0.0.1', () => console.log(`LIVIA Intelligence listening on 127.0.0.1:${port}`));
      startScheduler(crawler);
    } catch (error) {
      console.error('Intelligence service could not start. Run migrations and check DATABASE_URL.', error);
      await pool.end();
      process.exitCode = 1;
    }
  }
}
