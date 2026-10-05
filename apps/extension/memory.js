(function (root) {
  const MAX_MEMORIES = 100;
  const MAX_SUMMARY_LENGTH = 2400;
  const MAX_EMBEDDING_DIMENSIONS = 2048;

  function safePageUrl(rawUrl) {
    try {
      const url = new URL(String(rawUrl || ''));
      return /^https?:$/.test(url.protocol) ? `${url.origin}${url.pathname}` : '';
    } catch {
      return '';
    }
  }

  function createPageMemory(scene, timestamp = Date.now()) {
    if (!scene || typeof scene !== 'object' || !scene.page || !Array.isArray(scene.nodes)) return null;
    const url = safePageUrl(scene.page.url);
    const title = typeof scene.page.title === 'string' ? scene.page.title.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    if (!url || !title) return null;

    const snippets = [];
    const seen = new Set();
    for (const node of scene.nodes) {
      if (!node || !['TEXT', 'LINK', 'CARD'].includes(node.type) || typeof node.text !== 'string') continue;
      const text = node.text.replace(/\s+/g, ' ').trim().slice(0, 280);
      const key = text.toLowerCase();
      if (text.length < 3 || seen.has(key)) continue;
      seen.add(key);
      snippets.push(text);
      if (snippets.join(' ').length >= MAX_SUMMARY_LENGTH) break;
    }

    const summary = snippets.join(' ').slice(0, MAX_SUMMARY_LENGTH);
    const savedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
    return {
      id: `page-${savedAt}-${Math.random().toString(36).slice(2, 8)}`,
      kind: 'page',
      title,
      url,
      summary,
      source: 'explicit-page-save',
      confidence: 1,
      timestamp: savedAt
    };
  }

  function upsertMemory(memories, memory, maxMemories = MAX_MEMORIES) {
    const safeLimit = Math.min(MAX_MEMORIES, Math.max(1, Math.floor(maxMemories)));
    const existing = Array.isArray(memories) ? memories : [];
    if (!memory || typeof memory.url !== 'string') return existing.slice(0, safeLimit);
    const embedding = cleanEmbedding(memory.embedding);
    const safeMemory = { ...memory };
    if (embedding) safeMemory.embedding = embedding;
    else delete safeMemory.embedding;
    return [safeMemory, ...existing.filter((item) => item?.url !== memory.url)].slice(0, safeLimit);
  }

  function cleanEmbedding(vector) {
    if (!Array.isArray(vector) || vector.length < 1 || vector.length > MAX_EMBEDDING_DIMENSIONS || vector.some((value) => !Number.isFinite(value) || Math.abs(value) > 100)) return null;
    return vector.map(Number);
  }

  function validPageMemory(memory) {
    if (!memory || typeof memory !== 'object' || Array.isArray(memory) ||
      Object.keys(memory).some((key) => !['id', 'kind', 'title', 'url', 'summary', 'source', 'confidence', 'timestamp', 'embedding'].includes(key))) return false;
    return typeof memory.id === 'string' && memory.id.length > 0 && memory.id.length <= 100 &&
      memory.kind === 'page' && typeof memory.title === 'string' && memory.title.trim().length > 0 && memory.title.length <= 200 &&
      typeof memory.url === 'string' && safePageUrl(memory.url) === memory.url &&
      typeof memory.summary === 'string' && memory.summary.length <= MAX_SUMMARY_LENGTH &&
      memory.source === 'explicit-page-save' && Number.isFinite(memory.confidence) && memory.confidence >= 0 && memory.confidence <= 1 &&
      Number.isFinite(memory.timestamp) && (memory.embedding === undefined || cleanEmbedding(memory.embedding) !== null);
  }

  function cosineSimilarity(first, second) {
    const a = cleanEmbedding(first);
    const b = cleanEmbedding(second);
    if (!a || !b || a.length !== b.length) return null;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let index = 0; index < a.length; index += 1) {
      dot += a[index] * b[index];
      normA += a[index] * a[index];
      normB += b[index] * b[index];
    }
    if (!normA || !normB) return null;
    return dot / Math.sqrt(normA * normB);
  }

  function tokenize(text) {
    return String(text || '').toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || [];
  }

  function rankMemories(query, memories, limit = 5, queryEmbedding = null) {
    const terms = tokenize(String(query || '').slice(0, 160));
    const safeQueryEmbedding = cleanEmbedding(queryEmbedding);
    if ((!terms.length && !safeQueryEmbedding) || !Array.isArray(memories)) return [];
    const documents = memories.filter((item) => item && typeof item.title === 'string' && typeof item.summary === 'string');
    if (!documents.length) return [];

    const tokenized = documents.map((item) => {
      const titleTokens = tokenize(item.title);
      const summaryTokens = tokenize(item.summary);
      return { item, titleTokens, tokens: [...titleTokens, ...summaryTokens], length: titleTokens.length + summaryTokens.length };
    });
    const averageLength = tokenized.reduce((sum, item) => sum + item.length, 0) / tokenized.length || 1;
    const documentFrequency = new Map();
    for (const term of new Set(terms)) {
      documentFrequency.set(term, tokenized.reduce((count, document) => count + Number(document.tokens.includes(term)), 0));
    }

    const tokenScores = tokenized.map((document) => {
      let score = 0;
      for (const term of terms) {
        const titleFrequency = document.titleTokens.filter((token) => token === term).length;
        const summaryFrequency = document.tokens.filter((token) => token === term).length;
        const frequency = summaryFrequency + titleFrequency * 2;
        if (!frequency) continue;
        const count = documentFrequency.get(term) || 0;
        const inverseFrequency = Math.log(1 + (tokenized.length - count + 0.5) / (count + 0.5));
        const denominator = frequency + 1.2 * (1 - 0.75 + 0.75 * document.length / averageLength);
        score += inverseFrequency * (frequency * 2.2) / denominator;
      }
      return { memory: document.item, lexicalScore: score, denseScore: cosineSimilarity(safeQueryEmbedding, document.item.embedding) };
    });
    const maxLexicalScore = Math.max(0, ...tokenScores.map((document) => document.lexicalScore));
      const hasDenseDocuments = Boolean(safeQueryEmbedding && tokenScores.some((document) => cosineSimilarity(safeQueryEmbedding, document.memory.embedding) !== null));
    const ranked = tokenScores.map((document) => {
        if (hasDenseDocuments) {
        const lexical = maxLexicalScore ? document.lexicalScore / maxLexicalScore : 0;
          const dense = document.denseScore === null ? 0 : Math.max(0, Math.min(1, (document.denseScore + 1) / 2));
        return { memory: document.memory, score: lexical * 0.25 + dense * 0.75 };
      }
      return { memory: document.memory, score: document.lexicalScore };
    }).filter((result) => result.score > 0);

    return ranked.sort((first, second) => second.score - first.score || second.memory.timestamp - first.memory.timestamp)
      .slice(0, Math.min(10, Math.max(1, Math.floor(limit))))
      .map(({ memory, score }) => ({
        id: memory.id,
        title: memory.title,
        url: memory.url,
        summary: memory.summary.slice(0, 420),
        timestamp: memory.timestamp,
        score: Number(score.toFixed(4))
      }));
  }

  function validMemorySearchRequest(request) {
    return Boolean(request && typeof request === 'object' &&
      Object.keys(request).every((key) => ['type', 'query', 'limit', 'embedding'].includes(key)) &&
      request.type === 'search-memory' && typeof request.query === 'string' &&
      request.query.trim().length > 0 && request.query.length <= 160 &&
      (request.limit === undefined || (Number.isInteger(request.limit) && request.limit >= 1 && request.limit <= 10)) &&
      (request.embedding === undefined || cleanEmbedding(request.embedding) !== null));
  }

  function validRememberRequest(request) {
    return Boolean(request && typeof request === 'object' && Object.keys(request).every((key) => ['type', 'memory', 'embedding'].includes(key)) &&
      request.type === 'remember-page' && validPageMemory(request.memory) &&
      (request.embedding === undefined || cleanEmbedding(request.embedding) !== null));
  }

  const api = { MAX_MEMORIES, MAX_EMBEDDING_DIMENSIONS, createPageMemory, validPageMemory, upsertMemory, cleanEmbedding, cosineSimilarity, rankMemories, validMemorySearchRequest, validRememberRequest };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LIVIAMemory = api;
}(typeof self !== 'undefined' ? self : globalThis));
