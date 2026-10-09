# LIVIA architecture

## Implemented task path

- `apps/web` is a task-first Next.js UI. It connects to a configured browser extension ID, shows the single page explicitly selected in the extension popup, displays bounded live-page evidence and relevant saved-page memory, and renders a validated model proposal.
- `apps/extension/background.js` is the browser-task boundary. It checks an explicit development-origin allowlist, verifies the selected tab and per-site permission for every request, strips page data into a bounded snapshot, retrieves relevant page memories, and proxies planning requests to the loopback agent. Browser content is untrusted input.
- `apps/agent` binds to loopback, authenticates a bearer token, routes offline plans to Ollama, and optionally supports an HTTPS OpenAI-compatible provider such as OpenRouter. `/v1/plan` validates bounded JSON proposals; `/v1/providers` reports configured and installed model state without returning credentials.
- Plan actions are limited to `inspect`, `scroll`, `click`, `search`, and `none`. `search` only fills a labeled, non-sensitive search input; it never submits. `click` is restricted to eligible same-page buttons. Scroll, click, and search-fill approvals open an extension-owned page outside the site DOM. Approval records are one-use and expire; the worker rechecks site permission and target, then records only a verified action outcome.
- Page memories are created only after a user request and stay in extension-local storage. Search uses BM25-style ranking and optional local Ollama embeddings. No automatic crawling is implemented.
- `externally_connectable` and `workspace-origins.js` currently allow `http://localhost:3000` and `http://127.0.0.1:3000`. The LIVIA workspace is excluded from extension injection and page inspection.

## Privacy and safety boundaries

Page snapshots are bounded and omit form contents, generic text inputs, hidden content, and common credential/payment fields. Only explicitly labeled search inputs are exposed as empty input controls, never with their existing values. Cross-origin iframe contents are not inspected. Remote-model planning requires a separate consent flag enforced in both the UI and extension boundary; provider keys remain server-side. Model output is treated as a proposal and validated against a strict schema. A page action requires a separate extension-owned user approval; submitting forms, external navigation, scripts, credentials, purchases, and destructive changes are not supported.

## Current limitations

This is not yet a durable autonomous worker platform. There is no user identity/authentication, database, cloud sync, durable task queue, resumable multi-step scheduler, sandboxed shell/browser workspace, OAuth integration, or production domain allowlisting. The UI task state is session-only; page memories and action audit entries persist locally in extension storage. Supported actions are narrow, and an overall task is not independently certified complete. The local agent and extension must run on the same machine as the browser.

## Deployment

The Next.js UI can be hosted on Vercel, but that alone cannot access a user's browser or local model. For a hosted UI, add its exact HTTPS origin to both the extension manifest's `externally_connectable.matches` and `workspace-origins.js`, rebuild and reload the extension, and allow the extension origin in `LIVIA_ALLOWED_ORIGINS`. The agent and extension remain separately installed local services in this implementation.