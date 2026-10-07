import { fetchPublicHttps } from './url-safety.mjs';
import { normalizeFeed, normalizeHtml } from './normalizer.mjs';
import { robotsPolicy } from './robots.mjs';
import { structuralDiff } from './change-detection.mjs';
import { parseSitemap } from './sitemaps.mjs';

const robotsCache = new Map();
const hostLastRequest = new Map();

function header(headers, name) {
  return headers?.[name] || headers?.[name.toLowerCase()] || null;
}

async function waitForHost(url, now, sleep) {
  const host = new URL(url).hostname;
  const last = hostLastRequest.get(host) || 0;
  const delay = Math.max(0, 1_000 - (now() - last));
  if (delay) await sleep(delay);
  hostLastRequest.set(host, now());
}

function extractSitemapLocations(robotsText, sourceUrl) {
  const base = new URL(sourceUrl);
  return String(robotsText || '').split(/\r?\n/)
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => /^sitemap\s*:/i.test(line))
    .map((line) => line.slice(line.indexOf(':') + 1).trim())
    .filter((value) => {
      try { return new URL(value).origin === base.origin && new URL(value).protocol === 'https:'; }
      catch { return false; }
    }).slice(0, 3);
}

async function discoverSitemapPages(source, robots, fetchWithRetry, sleep, now) {
  const queue = [...robots.sitemaps];
  if (!queue.length) queue.push(new URL('/sitemap.xml', source.url).toString());
  const seenSitemaps = new Set();
  const pageUrls = new Set();
  let sitemapCount = 0;
  while (queue.length && sitemapCount < 3 && pageUrls.size < 10) {
    const sitemapUrl = queue.shift();
    if (seenSitemaps.has(sitemapUrl) || !robotsPolicy(robots.body, sitemapUrl).allowed) continue;
    seenSitemaps.add(sitemapUrl);
    sitemapCount += 1;
    try {
      if (robots.crawlDelaySeconds) await sleep(Math.min(robots.crawlDelaySeconds, 60) * 1000);
      const response = await fetchWithRetry(sitemapUrl, { maxBytes: 2_000_000 });
      if (response.status < 200 || response.status >= 300) continue;
      const parsed = parseSitemap(response.body, sitemapUrl, source.domain, 500);
      for (const nested of parsed.sitemapUrls) if (queue.length < 10) queue.push(nested);
      for (const pageUrl of parsed.pageUrls) {
        if (pageUrls.size >= 10) break;
        if (pageUrl !== source.url && robotsPolicy(robots.body, pageUrl).allowed) pageUrls.add(pageUrl);
      }
    } catch {
      continue;
    }
  }
  return [...pageUrls];
}

