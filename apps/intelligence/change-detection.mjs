const DATE_PATTERN = /\b(?:\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b/i;
const PRICE_PATTERN = /(?:₹|\$|€|£|\bINR\s*)\s?\d[\d,.]*/i;
const POLICY_PATTERN = /\b(?:rule|regulation|policy|requirement|effective|deadline|must|shall|penalty|licen[cs]e|permit)\b/i;

function meaningfulBlock(block) {
  return typeof block?.text === 'string' && block.text.trim().length >= 32;
}

export function structuralDiff(previousBlocks = [], currentBlocks = [], { sourceType = 'OTHER' } = {}) {
  const oldBlocks = previousBlocks.filter(meaningfulBlock);
  const newBlocks = currentBlocks.filter(meaningfulBlock);
  const oldSet = new Set(oldBlocks.map((block) => `${block.type}:${block.text.trim()}`));
  const newSet = new Set(newBlocks.map((block) => `${block.type}:${block.text.trim()}`));
  const added = newBlocks.filter((block) => !oldSet.has(`${block.type}:${block.text.trim()}`));
  const removed = oldBlocks.filter((block) => !newSet.has(`${block.type}:${block.text.trim()}`));
  if (!added.length && !removed.length) return null;

  const oldText = oldBlocks.map((block) => block.text).join('\n');
  const newText = newBlocks.map((block) => block.text).join('\n');
  const changeTypes = ['CONTENT_CHANGE'];
  if (DATE_PATTERN.test(`${oldText}\n${newText}`) && oldText !== newText) changeTypes.push('DATE_CHANGE');
  if (PRICE_PATTERN.test(`${oldText}\n${newText}`) && oldText !== newText) changeTypes.push('PRICE_CHANGE');
  if (sourceType === 'GOVERNMENT' && POLICY_PATTERN.test(`${oldText}\n${newText}`)) changeTypes.push('POLICY_CHANGE');
  const summary = `Structural content difference: ${added.length} substantive block(s) added and ${removed.length} removed. Semantic impact is unassessed.`;
  const evidence = [
    ...added.slice(0, 5).map((block) => ({ kind: 'ADDED_BLOCK', block_type: block.type, excerpt: block.text.slice(0, 500) })),
    ...removed.slice(0, 5).map((block) => ({ kind: 'REMOVED_BLOCK', block_type: block.type, excerpt: block.text.slice(0, 500) }))
  ];
  return { added, removed, changeTypes, summary, evidence, significance: 'UNASSESSED', confidence: 0.55 };
}
