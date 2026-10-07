import assert from 'node:assert/strict';
import test from 'node:test';
import { createCrawler } from '../crawler.mjs';

function createPoolDouble() {
  const source = {
    source_id: 'source-1', url: 'https://transport.example.in/notices', domain: 'transport.example.in',
    source_type: 'GOVERNMENT', active: true, last_crawled: null, crawl_frequency_seconds: 300
  };
  const versions = [];
  const changes = [];
  const jobs = [];
  let clock = 1_000;
  const client = {
    async query(sql, values = []) {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };
      if (sql.includes('INSERT INTO documents')) return { rows: [{ document_id: 'document-1', current_version_id: versions.at(-1)?.version_id || null }] };
      if (sql.includes('SELECT version_id, content_hash, structure FROM document_versions')) {
        return { rows: versions.length ? [{ version_id: versions.at(-1).version_id, content_hash: versions.at(-1).content_hash, structure: versions.at(-1).structure }] : [] };
      }
      if (sql.includes('SELECT COALESCE(MAX(version_number)')) return { rows: [{ next: versions.length + 1 }] };
      if (sql.includes('INSERT INTO document_versions')) {
        const version = { version_id: `version-${versions.length + 1}`, version_number: values[1], content_hash: values[2], normalized_text: values[3], structure: JSON.parse(values[4]) };
        versions.push(version);
        return { rows: [{ version_id: version.version_id }] };
      }
      if (sql.includes('INSERT INTO changes')) {
        const change = { change_id: `change-${changes.length + 1}`, values };
        changes.push(change);
        return { rows: [{ change_id: change.change_id, detected_at: new Date(clock).toISOString() }] };
      }
      return { rows: [] };
    }
  };
  return {
    async query(sql) {
      if (sql.includes('SELECT * FROM sources')) return { rows: [{ ...source }] };
      if (sql.includes('INSERT INTO crawl_jobs')) {
        const job = { job_id: `job-${jobs.length + 1}`, status: 'RUNNING' };
        jobs.push(job);
        return { rows: [{ job_id: job.job_id }] };
      }
      if (sql.includes('UPDATE sources SET last_crawled')) source.last_crawled = new Date(clock);
      if (sql.includes('UPDATE crawl_jobs SET status')) jobs.at(-1).status = sql.includes("'SUCCEEDED'") ? 'SUCCEEDED' : 'FAILED';
      return { rows: [] };
    },
    async connect() { return { ...client, release() {} }; },
    source,
    versions,
    changes,
    jobs,
    now: () => clock,
    advance(milliseconds) { clock += milliseconds; }
  };
}

test('crawler stores initial version, ignores normalized no-op, then records evidence-backed change', async () => {
  const pool = createPoolDouble();
  let page = '<title>Transport notice</title><main><h1>Driving licence application notice for residents</h1><p>Applicants must bring identity proof before booking a new appointment at the regional office.</p></main>';
  const fetcher = async (url) => {
    if (url.endsWith('/robots.txt') || url.endsWith('/sitemap.xml')) return { status: 404, headers: {}, body: '', url };
    return { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', etag: 'v1' }, body: page, url };
  };
  const crawler = createCrawler({ pool, fetcher, sleep: async () => {}, now: pool.now });

  const initial = await crawler.crawlSource(pool.source.source_id);
  assert.equal(initial.ok, true);
  assert.equal(initial.pagesFetched, 1);
  assert.equal(initial.pagesChanged, 1);
  assert.equal(initial.changesDetected, 0);
  assert.equal(pool.versions.length, 1);

  pool.advance(301_000);
  page = '<title>Transport notice</title><main><h1>Driving licence application notice for residents</h1><p>Applicants must bring identity proof before booking a new appointment at the regional office.</p><script>cosmetic change only</script></main>';
  const unchanged = await crawler.crawlSource(pool.source.source_id);
  assert.equal(unchanged.ok, true);
  assert.equal(unchanged.pagesChanged, 0);
  assert.equal(pool.versions.length, 1);

  pool.advance(301_000);
  page = '<title>Transport notice</title><main><h1>Driving licence application notice for residents</h1><p>Applicants must bring identity proof before booking a new appointment at the regional office.</p><p>Starting 2026-11-01 applicants must also provide address proof when applying for a new licence appointment.</p></main>';
  const changed = await crawler.crawlSource(pool.source.source_id);
  assert.equal(changed.ok, true);
  assert.equal(changed.pagesChanged, 1);
  assert.equal(changed.changesDetected, 1);
  assert.equal(pool.versions.length, 2);
  assert.equal(pool.changes.length, 1);
  assert.match(pool.changes[0].values[5], /Structural content difference/);
  assert.match(pool.changes[0].values[8], /address proof/);
  assert.equal(pool.changes[0].values[9], 'UNASSESSED');
});
