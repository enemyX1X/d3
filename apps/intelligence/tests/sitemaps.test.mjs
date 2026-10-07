import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSitemap } from '../sitemaps.mjs';

test('sitemap index returns only same-host HTTPS sitemap links', () => {
  const xml = `<sitemapindex><sitemap><loc>https://gov.example.in/sitemap-pages.xml</loc></sitemap><sitemap><loc>http://gov.example.in/bad.xml</loc></sitemap><sitemap><loc>https://other.example/sitemap.xml</loc></sitemap></sitemapindex>`;
  assert.deepEqual(parseSitemap(xml, 'https://gov.example.in/sitemap.xml', 'gov.example.in'), {
    sitemapUrls: ['https://gov.example.in/sitemap-pages.xml'], pageUrls: []
  });
});

test('url sitemap returns bounded same-host pages and strips fragments', () => {
  const xml = `<urlset><url><loc>/notices/one#section</loc></url><url><loc>https://gov.example.in/notices/two</loc></url><url><loc>https://other.example/private</loc></url></urlset>`;
  assert.deepEqual(parseSitemap(xml, 'https://gov.example.in/sitemap.xml', 'gov.example.in', 1), {
    sitemapUrls: [], pageUrls: ['https://gov.example.in/notices/one']
  });
});
