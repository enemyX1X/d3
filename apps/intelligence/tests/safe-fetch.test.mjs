import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchPublicHttps } from '../url-safety.mjs';

test('crawler validates DNS and revalidates same-public-host redirects', async () => {
  const lookedUp = [];
  const requests = [];
  const result = await fetchPublicHttps('https://example.gov.in/notice', {
    lookupImpl: async (host) => { lookedUp.push(host); return [{ address: '8.8.8.8', family: 4 }]; },
    requestImpl: async (url) => {
      requests.push(url.toString());
      return requests.length === 1
        ? { status: 302, headers: { location: '/notice/latest' }, body: '' }
        : { status: 200, headers: { 'content-type': 'text/html' }, body: '<main>Official notice content</main>' };
    }
  });

  assert.deepEqual(lookedUp, ['example.gov.in', 'example.gov.in']);
  assert.deepEqual(requests, ['https://example.gov.in/notice', 'https://example.gov.in/notice/latest']);
  assert.equal(result.status, 200);
});

test('crawler rejects insecure URLs and refuses redirects to private hosts', async () => {
  await assert.rejects(() => fetchPublicHttps('http://example.gov.in/'), /HTTPS/);
  await assert.rejects(() => fetchPublicHttps('https://example.gov.in/', {
    lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImpl: async () => ({ status: 302, headers: { location: 'https://localhost/admin' }, body: '' })
  }), /Cross-domain/);
  await assert.rejects(() => fetchPublicHttps('https://example.gov.in/', {
    lookupImpl: async () => [{ address: '8.8.8.8', family: 4 }],
    requestImpl: async () => ({ status: 302, headers: { location: 'https://other.example/' }, body: '' })
  }), /Cross-domain/);
});
