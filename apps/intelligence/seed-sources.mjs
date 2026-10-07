import { pathToFileURL } from 'node:url';
import path from 'node:path';

const DEFAULT_BASE_URL = 'http://127.0.0.1:4320';

export const TRUSTED_SOURCE_SEED_LIST = [
  {
    source_name: 'Karnataka Transport Department',
    url: 'https://transport.karnataka.gov.in/',
    source_type: 'GOVERNMENT',
    authority_level: 'OFFICIAL',
    jurisdiction: 'Karnataka',
    notes: 'Official transport notices and appointment updates.'
  },
  {
    source_name: 'Ministry of Road Transport & Highways',
    url: 'https://morth.gov.in/',
    source_type: 'GOVERNMENT',
    authority_level: 'OFFICIAL',
    jurisdiction: 'India',
    notes: 'National transport policy notices and public updates.'
  },
  {
    source_name: 'India.gov.in',
    url: 'https://www.india.gov.in/',
    source_type: 'GOVERNMENT',
    authority_level: 'OFFICIAL',
    jurisdiction: 'India',
    notes: 'National public service and notice landing page.'
  },
  {
    source_name: 'Karnataka State Portal',
    url: 'https://www.karnataka.gov.in/',
    source_type: 'GOVERNMENT',
    authority_level: 'OFFICIAL',
    jurisdiction: 'Karnataka',
    notes: 'State government notices and program announcements.'
  }
];

async function registerSource(baseUrl, token, payload) {
  const response = await fetch(`${baseUrl}/api/sources`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.ok === false) {
    throw new Error(`${payload.source_name}: ${json.error || response.statusText || 'Registration failed'}`);
  }

  return json;
}

export async function registerSeedSources({ baseUrl = process.env.INTELLIGENCE_BASE_URL || DEFAULT_BASE_URL, token = process.env.INTELLIGENCE_API_TOKEN, sources = TRUSTED_SOURCE_SEED_LIST } = {}) {
  if (!token || token.length < 32) {
    throw new Error('INTELLIGENCE_API_TOKEN must be set to a value of at least 32 characters.');
  }

  const results = [];
  for (const source of sources) {
    const response = await registerSource(baseUrl, token, {
      url: source.url,
      source_name: source.source_name,
      source_type: source.source_type,
      authority_level: source.authority_level,
      jurisdiction: source.jurisdiction
    });
    results.push({ source: source.source_name, response });
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const results = await registerSeedSources();
    console.log(JSON.stringify({ ok: true, sources: results.length }, null, 2));
    for (const entry of results) {
      console.log(`${entry.source}: registered`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(message);
    process.exitCode = 1;
  }
}
