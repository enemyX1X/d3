import { load } from 'cheerio';
import { createHash } from 'node:crypto';

const CONTENT_SELECTORS = 'h1,h2,h3,h4,h5,h6,p,li,blockquote,dt,dd,caption,th,td';

function flattenStructuredValue(value, depth = 0) {
  if (depth > 4 || value === null || value === undefined) return [];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (Array.isArray(value)) return value.flatMap((item) => flattenStructuredValue(item, depth + 1)).slice(0, 100);
  if (typeof value !== 'object') return [];
  const fields = ['name', 'headline', 'description', 'articleBody', 'datePublished', 'dateModified', 'dateEffective', 'startDate', 'endDate', 'location', 'address', 'text', 'url'];
  return fields.flatMap((field) => value[field] === undefined ? [] : flattenStructuredValue(value[field], depth + 1)).slice(0, 100);
}

function extractStructuredBlocks($) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_index, element) => {
    const raw = $(element).text();
    if (raw.length > 128_000) return;
    try {
      const parsed = JSON.parse(raw);
      const text = flattenStructuredValue(parsed).join(' ').replace(/\s+/g, ' ').trim().slice(0, 4_000);
      if (text.length >= 24) blocks.push({ type: 'STRUCTURED', text });
    } catch {}
  });
  return blocks.slice(0, 20);
}

export function normalizeHtml(html, pageUrl) {
  const $ = load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || $('h1').first().text()).replace(/\s+/g, ' ').trim().slice(0, 500);
  const canonicalHref = $('link[rel="canonical"]').attr('href');
  let canonicalUrl = pageUrl;
  if (canonicalHref) {
    try {
      const candidate = new URL(canonicalHref, pageUrl);
      if (candidate.protocol === 'https:') {
        candidate.hash = '';
        canonicalUrl = candidate.toString();
      }
    } catch {}
  }

  const structuredBlocks = extractStructuredBlocks($);

  $('script,style,noscript,svg,nav,footer,form,button,iframe,template,[hidden],[aria-hidden="true"]').remove();
  const blocks = [];
  const seen = new Set();
  $(CONTENT_SELECTORS).each((_index, element) => {
    const text = $(element).text().replace(/\s+/g, ' ').trim();
    if (text.length < 24 || text.length > 4_000) return;
    const key = `${element.tagName}:${text}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    blocks.push({ type: /^h[1-6]$/i.test(element.tagName) ? 'HEADING' : element.tagName.toUpperCase(), text });
    if (blocks.length >= 2_000) return false;
  });

  const normalizedText = blocks.map((block) => block.text).join('\n\n').slice(0, 200_000);
  const publishedRaw = $('meta[property="article:published_time"]').attr('content') || $('meta[name="datePublished"]').attr('content') || $('time[datetime]').first().attr('datetime') || '';
  const published = publishedRaw ? new Date(publishedRaw) : null;
  const combinedBlocks = [...blocks, ...structuredBlocks].slice(0, 2_020);
  const combinedText = combinedBlocks.map((block) => block.text).join('\n\n').slice(0, 200_000);
  return {
    title,
    canonicalUrl,
    blocks: combinedBlocks,
    normalizedText: combinedText,
    contentHash: createHash('sha256').update(combinedText).digest('hex'),
    publishedAt: published && Number.isFinite(published.getTime()) ? published.toISOString() : null
  };
}

export function normalizeFeed(xml, feedUrl) {
  const $ = load(xml, { xmlMode: true });
  const entries = $('item, entry').toArray().slice(0, 500).map((element) => {
    const entry = $(element);
    const title = entry.children('title').first().text().replace(/\s+/g, ' ').trim();
    const description = entry.children('description, summary, content, content\\:encoded').first().text().replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const published = entry.children('pubDate, published, updated, dc\\:date').first().text().replace(/\s+/g, ' ').trim();
    const href = entry.children('link').first().attr('href') || entry.children('link').first().text().trim();
    const text = [title, published, href, description].filter(Boolean).join(' — ').slice(0, 4_000);
    return text.length >= 16 ? { type: 'ENTRY', text } : null;
  }).filter(Boolean);
  const title = ($('channel > title').first().text() || $('feed > title').first().text() || 'Public feed').replace(/\s+/g, ' ').trim().slice(0, 500);
  const normalizedText = entries.map((entry) => entry.text).join('\n\n').slice(0, 200_000);
  const canonicalUrl = new URL(feedUrl);
  canonicalUrl.hash = '';
  return {
    title,
    canonicalUrl: canonicalUrl.toString(),
    blocks: entries,
    normalizedText,
    contentHash: createHash('sha256').update(normalizedText).digest('hex'),
    publishedAt: null
  };
}
