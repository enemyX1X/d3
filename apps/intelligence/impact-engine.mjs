function normalizePriority(score) {
  if (score >= 0.8) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  if (score >= 0.25) return 'LOW';
  return 'INFO';
}

export function scoreImpact(record = {}) {
  const text = [record.title || '', record.text || '', record.summary || ''].join(' ');
  const authority = Number(record.authority ?? record.authority_score ?? 0.2);
  const required = /required|requires|must|mandatory|need/i.test(text) ? 1 : 0;
  const dateChange = /\b(\d{4}-\d{2}-\d{2}|effective|from)\b/i.test(text) ? 1 : 0;
  const jurisdiction = /karnataka|bengaluru|delhi|mumbai|hyderabad|chennai|india/i.test(String(record.jurisdiction || '')) ? 1 : 0;
  const audience = /applicant|applicants|owner|owners|resident|residents|driver|drivers/i.test(text) ? 1 : 0;
  const relevanceScore = Math.min(1, 0.25 + authority * 0.45 + required * 0.2 + dateChange * 0.15 + jurisdiction * 0.1 + audience * 0.15);
  const priority = normalizePriority(relevanceScore);

  const affectedAudience = audience ? 'applicants and affected residents' : 'affected users';
  const action = required
    ? 'Prepare the required documents and review the official source before booking or submitting the request.'
    : 'Monitor the source for updates and verify any follow-up requirement.';

  return {
    priority,
    relevanceScore: Number(relevanceScore.toFixed(3)),
    affectedAudience,
    action,
    authority,
    hasMandatoryRequirement: !!required
  };
}

export function summarizeAlert(record = {}) {
  const impact = scoreImpact(record);
  const jurisdiction = String(record.jurisdiction || '').trim() || 'the relevant jurisdiction';
  const title = record.title || 'Government update';
  return `${title} in ${jurisdiction} is ${impact.priority} priority. ${impact.affectedAudience} are affected. ${impact.action}`;
}
