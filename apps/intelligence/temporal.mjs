const LOCATION_PATTERNS = [
  'Karnataka', 'Bengaluru', 'Bangalore', 'Delhi', 'Mumbai', 'Hyderabad', 'Chennai', 'Kerala', 'Punjab', 'Tamil Nadu', 'India'
];

const ENTITY_ALIASES = {
  'rto': 'Regional Transport Office',
  'regional transport office': 'Regional Transport Office',
  'transport office': 'Regional Transport Office',
  'driving licence': 'Driving Licence',
  'driving license': 'Driving Licence',
  'licence': 'Driving Licence',
  'license': 'Driving Licence',
  'address proof': 'Address Proof',
  'identity proof': 'Identity Proof'
};

function normalizeEntityName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

export function extractEntities(text) {
  const source = String(text || '');
  const found = new Map();

  for (const [alias, canonical] of Object.entries(ENTITY_ALIASES)) {
    const pattern = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(source)) {
      found.set(canonical, { name: canonical, type: canonical === 'Regional Transport Office' ? 'ORGANIZATION' : canonical === 'Driving Licence' ? 'DOCUMENT' : canonical === 'Address Proof' ? 'DOCUMENT' : 'TOPIC' });
    }
  }

  for (const location of LOCATION_PATTERNS) {
    if (new RegExp(`\\b${location.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(source)) {
      found.set(location, { name: location, type: 'LOCATION' });
    }
  }

  const titleMatches = source.match(/(?:Regional Transport Office|RTO|Transport Office)[^.,;]{0,60}/gi) || [];
  for (const match of titleMatches) {
    const canonical = normalizeEntityName(match).replace(/\s+/g, ' ');
    found.set(canonical, { name: canonical, type: 'ORGANIZATION' });
  }

  return Array.from(found.values()).slice(0, 25);
}

function extractDates(text) {
  const matches = Array.from(String(text || '').matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/g));
  return matches.map((match) => match[1]);
}

function getPublishedAt(record) {
  const value = record?.published_at || record?.publishedAt || record?.date || record?.effective_from || '';
  const time = value ? new Date(value) : null;
  return Number.isFinite(time?.getTime()) ? time.getTime() : 0;
}

export function temporalQuery({ query, records = [], limit = 2 } = {}) {
  if (!Array.isArray(records) || !records.length) {
    return { previous: null, current: null, summary: 'No evidence available for the requested timeframe.', score: 0 };
  }

  const entityMatches = extractEntities(query);
  const scored = records
    .map((record) => {
      const text = [record.title || '', record.text || '', record.summary || ''].join(' ');
      const entityScore = entityMatches.filter((entity) => text.toLowerCase().includes(entity.name.toLowerCase())).length;
      const dates = extractDates(text);
      const published = getPublishedAt(record);
      const score = entityScore * 4 + (published > 0 ? 2 : 0) + Number(record.authority || record.authority_score || 0.2) * 10 + (/\b(current|latest|new|updated|effective|from)\b/i.test(text) ? 1 : 0);
      return { ...record, score, dates, published };
    })
    .sort((left, right) => right.published - left.published || right.score - left.score);

  const limited = scored.slice(0, Math.max(1, Number(limit) || 2));
  const current = limited[0] || null;
  const previous = limited[1] || null;

  const summary = current
    ? `Previous evidence: ${previous ? previous.title || 'Earlier record' : 'No earlier record'}; current evidence: ${current.title || 'Latest record'}${current.dates.length ? ` (dates: ${current.dates.slice(0, 3).join(', ')})` : ''}.`
    : 'No evidence available for the requested timeframe.';

  return {
    previous,
    current,
    summary,
    score: Number((current?.score || 0) - (previous?.score || 0)),
    entities: entityMatches
  };
}
