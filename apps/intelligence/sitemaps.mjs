import { load } from 'cheerio';

function safeSitemapUrl(rawUrl, baseUrl, allowedHost) {
  try {
    const url = new URL(rawUrl, baseUrl);
    if (url.protocol !== 'https:' || url.hostname !== allowedHost || (url.port && url.port !== '443') || url.username || url.password) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function parseSitemap(xml, sitemapUrl, allowedHost, maxEntries = 500) {
  const $ = load(xml, { xmlMode: true });
  const isIndex = $('sitemapindex').length > 0;
  const entries = $(isIndex ? 'sitemapindex > sitemap > loc' : 'urlset > url > loc, sitemap > loc')
    .toArray().slice(0, Math.min(500, Math.max(1, maxEntries)))
    .map((element) => safeSitemapUrl($(element).text().trim(), sitemapUrl, allowedHost))
    .filter(Boolean);
  return isIndex ? { sitemapUrls: entries, pageUrls: [] } : { sitemapUrls: [], pageUrls: entries };
}