export function createCrawler({ pool, fetcher = fetchPublicHttps, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), retries = 2 } = {}) {
  if (!pool) throw new Error('A PostgreSQL pool is required.');

  async function fetchWithRetry(url, options = {}) {
    let failure;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        await waitForHost(url, now, sleep);
        return await fetcher(url, options);
      } catch (error) {
        failure = error;
        if (attempt < retries) await sleep(500 * (2 ** attempt));
      }
    }
    throw failure;
  }

  async function getRobots(source) {
    const cached = robotsCache.get(source.domain);
    if (cached && now() - cached.cachedAt < 15 * 60_000) return cached;
    const robotsUrl = new URL('/robots.txt', source.url).toString();
    let policy;
    let sitemaps = [];
    let body = '';
    try {
      const response = await fetchWithRetry(robotsUrl, { maxBytes: 512_000 });
      body = response.body || '';
      if (response.status === 404) policy = { allowed: true, crawlDelaySeconds: 0 };
      else if (response.status >= 200 && response.status < 300) {
        policy = robotsPolicy(body, source.url);
        sitemaps = extractSitemapLocations(body, source.url);
      } else {
        policy = { allowed: false, crawlDelaySeconds: 0 };
      }
    } catch {
      policy = { allowed: false, crawlDelaySeconds: 0 };
    }
    const result = { ...policy, sitemaps, body, cachedAt: now() };
    robotsCache.set(source.domain, result);
    return result;
  }

  async function persistPage(client, source, response) {
    const contentType = String(header(response.headers, 'content-type') || '');
    const bodyStart = String(response.body || '').replace(/^\s*<\?xml[^>]*\?>/i, '').slice(0, 2_000);
    const isHtml = /text\/html|application\/xhtml\+xml/i.test(contentType);
    const isFeed = /application\/(?:rss\+xml|atom\+xml|xml)|text\/xml/i.test(contentType) && /<(?:rss|feed)(?:\s|>)/i.test(bodyStart);
    if (!isHtml && !isFeed) throw new Error(`Unsupported content type: ${contentType || 'unknown'}`);
    const page = isFeed ? normalizeFeed(response.body, response.url || source.url) : normalizeHtml(response.body, response.url || source.url);
    if (!page.normalizedText.trim()) throw new Error('Page contains no extractable text.');

    await client.query('BEGIN');
    try {
      const documentResult = await client.query(
        `INSERT INTO documents (source_id, canonical_url, title, content_type)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_id, canonical_url) DO UPDATE SET title = EXCLUDED.title, content_type = EXCLUDED.content_type
         RETURNING document_id, current_version_id`,
        [source.source_id, page.canonicalUrl, page.title, contentType.split(';')[0].trim()]
      );
      const document = documentResult.rows[0];
      let previous = null;
      if (document.current_version_id) {
        const previousResult = await client.query('SELECT version_id, content_hash, structure FROM document_versions WHERE version_id = $1', [document.current_version_id]);
        previous = previousResult.rows[0] || null;
      }
      if (previous?.content_hash === page.contentHash) {
        await client.query('UPDATE documents SET title = $2 WHERE document_id = $1', [document.document_id, page.title]);
        await client.query('COMMIT');
        return { changed: false, documentId: document.document_id, versionId: previous.version_id };
      }

      const numberResult = await client.query('SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM document_versions WHERE document_id = $1', [document.document_id]);
      const versionResult = await client.query(
        `INSERT INTO document_versions (document_id, version_number, content_hash, normalized_text, structure, published_at, etag, last_modified)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8) RETURNING version_id`,
        [document.document_id, Number(numberResult.rows[0].next), page.contentHash, page.normalizedText, JSON.stringify(page.blocks), page.publishedAt, header(response.headers, 'etag'), header(response.headers, 'last-modified')]
      );
      const versionId = versionResult.rows[0].version_id;
      await client.query('UPDATE documents SET current_version_id = $2, title = $3 WHERE document_id = $1', [document.document_id, versionId, page.title]);
      let change = null;
      if (previous) {
        const diff = structuralDiff(previous.structure, page.blocks, { sourceType: source.source_type });
        if (diff) {
          const inserted = await client.query(
            `INSERT INTO changes (source_id, document_id, previous_version_id, current_version_id, change_types, summary, added_blocks, removed_blocks, evidence, significance, confidence)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, $11)
             ON CONFLICT (previous_version_id, current_version_id) DO NOTHING
             RETURNING change_id, detected_at`,
            [source.source_id, document.document_id, previous.version_id, versionId, diff.changeTypes, diff.summary, JSON.stringify(diff.added), JSON.stringify(diff.removed), JSON.stringify(diff.evidence), diff.significance, diff.confidence]
          );
          change = inserted.rows[0] || null;
          if (change) await client.query('UPDATE sources SET last_changed = now() WHERE source_id = $1', [source.source_id]);
        }
      }
      await client.query('COMMIT');
      return { changed: true, documentId: document.document_id, versionId, change };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  async function crawlSource(sourceId) {
    const sourceResult = await pool.query('SELECT * FROM sources WHERE source_id = $1 AND active = true', [sourceId]);
    const source = sourceResult.rows[0];
    if (!source) return { ok: false, error: 'Source not found or inactive.' };
    const tooSoon = source.last_crawled && now() - new Date(source.last_crawled).getTime() < source.crawl_frequency_seconds * 1000;
    if (tooSoon) return { ok: false, skipped: true, error: 'Source crawl interval has not elapsed.' };
    const jobResult = await pool.query("INSERT INTO crawl_jobs (source_id, status, attempts, started_at) VALUES ($1, 'RUNNING', 1, now()) RETURNING job_id", [source.source_id]);
    const jobId = jobResult.rows[0].job_id;
    try {
      const robots = await getRobots(source);
      await pool.query('UPDATE sources SET robots_status = $2 WHERE source_id = $1', [source.source_id, robots.allowed ? 'ALLOWED' : 'BLOCKED']);
      if (!robots.allowed) {
        await pool.query("UPDATE crawl_jobs SET status = 'SKIPPED', error_code = 'ROBOTS_DISALLOW', error_message = 'robots.txt disallows this URL', completed_at = now() WHERE job_id = $1", [jobId]);
        await pool.query('UPDATE sources SET last_crawled = now() WHERE source_id = $1', [source.source_id]);
        return { ok: true, skipped: true, reason: 'ROBOTS_DISALLOW' };
      }
      const pageUrls = [source.url, ...await discoverSitemapPages(source, robots, fetchWithRetry, sleep, now)].slice(0, 11);
      let pagesFetched = 0;
      let pagesChanged = 0;
      let changesDetected = 0;
      let lastStatus = 200;
      for (const pageUrl of pageUrls) {
        if (!robotsPolicy(robots.body, pageUrl).allowed) continue;
        const previousResult = await pool.query(
          `SELECT version.etag, version.last_modified FROM documents AS document
           JOIN document_versions AS version ON version.version_id = document.current_version_id
           WHERE document.source_id = $1 AND document.canonical_url = $2`,
          [source.source_id, pageUrl]
        );
        const previous = previousResult.rows[0];
        const headers = {
          ...(previous?.etag ? { 'if-none-match': previous.etag } : {}),
          ...(previous?.last_modified ? { 'if-modified-since': previous.last_modified } : {})
        };
        if (robots.crawlDelaySeconds) await sleep(Math.min(robots.crawlDelaySeconds, 60) * 1000);
        const response = await fetchWithRetry(pageUrl, { headers });
        lastStatus = response.status;
        if (response.status === 304) continue;
        if (response.status < 200 || response.status >= 300) {
          if (response.status === 404 || response.status === 410) continue;
          throw new Error(`HTTP_${response.status}`);
        }
        const client = await pool.connect();
        let persisted;
        try { persisted = await persistPage(client, source, response); }
        finally { client.release(); }
        pagesFetched += 1;
        pagesChanged += Number(persisted.changed);
        changesDetected += Number(Boolean(persisted.change));
      }
      await pool.query("UPDATE crawl_jobs SET status = 'SUCCEEDED', http_status = $2, completed_at = now() WHERE job_id = $1", [jobId, lastStatus]);
      await pool.query('UPDATE sources SET last_crawled = now() WHERE source_id = $1', [source.source_id]);
      return { ok: true, pagesFetched, pagesChanged, changesDetected };
    } catch (error) {
      const code = error instanceof Error && /^HTTP_\d+$/.test(error.message) ? error.message : 'CRAWL_FAILED';
      await pool.query("UPDATE crawl_jobs SET status = 'FAILED', error_code = $2, error_message = $3, completed_at = now() WHERE job_id = $1", [jobId, code, error instanceof Error ? error.message.slice(0, 500) : 'Unknown crawl failure']);
      await pool.query('UPDATE sources SET last_crawled = now() WHERE source_id = $1', [source.source_id]);
      return { ok: false, error: 'Crawl failed. See the crawl job record for details.' };
    }
  }

  async function crawlDueSources(limit = 10) {
    const result = await pool.query(
      `SELECT source_id FROM sources WHERE active = true AND (last_crawled IS NULL OR last_crawled <= now() - crawl_frequency_seconds * interval '1 second')
       ORDER BY COALESCE(last_crawled, to_timestamp(0)) ASC LIMIT $1`,
      [Math.min(25, Math.max(1, limit))]
    );
    const outcomes = [];
    for (const row of result.rows) outcomes.push(await crawlSource(row.source_id));
    return outcomes;
  }

  return { crawlSource, crawlDueSources };
}
