import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import https from 'node:https';

function ipv4IsPublic(address) {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  const [a, b, c] = parts;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || (b === 0 && c === 0) || (b === 0 && c === 2) || (b === 88 && c === 99) || (b === 31 && c === 196))) return false;
  if (a === 198 && ((b === 18 || b === 19) || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function ipv6IsPublic(address) {
  const normalized = address.toLowerCase().split('%')[0];
  if (normalized.startsWith('::ffff:')) return false;
  const first = Number.parseInt(normalized.split(':')[0] || '0', 16);
  if (first < 0x2000 || first > 0x3fff) return false;
  if (/^2001:(db8|0*10|0*20):/.test(normalized) || normalized.startsWith('2002:')) return false;
  return true;
}

export function isPublicIp(address) {
  const version = isIP(address);
  return version === 4 ? ipv4IsPublic(address) : version === 6 ? ipv6IsPublic(address) : false;
}

export async function resolvePublicHost(hostname, lookupImpl = lookup) {
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (!normalized || normalized === 'localhost' || normalized.endsWith('.localhost') || normalized.endsWith('.local')) throw new Error('Private hosts are not crawlable.');
  const version = isIP(normalized);
  if (version) {
    if (!isPublicIp(normalized)) throw new Error('Private or reserved IP addresses are not crawlable.');
    return [{ address: normalized, family: version }];
  }
  const records = await lookupImpl(normalized, { all: true, verbatim: true });
  if (!records.length || records.some((record) => !isPublicIp(record.address))) throw new Error('Host resolves to a private or reserved address.');
  return records;
}

function requestPinnedHttps(url, address, { timeoutMs, maxBytes, headers = {} }) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: 'GET',
      headers: { 'user-agent': 'LIVIA-ChangeMonitor/1.0 (+https://livia.local/robots)', accept: 'text/html,application/xhtml+xml,application/rss+xml,application/atom+xml,application/xml,text/plain;q=0.8', ...headers },
      lookup: (_hostname, _options, callback) => callback(null, address.address, address.family),
      servername: url.hostname,
      rejectUnauthorized: true,
      timeout: timeoutMs
    }, (response) => {
      const chunks = [];
      let bytes = 0;
      response.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > maxBytes) {
          request.destroy(new Error('response-too-large'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status: response.statusCode || 0,
        headers: response.headers,
        body: Buffer.concat(chunks).toString('utf8'),
        url: url.toString()
      }));
    });
    request.on('timeout', () => request.destroy(new Error('request-timeout')));
    request.on('error', reject);
    request.end();
  });
}

export async function fetchPublicHttps(rawUrl, {
  lookupImpl = lookup,
  requestImpl = requestPinnedHttps,
  timeoutMs = 12_000,
  maxBytes = 2_000_000,
  maxRedirects = 5,
  headers = {},
  allowedHosts
} = {}) {
  let current = new URL(rawUrl);
  const redirectHosts = new Set((allowedHosts || [current.hostname]).map((host) => String(host).toLowerCase().replace(/\.$/, '')));
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    if (current.protocol !== 'https:' || current.username || current.password || (current.port && current.port !== '443')) throw new Error('Only public HTTPS URLs on the default port are allowed.');
    if (!redirectHosts.has(current.hostname.toLowerCase().replace(/\.$/, ''))) throw new Error('Cross-domain redirects are not followed.');
    const addresses = await resolvePublicHost(current.hostname, lookupImpl);
    const response = await requestImpl(current, addresses[0], { timeoutMs, maxBytes, headers: redirects ? {} : headers });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.location;
    if (!location || redirects === maxRedirects) throw new Error('Too many or invalid redirects.');
    current = new URL(location, current);
  }
  throw new Error('Too many redirects.');
}
