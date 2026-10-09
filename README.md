# LIVIA

LIVIA is a local-first browser task assistant. It inspects one browser page that the user has explicitly enabled, retrieves relevant pages saved in extension-local memory, asks a local or configured compatible model to propose a plan, and routes supported actions through an extension-owned approval screen.

## Browser task workflow

- The website connects to the installed extension using `NEXT_PUBLIC_EXTENSION_ID`; the webpage never receives the local-agent bearer token or an external model key.
- On an enabled page, press `Q` to open LIVIA's cascading glass task panel. Quick tasks and a free-form prompt use the same local/remote planner, page-memory retrieval, evidence display, and extension-owned approval flow as the website workspace.
- The extension exposes only the page explicitly selected in its popup. Page snapshots are bounded and omit field values, hidden content, credentials, and most form controls.
- Saved pages use local keyword ranking and optional Ollama embeddings. LIVIA does not crawl tabs or websites in the background; a page is saved only when requested.
- Local Ollama is the default planner. An OpenRouter-compatible HTTPS endpoint can be configured on the local agent. Sending page evidence externally requires a separate consent checkbox.
- Plans are schema-validated and treated as proposals. Supported actions are scrolling, activating a matching safe same-page button, and filling a clearly labeled search field with an approved query. Search is never submitted automatically. Form submission, arbitrary scripts, external navigation, credential entry, purchases, and destructive actions are not supported.
- Scroll, click, and search-fill approvals open an extension-owned review page outside the website DOM. The extension rechecks the page permission and target, consumes each approval once, and reports an action only when it can verify the result. Overall task completion still requires fresh evidence; model text alone does not prove completion.

This is not yet a durable cloud worker platform: there is no account system, database, cross-device sync, durable queue, isolated code/browser sandbox, OAuth integration, or independent completion evaluator. Do not use it for high-impact or sensitive workflows.

The original shooting/destruction game remains available as an optional extension mode and at `/demo`; it is separate from the task assistant and is never injected into the website workspace itself.

## Local setup

Requirements: Node.js 20 or later, Chrome or Edge, and Ollama for offline planning.

```bash
npm install
```

1. Copy `.env.example` to `.env`. Set a unique `LIVIA_AGENT_TOKEN` (32+ characters), set `LIVIA_ALLOWED_ORIGINS` to `http://localhost:3000,chrome-extension://<extension-id>`, and choose an installed local model, for example `LIVIA_MODEL_SMART=qwen3:4b`. The agent listens only on `127.0.0.1:4317`.
2. Start Ollama and pull the configured model, for example `ollama pull qwen3:4b`.
3. Build the extension with `npm run build:extension`, then load `dist/livia-extension` from `chrome://extensions` with Developer mode enabled. Copy its displayed ID.
4. Put `NEXT_PUBLIC_EXTENSION_ID=<extension-id>` in `apps/web/.env.local`, then start the services in separate terminals: `npm run dev:agent` and `npm run dev:web`.
5. Open an ordinary website, use the LIVIA toolbar popup to enable that site and connect the local model with the same token, then return to `http://localhost:3000` and refresh the extension connection. The task workspace does not receive the old avatar/game overlay.

Optional compatible remote model configuration stays server-side in `.env`: set `AI_PROVIDER_API_KEY`, `AI_PROVIDER_BASE_URL` (defaults to OpenRouter), and either `AI_PROVIDER_MODEL` or a comma-separated `AI_PROVIDER_MODELS` list for the Q-panel selector, then restart the agent. Never use a `NEXT_PUBLIC_` prefix for provider credentials. For OpenRouter, use its HTTPS API base and model identifiers supported by that account. Remote page evidence is sent only after explicit user consent.

To host the website outside localhost, add that exact HTTPS origin to `apps/extension/workspace-origins.js` and the `externally_connectable.matches` list in `apps/extension/manifest.json`, rebuild/reload the extension, and allow the matching extension origin in `LIVIA_ALLOWED_ORIGINS`. Chrome requires a user gesture to load an unpacked extension; a web deployment cannot install it silently.

## Checks and deployment

```bash
npm run validate
```

Vercel can host the Next.js website with project root `apps/web`. The browser extension and `apps/agent` must run separately on the user's machine for local browser tasks. Deploying only to Vercel does not provide access to a user's browser tabs, local Ollama instance, or extension permissions. The task bridge is currently allowlisted for the two localhost development origins.

See [docs/architecture.md](docs/architecture.md) for implemented boundaries and [SECURITY.md](SECURITY.md) for vulnerability reporting.
