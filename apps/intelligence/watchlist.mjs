function normalizeTerms(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [values]).flatMap((value) => String(value || '').split(/[,;\s]+/)).filter(Boolean).map((value) => value.toLowerCase())));
}

export function createWatchlist({ locations = [], topics = [], websites = [], services = [] } = {}) {
  return {
    locations: normalizeTerms(locations),
    topics: normalizeTerms(topics),
    websites: normalizeTerms(websites),
    services: normalizeTerms(services)
  };
}

export function filterRelevantChanges(changes = [], watchlist = createWatchlist()) {
  const normalized = Array.isArray(changes) ? changes : [];
  return normalized
    .map((change) => {
      const text = [change.title || '', change.summary || '', change.source_url || '', change.jurisdiction || ''].join(' ').toLowerCase();
      const locationMatch = watchlist.locations.some((entry) => text.includes(entry.toLowerCase()));
      const topicMatch = watchlist.topics.some((entry) => text.includes(entry.toLowerCase()));
      const websiteMatch = watchlist.websites.some((entry) => String(change.source_url || '').toLowerCase().includes(entry.toLowerCase()));
      const serviceMatch = watchlist.services.some((entry) => text.includes(entry.toLowerCase()));
      const authority = Number(change.authority_score ?? 0.2);
      const relevanceScore = Math.min(1, 0.2 + authority * 0.5 + (locationMatch ? 0.2 : 0) + (topicMatch ? 0.2 : 0) + (websiteMatch ? 0.15 : 0) + (serviceMatch ? 0.15 : 0));
      return { ...change, relevanceScore: Number(relevanceScore.toFixed(3)), matches: { locationMatch, topicMatch, websiteMatch, serviceMatch } };
    })
    .filter((change) => change.relevanceScore >= 0.45)
    .sort((left, right) => right.relevanceScore - left.relevanceScore || (Number(right.authority_score) || 0) - (Number(left.authority_score) || 0));
}

export function collectAlerts(changes = [], watchlist = createWatchlist()) {
  const relevant = filterRelevantChanges(changes, watchlist);
  return relevant.map((change) => {
    const priority = change.relevanceScore >= 0.8 ? 'HIGH' : change.relevanceScore >= 0.6 ? 'MEDIUM' : 'LOW';
    return {
      id: change.id,
      title: change.title || 'Change update',
      priority,
      relevanceScore: change.relevanceScore,
      source: change.source_url || 'Unknown source',
      summary: change.summary || 'Relevant change detected.'
    };
  });
}
