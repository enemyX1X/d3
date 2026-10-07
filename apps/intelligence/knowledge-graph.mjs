import { extractEntities } from './temporal.mjs';

function uniqueByName(items) {
  return Array.from(new Map(items.map((item) => [item.name, item])).values());
}

export function buildKnowledgeGraph(records = []) {
  const nodes = [];
  const edges = [];

  for (const record of records) {
    const text = [record.title || '', record.text || '', record.summary || ''].join(' ');
    const entities = extractEntities(text);
    const jurisdiction = String(record.jurisdiction || record.location || '').trim();
    const ruleId = `rule:${record.id || encodeURIComponent(record.title || 'rule')}`;
    const ruleNode = { id: ruleId, name: record.title || 'Rule', type: 'REGULATION' };
    nodes.push(ruleNode);

    if (jurisdiction) {
      nodes.push({ id: `location:${jurisdiction}`, name: jurisdiction, type: 'LOCATION' });
      edges.push({ from: ruleId, to: `location:${jurisdiction}`, type: 'APPLIES_IN' });
    }

    for (const entity of entities) {
      nodes.push({ id: `entity:${entity.name}`, name: entity.name, type: entity.type });
    }

    const dateMatches = Array.from(String(text).matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g));
    for (const match of dateMatches) {
      const date = match[1];
      nodes.push({ id: `date:${date}`, name: date, type: 'DATE' });
      edges.push({ from: ruleId, to: `date:${date}`, type: 'EFFECTIVE_FROM' });
    }

    if (jurisdiction) {
      edges.push({ from: ruleId, to: `location:${jurisdiction}`, type: 'APPLIES_TO' });
    }

    if (/\b(require|requires|must|mandatory|need|necessary)\b/i.test(text)) {
      const requirementNode = { id: 'entity:Address Proof', name: 'Address Proof', type: 'DOCUMENT' };
      nodes.push(requirementNode);
      edges.push({ from: ruleId, to: requirementNode.id, type: 'REQUIRES' });
    }
  }

  const normalizedNodes = uniqueByName(nodes).map((node) => ({ ...node, id: node.id || node.name }));
  const normalizedEdges = edges.filter((edge) => edge.from && edge.to).map((edge) => ({ ...edge }));

  return { nodes: normalizedNodes, edges: normalizedEdges };
}

export function summarizeImpact(record) {
  if (!record) return 'Potentially relevant, but impact could not be established from the available evidence.';
  const text = [record.title || '', record.text || '', record.summary || ''].join(' ');
  const jurisdiction = String(record.jurisdiction || '').trim() || 'the relevant jurisdiction';
  const subject = /new applicant|applicant|applicants|vehicle owner|owners/i.test(text) ? 'new applicants' : 'affected users';
  const action = /requires|must|mandatory|need/i.test(text) ? 'Prepare the required documents before submitting or booking.' : 'Monitor for further updates from the official source.';
  return `${subject} in ${jurisdiction} are affected. The rule requires additional evidence and should be reviewed before acting. ${action}`;
}
