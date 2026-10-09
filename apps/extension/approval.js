const params = new URLSearchParams(location.search);
const approvalId = params.get('id') || '';
const heading = document.getElementById('heading');
const description = document.getElementById('description');
const result = document.getElementById('result');
const details = document.getElementById('details');
const actions = document.getElementById('actions');
const warning = document.getElementById('warning');
let finished = false;
let currentApproval = null;

function showError(message) {
  heading.textContent = 'Action unavailable';
  description.textContent = message;
  result.textContent = 'No page action was taken.';
}

function sendDecision(approved) {
  if (finished) return;
  finished = true;
  document.getElementById('approve').disabled = true;
  document.getElementById('decline').disabled = true;
  result.textContent = approved ? 'Rechecking page permission and target…' : 'Declining this action…';
  chrome.runtime.sendMessage({ type: 'livia-approve-workspace-action', approvalId, approved }, (response) => {
    if (chrome.runtime.lastError) {
      finished = false;
      document.getElementById('approve').disabled = false;
      document.getElementById('decline').disabled = false;
      result.textContent = chrome.runtime.lastError.message || 'The extension could not complete this approval.';
      return;
    }
    actions.hidden = true;
    warning.hidden = true;
    if (!response?.ok && !response?.declined) {
      showError(response?.error || 'The approval failed.');
      return;
    }
    heading.textContent = approved ? response.verified ? 'Action verified' : 'Action not verified' : 'Action declined';
    description.textContent = response.verified ? currentApproval?.action === 'search' ? 'The approved query was filled. It was not submitted.' : 'The extension observed a verifiable response from the page.' : 'No page action was taken, or the page did not verify its response.';
    result.textContent = response.error || (response.verified ? 'Return to the LIVIA workspace for a fresh page inspection.' : 'Return to the LIVIA workspace.');
  });
}

if (!approvalId || approvalId.length > 80) {
  showError('This approval link is invalid. Return to LIVIA and prepare the action again.');
} else {
  chrome.runtime.sendMessage({ type: 'livia-get-workspace-approval', approvalId }, (response) => {
    if (chrome.runtime.lastError || !response?.ok || !response.approval) {
      showError(response?.error || chrome.runtime.lastError?.message || 'This approval expired or is no longer available.');
      return;
    }
    const approval = response.approval;
    currentApproval = approval;
    document.getElementById('goal').textContent = approval.goal;
    document.getElementById('page').textContent = approval.pageTitle;
    document.getElementById('origin').textContent = approval.origin;
    document.getElementById('action').textContent = approval.action === 'click' ? 'Activate one visible same-page button' : approval.action === 'search' ? 'Fill one labeled search field; do not submit' : 'Scroll one visible target into view';
    document.getElementById('target').textContent = `${approval.targetType}${approval.targetText ? `: ${approval.targetText}` : ''}`;
    if (approval.action === 'search') {
      document.getElementById('query-row').hidden = false;
      document.getElementById('query').textContent = approval.value;
    }
    document.getElementById('confidence').textContent = `${Math.round(approval.confidence * 100)}%`;
    heading.textContent = `Approve this ${approval.action}?`;
    description.textContent = 'Review the exact page and target. Page content is untrusted; approve only if this matches your intent.';
    details.hidden = false;
    warning.hidden = false;
    actions.hidden = false;
  });
}

document.getElementById('approve').addEventListener('click', () => sendDecision(true));
document.getElementById('decline').addEventListener('click', () => sendDecision(false));