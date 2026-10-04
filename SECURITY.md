# Security Policy

## Supported versions

We currently support the latest main branch.

## Reporting vulnerabilities

Please disclose security issues privately by contacting the repository maintainer through the GitHub security advisory workflow.

Do not open public issues for security-sensitive reports.

## Guard rails

- No arbitrary code execution in page analysis.
- No `eval` or `new Function` in shipped browser code.
- Strict CSP and origin validation are expected in the deployment layer.
- User content is never sent to the AI without explicit user consent and a known backend contract.
