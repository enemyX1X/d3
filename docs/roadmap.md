# LIVIA product roadmap

## Implemented browser-task foundation

- Task-first web interface with explicit browser-page selection, live evidence, structured proposals, and verified action history.
- Extension bridge limited to configured website origins and one popup-selected, per-site-authorized tab.
- Offline Ollama planning, optional OpenAI-compatible external provider, explicit remote-page-context consent, local saved-page retrieval, and optional local embeddings.
- Extension-owned, expiring, one-use approvals for safe scrolling, same-page button activation, and non-submitting search-field fills.
- Model-output validation, prompt-injection boundaries, local service availability checks, and no invented usage metrics.

## Next milestones

- Add durable authenticated task records, migrations, tenant isolation, and recovery-aware task execution.
- Add a sandboxed workspace with verifiable file, build, test, and artifact operations.
- Expand the permission engine with persisted scoped rules, cancellation, rate limits, and audit review.
- Add source-backed research reports, scheduled monitoring, deduplication, and explicit read-only source allowlists.
- Add integration OAuth, credential encryption, revocation, and per-action authorization.
- Add production origin enrollment, integration/system tests in Chrome, and deployment hardening for the local agent.

## Non-goals

LIVIA's website is not a robot-avatar configurator, game demo, or unrestricted browser crawler. It should understand the selected page and user goal, propose a bounded plan, request permission, execute only supported actions, re-inspect the result, and state limitations honestly.