/*
 * LIVIA RAG engine — local, dependency-free implementation of the
 * "Extreme-Precision RAG Matrix":
 *
 *   Markdown  ->  hierarchical parent/child chunks (+ contextual injection)
 *             ->  dense retrieval  \
 *             ->  sparse BM25      /  -> Reciprocal Rank Fusion (k = 60)
 *             ->  cross-scoring re-ranker  ->  confidence gate  ->  answer context
 *
 * Everything here is pure (no DOM, no network) so it is unit-testable and the
 * page text never leaves the device.
 *
 * Honest scope: the dense embedder is feature-hashed word + character n-gram
 * vectors and the re-ranker is a joint query/passage lexical-proximity scorer.
 * Both are local stand-ins with the same interfaces as a neural bi-encoder
 * (embed) and cross-encoder (rerank); either can be replaced through the
 * `embed` / `rerank` options without touching the rest of the pipeline.
 */
(function (root) {
  const DIM = 512;
  const RRF_K = 60;
  const CHILD_MIN = 100;
  const CHILD_MAX = 250;
  const PARENT_MAX = 1500;
  const MAX_DOC_CHARS = 400_000;

  const STOP = new Set(
    ('a an and are as at be but by for from has have he her his i if in into is it its of on or our she so that the their ' +
      'them they this to was we were what when where which who why will with you your do does did how can could should would ' +
      'about me my not no than then there these those been being also any all').split(' ')
  );

  /* ------------------------------------------------------------------ *
   * Tokenisation
   * ------------------------------------------------------------------ */

  function stem(word) {
    if (word.length > 5 && word.endsWith('ing')) return word.slice(0, -3);
    if (word.length > 4 && word.endsWith('ed')) return word.slice(0, -2);
    if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
    if (word.length > 3 && word.endsWith('es') && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
    if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
    return word;
  }

  /**
   * Tokens keep exact identifiers intact ("ab-1234", "v2.1.0", "max_tokens")
   * AND emit their parts, so sparse search can match both the whole ID and a
   * partial mention of it.
   */
  function tokenize(text, { keepStop = false } = {}) {
    const out = [];
    const matches = String(text || '').toLowerCase().match(/[a-z0-9\u00c0-\u024f]+(?:[-_.][a-z0-9\u00c0-\u024f]+)*/g) || [];
    for (const raw of matches) {
      const compound = /[-_.]/.test(raw);
      if (compound) {
        out.push(raw);
        for (const part of raw.split(/[-_.]/)) {
          if (part && (keepStop || !STOP.has(part))) out.push(stem(part));
        }
      } else if (keepStop || !STOP.has(raw)) {
        out.push(stem(raw));
      }
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Step 2 — Hierarchical & contextual chunking (Markdown structure)
   * ------------------------------------------------------------------ */

  const wordCount = (text) => (String(text).match(/\S+/g) || []).length;

  /** Split Markdown into atomic blocks: headings, fenced code, tables, paragraphs/lists. */
  function parseBlocks(markdown) {
    const lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let buffer = [];
    let kind = 'p';

    const flush = () => {
      if (buffer.length) {
        const text = buffer.join('\n').trim();
        if (text) blocks.push({ kind, text });
      }
      buffer = [];
      kind = 'p';
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      if (/^\s*```/.test(line)) {
        flush();
        const code = [line];
        i += 1;
        while (i < lines.length && !/^\s*```/.test(lines[i])) {
          code.push(lines[i]);
          i += 1;
        }
        if (i < lines.length) code.push(lines[i]);
        blocks.push({ kind: 'code', text: code.join('\n') });
        continue;
      }

      const heading = /^(#{1,4})\s+(.+?)\s*#*\s*$/.exec(line);
      if (heading) {
        flush();
        blocks.push({ kind: 'h', level: heading[1].length, text: heading[2].trim() });
        continue;
      }

      if (/^\s*\|.*\|\s*$/.test(line)) {
        if (kind !== 'table') flush();
        kind = 'table';
        buffer.push(line);
        continue;
      }

      if (!line.trim()) {
        flush();
        continue;
      }

      if (kind === 'table') flush();
      buffer.push(line);
    }
    flush();
    return blocks;
  }

  /** Break an oversized atomic block (table / code / giant paragraph) without losing structure. */
  function splitOversize(block, maxWords) {
    if (wordCount(block.text) <= maxWords) return [block];
    const lines = block.text.split('\n');

    if (block.kind === 'table') {
      const header = lines.slice(0, 2).join('\n');
      const parts = [];
      let current = [];
      let count = wordCount(header);
      for (const row of lines.slice(2)) {
        const rowWords = wordCount(row);
        if (current.length && count + rowWords > maxWords) {
          parts.push({ kind: 'table', text: `${header}\n${current.join('\n')}` });
          current = [];
          count = wordCount(header);
        }
        current.push(row);
        count += rowWords;
      }
      if (current.length) parts.push({ kind: 'table', text: `${header}\n${current.join('\n')}` });
      return parts;
    }

    if (block.kind === 'code') {
      const parts = [];
      let current = [];
      let count = 0;
      for (const line of lines) {
        const lineWords = wordCount(line);
        if (current.length && count + lineWords > maxWords) {
          parts.push({ kind: 'code', text: current.join('\n') });
          current = [];
          count = 0;
        }
        current.push(line);
        count += lineWords;
      }
      if (current.length) parts.push({ kind: 'code', text: current.join('\n') });
      return parts;
    }

    // Prose: split on sentence boundaries.
    const sentences = block.text.match(/[^.!?\n]+[.!?]*\s*/g) || [block.text];
    const parts = [];
    let current = '';
    for (const sentence of sentences) {
      if (current && wordCount(current) + wordCount(sentence) > maxWords) {
        parts.push({ kind: block.kind, text: current.trim() });
        current = '';
      }
      current += sentence;
    }
    if (current.trim()) parts.push({ kind: block.kind, text: current.trim() });
    return parts;
  }

  /** One-sentence document summary: title + first substantive sentence. */
  function summarize(title, blocks) {
    const firstProse = blocks.find((b) => b.kind === 'p' && wordCount(b.text) >= 6);
    let sentence = '';
    if (firstProse) {
      sentence = (firstProse.text.replace(/\s+/g, ' ').match(/^.{20,}?[.!?](?=\s|$)/) || [firstProse.text.slice(0, 200)])[0];
    }
    sentence = sentence.slice(0, 240).trim();
    return [title, sentence].filter(Boolean).join(' — ');
  }

  /**
   * Markdown Header Chunking + Parent-Child mapping + Contextual Injection.
   *
   * - Parents = whole sections (<= ~1500 words), split further only when a
   *   single section is larger.
   * - Children = 100-250 word units made of whole blocks; tables and code stay
   *   atomic (split with repeated headers only when oversized).
   * - Every child carries the structural path (Doc > H1 > H2 ...) and a
   *   one-sentence document summary.
   */
  function chunkMarkdown(markdown, { title = 'Document', url = '' } = {}) {
    const blocks = parseBlocks(String(markdown || '').slice(0, MAX_DOC_CHARS));
    const docSummary = summarize(title, blocks);

    // 1. Group blocks into sections keyed by heading path.
    const sections = [];
    const stack = [];
    let current = { path: [title], blocks: [] };
    sections.push(current);

    for (const block of blocks) {
      if (block.kind === 'h') {
        while (stack.length && stack[stack.length - 1].level >= block.level) stack.pop();
        stack.push({ level: block.level, text: block.text });
        const trail = stack.map((s) => s.text);
        // Avoid "Title > Title > ..." when the page's H1 repeats the document title.
        if (trail.length && trail[0].trim().toLowerCase() === String(title).trim().toLowerCase()) trail.shift();
        current = { path: [title, ...trail], blocks: [] };
        sections.push(current);
      } else {
        current.blocks.push(block);
      }
    }

    const parents = [];
    const children = [];

    for (const section of sections) {
      if (!section.blocks.length) continue;
      const path = section.path.join(' > ');

      // 2. Parent chunks (split if a section is huge).
      const groups = [];
      let group = [];
      let words = 0;
      for (const block of section.blocks) {
        const w = wordCount(block.text);
        if (group.length && words + w > PARENT_MAX) {
          groups.push(group);
          group = [];
          words = 0;
        }
        group.push(block);
        words += w;
      }
      if (group.length) groups.push(group);

      for (const parentBlocks of groups) {
        const parentId = parents.length;
        const parentText = parentBlocks.map((b) => b.text).join('\n\n');
        parents.push({ id: parentId, path, text: parentText });

        // 3. Child chunks inside this parent.
        const atoms = parentBlocks.flatMap((b) => splitOversize(b, CHILD_MAX));
        let acc = [];
        let accWords = 0;
        const emit = () => {
          if (!acc.length) return;
          children.push({
            id: children.length,
            parentId,
            path,
            text: acc.map((b) => b.text).join('\n\n'),
            docSummary,
            url
          });
          acc = [];
          accWords = 0;
        };

        for (const atom of atoms) {
          const w = wordCount(atom.text);
          const atomic = atom.kind === 'table' || atom.kind === 'code';
          if (acc.length && (accWords + w > CHILD_MAX || (atomic && accWords >= CHILD_MIN))) emit();
          acc.push(atom);
          accWords += w;
          if (accWords >= CHILD_MIN) emit();
        }
        emit();
      }
    }

    return { parents, children, docSummary };
  }

  /* ------------------------------------------------------------------ *
   * Step 3a — Sparse retrieval (BM25 over exact token vocabulary)
   * ------------------------------------------------------------------ */

  function buildBm25(docsTokens, k1 = 1.5, b = 0.75) {
    const N = docsTokens.length;
    const df = new Map();
    const tfs = docsTokens.map((tokens) => {
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
      return tf;
    });
    const lengths = docsTokens.map((t) => t.length);
    const avg = lengths.reduce((a, c) => a + c, 0) / Math.max(1, N);
    const idf = (term) => Math.log(1 + (N - (df.get(term) || 0) + 0.5) / ((df.get(term) || 0) + 0.5));

    function score(queryTokens) {
      const unique = [...new Set(queryTokens)];
      return tfs.map((tf, i) => {
        let s = 0;
        for (const term of unique) {
          const f = tf.get(term);
          if (!f) continue;
          s += idf(term) * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * lengths[i]) / (avg || 1))));
        }
        return s;
      });
    }

    return { score, idf, df, N };
  }

  /* ------------------------------------------------------------------ *
   * Step 3b — Dense retrieval (local feature-hashed embeddings)
   * ------------------------------------------------------------------ */

  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /**
   * Hashed word + char-trigram vector, IDF-weighted, L2-normalised. Captures
   * morphology and partial-word overlap that exact BM25 tokens miss. Swap in a
   * neural embedding model via the `embed` option for true semantic synonyms.
   */
  function embed(text, idf = () => 1) {
    const vec = new Float32Array(DIM);
    for (const token of tokenize(text)) {
      const weight = Math.min(4, Math.max(0.2, idf(token)));
      let h = fnv1a(token);
      vec[h % DIM] += (h & 0x80000000 ? -1 : 1) * weight;

      const padded = `^${token}$`;
      if (padded.length > 4) {
        for (let i = 0; i + 3 <= padded.length; i += 1) {
          h = fnv1a(padded.slice(i, i + 3));
          vec[h % DIM] += (h & 0x80000000 ? -1 : 1) * weight * 0.35;
        }
      }
    }
    let norm = 0;
    for (let i = 0; i < DIM; i += 1) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm) || 1;
    for (let i = 0; i < DIM; i += 1) vec[i] /= norm;
    return vec;
  }

  function cosine(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i += 1) s += a[i] * b[i];
    return s;
  }

  /* ------------------------------------------------------------------ *
   * Fusion — Reciprocal Rank Fusion
   *   RRF(d) = sum over methods m of 1 / (k + rank_m(d))
   * ------------------------------------------------------------------ */

  function rrf(rankedLists, k = RRF_K) {
    const scores = new Map();
    for (const list of rankedLists) {
      list.forEach((id, index) => {
        scores.set(id, (scores.get(id) || 0) + 1 / (k + index + 1));
      });
    }
    return [...scores.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id, score]) => ({ id, score }));
  }

  /* ------------------------------------------------------------------ *
   * Step 4 — Re-ranking: joint query/passage scoring
   * ------------------------------------------------------------------ */

  function minWindow(positions) {
    // positions: arrays of sorted indices per matched query term.
    const lists = positions.filter((p) => p.length);
    if (lists.length < 2) return lists.length ? 1 : Infinity;
    const pointers = lists.map(() => 0);
    let best = Infinity;
    for (;;) {
      let lo = Infinity;
      let hi = -Infinity;
      let loList = -1;
      for (let i = 0; i < lists.length; i += 1) {
        const v = lists[i][pointers[i]];
        if (v < lo) { lo = v; loList = i; }
        if (v > hi) hi = v;
      }
      best = Math.min(best, hi - lo + 1);
      pointers[loList] += 1;
      if (pointers[loList] >= lists[loList].length) break;
    }
    return best;
  }

  /**
   * Scores the (query, passage) pair together — term coverage (IDF-weighted),
   * exact phrase / bigram hits, proximity of matched terms, and agreement with
   * the passage's heading path. Returns 0..1.
   */
  function crossScore(query, candidate, idf) {
    const qTokens = [...new Set(tokenize(query))];
    if (!qTokens.length) return { score: 0, coverage: 0 };

    const dTokens = tokenize(`${candidate.path}\n${candidate.text}`);
    const dSet = new Set(dTokens);
    const totalIdf = qTokens.reduce((s, t) => s + idf(t), 0) || 1;
    const matched = qTokens.filter((t) => dSet.has(t));
    const coverage = matched.reduce((s, t) => s + idf(t), 0) / totalIdf;

    const qSeq = tokenize(query);
    let bigramHits = 0;
    let bigramTotal = 0;
    const dBigrams = new Set();
    for (let i = 0; i < dTokens.length - 1; i += 1) dBigrams.add(`${dTokens[i]} ${dTokens[i + 1]}`);
    for (let i = 0; i < qSeq.length - 1; i += 1) {
      bigramTotal += 1;
      if (dBigrams.has(`${qSeq[i]} ${qSeq[i + 1]}`)) bigramHits += 1;
    }
    const phrase = bigramTotal ? bigramHits / bigramTotal : coverage;

    const positions = matched.map((term) => {
      const at = [];
      dTokens.forEach((t, i) => { if (t === term) at.push(i); });
      return at;
    });
    const window = minWindow(positions);
    const proximity = matched.length > 1 && Number.isFinite(window) ? Math.min(1, matched.length / window) : coverage > 0 ? 0.5 : 0;

    const pathTokens = new Set(tokenize(candidate.path));
    const pathHit = qTokens.length ? qTokens.filter((t) => pathTokens.has(t)).length / qTokens.length : 0;

    const score = 0.5 * coverage + 0.2 * phrase + 0.2 * proximity + 0.1 * pathHit;
    return { score, coverage };
  }

  /* ------------------------------------------------------------------ *
   * Index + search
   * ------------------------------------------------------------------ */

  function buildIndex(markdown, meta = {}, options = {}) {
    const { parents, children, docSummary } = chunkMarkdown(markdown, meta);
    const embedFn = options.embed || embed;
    // Contextual injection for retrieval: structural path is indexed with the child text.
    const docsTokens = children.map((c) => tokenize(`${c.path}\n${c.text}`));
    const bm25 = buildBm25(docsTokens);
    const vectors = children.map((c) => embedFn(`${c.path}\n${c.text}`, bm25.idf));
    return { parents, children, docSummary, bm25, vectors, embed: embedFn, options };
  }

  function rankDescending(scores, limit, minScore = 0) {
    return scores
      .map((score, id) => ({ id, score }))
      .filter((x) => x.score > minScore)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, limit)
      .map((x) => x.id);
  }

  /**
   * Full pipeline: dense + sparse -> RRF -> re-rank top 15-20 -> confidence gate.
   * Returns parent-level context for the top distinct sections.
   */
  function search(index, query, { topK = 4, candidates = 20, minConfidence = 0.18 } = {}) {
    const q = String(query || '').slice(0, 300);
    if (!index || !index.children.length || !tokenize(q).length) {
      return { confident: false, results: [], reason: 'empty' };
    }

    const sparseScores = index.bm25.score(tokenize(q));
    const sparse = rankDescending(sparseScores, candidates);

    const qVec = index.embed(q, index.bm25.idf);
    const denseScores = index.vectors.map((v) => cosine(qVec, v));
    const dense = rankDescending(denseScores, candidates, 0.05);

    const fused = rrf([dense, sparse], RRF_K).slice(0, candidates);
    if (!fused.length) return { confident: false, results: [], reason: 'no-candidates' };

    const maxRrf = fused[0].score || 1;
    const rerankFn = index.options.rerank || crossScore;

    const scored = fused
      .map((entry) => {
        const child = index.children[entry.id];
        const { score, coverage } = rerankFn(q, child, index.bm25.idf);
        return {
          child,
          rerank: score,
          coverage,
          rrf: entry.score,
          final: 0.85 * score + 0.15 * (entry.score / maxRrf),
          denseRank: dense.indexOf(entry.id) + 1 || null,
          sparseRank: sparse.indexOf(entry.id) + 1 || null
        };
      })
      .sort((a, b) => b.final - a.final);

    const results = [];
    const seenParents = new Set();
    for (const item of scored) {
      if (results.length >= topK) break;
      if (item.rerank < minConfidence * 0.5) continue;
      if (seenParents.has(item.child.parentId)) continue;
      seenParents.add(item.child.parentId);
      const parent = index.parents[item.child.parentId];
      results.push({
        score: Number(item.final.toFixed(4)),
        path: item.child.path,
        snippet: item.child.text,
        context: parent.text,
        docSummary: item.child.docSummary,
        signals: { rerank: Number(item.rerank.toFixed(4)), rrf: Number(item.rrf.toFixed(5)), denseRank: item.denseRank, sparseRank: item.sparseRank }
      });
    }

    const confident = results.length > 0 && scored[0].rerank >= minConfidence;
    return { confident, results: confident ? results : [], reason: confident ? 'ok' : 'low-confidence' };
  }

  const api = {
    RRF_K,
    tokenize,
    parseBlocks,
    chunkMarkdown,
    buildIndex,
    search,
    rrf,
    embed,
    cosine,
    crossScore,
    buildBm25
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LIVIARag = api;
  }
}(typeof self !== 'undefined' ? self : globalThis));
