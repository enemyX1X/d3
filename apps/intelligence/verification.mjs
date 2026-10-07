export function verifyClaims(claims = []) {
  return claims.map((item) => {
    const evidence = Array.isArray(item.evidence) ? item.evidence.filter((entry) => typeof entry === 'string' && entry.trim()) : [];
    const supported = evidence.length > 0 && /source|official|notice|document|evidence|record|report|policy/i.test(evidence.join(' '));
    return {
      claim: item.claim || '',
      supported,
      reason: supported ? 'Evidence is present and matches a traceable source pattern.' : 'Insufficient evidence: no supporting source or verifiable record was supplied.',
      confidence: supported ? 0.8 : 0.1,
      evidenceIds: evidence.slice(0, 5)
    };
  });
}

export function detectContradictions(items = []) {
  if (!Array.isArray(items) || items.length < 2) {
    return { conflict: false, summary: 'No contradictory claims were detected.' };
  }

  const normalized = items.map((item) => ({
    source: String(item.source || 'source'),
    claim: String(item.claim || '').trim(),
    year: (String(item.claim || '').match(/\b(\d{4})\b/) || [])[1] || null
  })).filter((item) => item.claim);

  if (normalized.length < 2) {
    return { conflict: false, summary: 'No contradictory claims were detected.' };
  }

  const first = normalized[0];
  const second = normalized[1];
  const conflict = first.claim.toLowerCase() !== second.claim.toLowerCase() && (first.year !== second.year || first.claim.toLowerCase().includes('required') !== second.claim.toLowerCase().includes('required'));

  return {
    conflict,
    summary: conflict
      ? `Sources disagree: ${first.source} and ${second.source} present conflicting claims.`
      : 'No contradictory claims were detected.'
  };
}
