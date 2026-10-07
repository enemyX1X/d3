import assert from 'node:assert/strict';
import test from 'node:test';
import { structuralDiff } from '../change-detection.mjs';
import { normalizeFeed, normalizeHtml } from '../normalizer.mjs';
import { robotsPolicy } from '../robots.mjs';
import { normalizeSource } from '../source-registry.mjs';
import { isPublicIp, resolvePublicHost } from '../url-safety.mjs';

test('source registry normalizes official source metadata and derives authority', () => {
  const source = normalizeSource({
    url: 'https://transport.karnataka.gov.in/notices#top', source_name: 'Karnataka Transport Department',
    source_type: 'government', authority_level: 'official', jurisdiction: 'Karnataka', country: 'India'
  });
  assert.equal(source.url, 'https://transport.karnataka.gov.in/notices');
  assert.equal(source.domain, 'transport.karnataka.gov.in');
  assert.equal(source.authority_score, 0.9);
  assert.throws(() => normalizeSource({ url: 'http://127.0.0.1/admin', source_name: 'Local', source_type: 'OTHER', authority_level: 'UNKNOWN' }), /HTTPS/);
  assert.throws(() => normalizeSource({ ...source, extra: 'not allowed' }), /Unknown/);
});

test('SSRF filter blocks private and reserved IPv4/IPv6 addresses', async () => {
  for (const ip of ['127.0.0.1', '10.0.0.1', '172.20.0.1', '192.168.1.1', '169.254.169.254', '224.0.0.1', '::1', 'fc00::1', 'fe80::1', '2001:db8::1']) {
    assert.equal(isPublicIp(ip), false, ip);
  }
  assert.equal(isPublicIp('8.8.8.8'), true);
  assert.equal(isPublicIp('2606:4700:4700::1111'), true);
  await assert.rejects(() => resolvePublicHost('public.example', async () => [{ address: '127.0.0.1', family: 4 }]), /private or reserved/);
});

test('robots matching honors longest allow/disallow path and crawl delay', () => {
  const robots = 'User-agent: *\nDisallow: /private\nAllow: /private/public\nCrawl-delay: 3';
  assert.equal(robotsPolicy(robots, 'https://example.com/private/page').allowed, false);
  assert.equal(robotsPolicy(robots, 'https://example.com/private/public/notice').allowed, true);
  assert.equal(robotsPolicy(robots, 'https://example.com/other').crawlDelaySeconds, 3);
});

test('robots agent-specific group overrides the wildcard group', () => {
  const robots = 'User-agent: *\nDisallow: /\nUser-agent: LIVIA-ChangeMonitor\nDisallow: /private\nAllow: /notices';
  assert.equal(robotsPolicy(robots, 'https://example.com/notices/1').allowed, true);
  assert.equal(robotsPolicy(robots, 'https://example.com/private').allowed, false);
  assert.equal(robotsPolicy(robots, 'https://example.com/other').allowed, true);
});

test('HTML normalization removes cosmetic markup and extracts source evidence blocks', () => {
  const first = normalizeHtml('<title>Notice</title><nav>Menu noise</nav><main><h1>Official notice title that is long enough</h1><p>A substantive public notice paragraph about a permit requirement and the effective date.</p></main>', 'https://example.gov.in/notice');
  const second = normalizeHtml('<title>Notice</title><main><h1>Official notice title that is long enough</h1><p>A substantive public notice paragraph about a permit requirement and the effective date.</p></main><script>changed cosmetic payload</script>', 'https://example.gov.in/notice');
  assert.equal(first.contentHash, second.contentHash);
  assert.equal(first.blocks.some((block) => block.text.includes('Menu noise')), false);
  assert.equal(first.title, 'Notice');
});

test('normalizer extracts bounded RSS/Atom entries and selected JSON-LD evidence', () => {
  const html = normalizeHtml('<title>Notice page</title><script type="application/ld+json">{"@type":"GovernmentService","name":"Licence update","description":"A new documentary requirement for public applicants."}</script><main><p>The official notice provides details of a regional service and its application requirement.</p></main>', 'https://example.gov.in/service');
  assert.ok(html.blocks.some((block) => block.type === 'STRUCTURED' && block.text.includes('Licence update')));

  const feed = normalizeFeed('<?xml version="1.0"?><rss><channel><title>Official notices</title><item><title>Licence notice</title><pubDate>Wed, 07 Oct 2026 10:00:00 GMT</pubDate><link>https://example.gov.in/notices/1</link><description>A requirement for regional applicants.</description></item></channel></rss>', 'https://example.gov.in/feed.xml');
  assert.equal(feed.title, 'Official notices');
  assert.equal(feed.blocks.length, 1);
  assert.match(feed.blocks[0].text, /Licence notice/);
  assert.match(feed.blocks[0].text, /regional applicants/);
});

test('structural change detection ignores cosmetic changes and returns traceable blocks', () => {
  const before = [{ type: 'P', text: 'A public licence application requires identity proof before an appointment can be booked.' }];
  const same = structuralDiff(before, [...before]);
  assert.equal(same, null);
  const changed = structuralDiff(before, [...before, { type: 'P', text: 'Starting 2026-11-01 applicants must also submit proof of address before the booking date.' }], { sourceType: 'GOVERNMENT' });
  assert.ok(changed.changeTypes.includes('DATE_CHANGE'));
  assert.ok(changed.changeTypes.includes('POLICY_CHANGE'));
  assert.equal(changed.significance, 'UNASSESSED');
  assert.match(changed.evidence[0].excerpt, /proof of address/);
});
