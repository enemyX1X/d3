export function composeAnswer({ query = '', timeline = {}, evidence = [] } = {}) {
  const previous = timeline.previous || null;
  const current = timeline.current || null;
  const previousText = previous ? (previous.text || previous.summary || previous.title || '') : '';
  const currentText = current ? (current.text || current.summary || current.title || '') : '';
  const answer = [
    `The query asks: ${query}.`,
    previous && current
      ? `Previously, the rule described ${previousText.slice(0, 220)}. The current evidence says ${currentText.slice(0, 220)}.`
      : current
        ? `Current evidence says ${currentText.slice(0, 220)}.`
        : previous
          ? `The previous evidence said ${previousText.slice(0, 220)}.`
          : 'No timeline evidence was available for this query.'
  ].join(' ');

  const summary = [
    previous ? 'Previous evidence' : 'No previous evidence',
    current ? 'current evidence' : 'no current evidence'
  ].join(' and ');

  const evidenceList = Array.isArray(evidence) ? evidence.map((entry, index) => ({
    id: entry.id || `evidence-${index + 1}`,
    url: entry.url || entry.source || '',
    title: entry.title || entry.source || 'Source reference'
  })).filter((entry) => entry.url) : [];

  return {
    query,
    summary,
    answer,
    evidence: evidenceList
  };
}
