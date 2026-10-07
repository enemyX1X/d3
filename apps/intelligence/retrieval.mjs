const STOP_WORDS = new Set([
  'a','an','and','are','as','at','be','by','for','from','has','he','in','is','it','its','of','on','or','that','the','their','this','to','was','were','with','will','you','your','about','after','before','into','over','under','between','through','during','without','within','where','when','who','what','why','how','must','should','can','could','may','might','also','not','than','then','there','these','those','more','most','some','such','about'
]);

export function tokenizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u00C0-\u024F\u4E00-\u9FFF\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && token.length > 1 && !STOP_WORDS.has(token));
}

export function chunkText(text, { maxChars = 700, overlap = 100 } = {}) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  if (source.length <= maxChars) return [source];

  const chunks = [];
  for (let start = 0; start < source.length; start += Math.max(1, maxChars - overlap)) {
    let end = Math.min(start + maxChars, source.length);
    let segment = source.slice(start, end).trim();
    if (!segment) break;

    if (end < source.length) {
      const lastSpace = segment.lastIndexOf(' ');
      if (lastSpace > Math.max(80, Math.floor(maxChars * 0.7))) {
        segment = segment.slice(0, lastSpace).trim();
      }
    }

    if (!segment) {
      segment = source.slice(start, end).trim();
    }
    if (!segment) break;
    chunks.push(segment);
    if (end >= source.length) break;
    start = Math.max(start, end - overlap);
  }

  return chunks.filter((chunk) => chunk && chunk.length > 0).slice(0, 128);
}

export function vectorFromText(text, size = 32) {
  const values = new Array(size).fill(0);
  const tokens = tokenizeText(text);
  if (!tokens.length) return values;

  for (const token of tokens) {
    const hash = [...token].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const index = Math.abs(hash) % size;
    values[index] += 1;
  }

  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
  if (!norm) return values;
  return values.map((value) => Number((value / norm).toFixed(6)));
}

function dotProduct(left, right) {
  let total = 0;
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

export function hybridSearch({ query, records = [], limit = 10 } = {}) {
  if (typeof query !== 'string' || !query.trim()) return [];
  const queryTokens = tokenizeText(query);
  if (!queryTokens.length) return [];
  const queryVector = vectorFromText(query, 32);

  const scored = records
    .map((record) => {
      const text = [record.title || '', record.text || '', record.summary || '', record.snippet || ''].join(' ');
      const tokens = tokenizeText(text);
      const titleTokens = tokenizeText(record.title || '');
      const lexicalHits = queryTokens.filter((token) => tokens.includes(token));
      const titleHits = queryTokens.filter((token) => titleTokens.includes(token));
      const lexicalScore = lexicalHits.length * 2 + titleHits.length * 3;
      const semanticScore = dotProduct(vectorFromText(text, 32), queryVector);
      const authority = Number(record.authority ?? record.authority_score ?? 0.2);
      const score = lexicalScore + semanticScore * 10 + authority * 4;
      return {
        ...record,
        score: Number(score.toFixed(6)),
        matches: Array.from(new Set(lexicalHits)),
        authority,
        snippet: text.slice(0, 220).trim()
      };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score || (Number(right.authority) || 0) - (Number(left.authority) || 0))
    .slice(0, Math.max(1, Number(limit) || 10));

  return scored.map(({ id, title, text, url, authority, score, matches, snippet }) => ({
    id,
    title: title || 'Untitled document',
    text: text || snippet || '',
    url,
    authority,
    score,
    matches,
    snippet: snippet || text || ''
  }));
}
