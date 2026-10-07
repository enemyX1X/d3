import { createHash } from 'node:crypto';

export const AUTHORITY_SCORES = Object.freeze({
  PRIMARY: 1,
  OFFICIAL: 0.9,
  REGULATORY: 0.95,
  SECONDARY: 0.6,
  NEWS: 0.75,
  COMMUNITY: 0.4,
  UNKNOWN: 0.2
});

const SOURCE_TYPES = new Set(['GOVERNMENT', 'CORPORATE', 'PUBLIC', 'NEWS', 'OTHER']);
const AUTHORITY_LEVELS = new Set(Object.keys(AUTHORITY_SCORES));

export function normalizeSource(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Source must be an object.');
  const allowed = ['url', 'source_name', 'source_type', 'authority_level', 'authority_score', 'jurisdiction', 'country', 'language', 'crawl_frequency_seconds'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) throw new Error('Unknown source fields are not allowed.');
  if (typeof input.url !== 'string' || input.url.length > 2_000) throw new Error('Source URL is required and must be under 2,000 characters.');
  const url = new URL(input.url);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('Sources must use public HTTPS on the default port.');
  url.hash = '';
  const sourceType = String(input.source_type || 'OTHER').toUpperCase();
  const authorityLevel = String(input.authority_level || 'UNKNOWN').toUpperCase();
  if (!SOURCE_TYPES.has(sourceType) || !AUTHORITY_LEVELS.has(authorityLevel)) throw new Error('Unsupported source type or authority level.');
  const frequency = Number(input.crawl_frequency_seconds ?? 21_600);
  if (!Number.isInteger(frequency) || frequency < 300 || frequency > 2_592_000) throw new Error('Crawl frequency must be from 300 seconds to 30 days.');
  const sourceName = String(input.source_name || '').trim();
  if (!sourceName || sourceName.length > 160) throw new Error('Source name is required and must be under 160 characters.');
  const authorityScore = input.authority_score === undefined ? AUTHORITY_SCORES[authorityLevel] : Number(input.authority_score);
  if (!Number.isFinite(authorityScore) || authorityScore < 0 || authorityScore > 1) throw new Error('Authority score must be between 0 and 1.');
  return {
    url: url.toString(),
    domain: url.hostname.toLowerCase(),
    source_name: sourceName,
    source_type: sourceType,
    authority_level: authorityLevel,
    authority_score: authorityScore,
    jurisdiction: String(input.jurisdiction || '').trim().slice(0, 160),
    country: String(input.country || '').trim().slice(0, 80),
    language: String(input.language || 'en').trim().slice(0, 32),
    crawl_frequency_seconds: frequency
  };
}

export function sourceIdempotencyKey(source) {
  return createHash('sha256').update(`${source.domain}\n${source.url}`).digest('hex');
}

export async function registerSource(pool, input) {
  const source = normalizeSource(input);
  const result = await pool.query(
    `INSERT INTO sources (url, domain, source_name, source_type, authority_level, authority_score, jurisdiction, country, language, crawl_frequency_seconds)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     ON CONFLICT (url) DO UPDATE SET source_name = EXCLUDED.source_name, source_type = EXCLUDED.source_type,
       authority_level = EXCLUDED.authority_level, authority_score = EXCLUDED.authority_score,
       jurisdiction = EXCLUDED.jurisdiction, country = EXCLUDED.country, language = EXCLUDED.language,
       crawl_frequency_seconds = EXCLUDED.crawl_frequency_seconds, active = true
     RETURNING source_id, url, domain, source_name, source_type, authority_level, authority_score, jurisdiction, country, language, crawl_frequency_seconds, robots_status, active, last_crawled, last_changed, created_at`,
    [source.url, source.domain, source.source_name, source.source_type, source.authority_level, source.authority_score, source.jurisdiction, source.country, source.language, source.crawl_frequency_seconds]
  );
  return result.rows[0];
}

export async function listSources(pool, limit = 100) {
  const result = await pool.query(
    `SELECT source_id, url, domain, source_name, source_type, authority_level, authority_score, jurisdiction, country, language, crawl_frequency_seconds, robots_status, active, last_crawled, last_changed, created_at
     FROM sources ORDER BY authority_score DESC, source_name ASC LIMIT $1`,
    [Math.min(200, Math.max(1, limit))]
  );
  return result.rows;
}
