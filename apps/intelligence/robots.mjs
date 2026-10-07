function parseRuleGroups(text) {
  const groups = [];
  let current = null;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, '').trim();
    if (!line) continue;
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const directive = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (directive === 'user-agent') {
      if (!current || current.hasRules) {
        current = { agents: [], rules: [], crawlDelay: null, hasRules: false };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && ['allow', 'disallow'].includes(directive)) {
      current.rules.push({ allow: directive === 'allow', path: value });
      current.hasRules = true;
    } else if (current && directive === 'crawl-delay' && Number.isFinite(Number(value))) {
      current.crawlDelay = Math.max(0, Number(value));
    }
  }
  return groups;
}

export function robotsPolicy(text, targetUrl, userAgent = 'LIVIA-ChangeMonitor') {
  const target = new URL(targetUrl);
  const groups = parseRuleGroups(text);
  const agentToken = userAgent.toLowerCase();
  const specific = groups.filter((group) => group.agents.some((agent) => agent !== '*' && agentToken.includes(agent)));
  const selected = specific.length ? specific : groups.filter((group) => group.agents.includes('*'));
  const rules = selected.flatMap((group) => group.rules).filter((rule) => rule.path);
  const path = `${target.pathname}${target.search}`;
  const matches = rules.filter((rule) => path.startsWith(rule.path)).sort((first, second) => second.path.length - first.path.length);
  return {
    allowed: !matches.length || matches[0].allow,
    crawlDelaySeconds: selected.reduce((delay, group) => Math.max(delay, group.crawlDelay || 0), 0)
  };
}
