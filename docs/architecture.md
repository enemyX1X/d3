# LIVIA architecture

## Implemented runtime

- `apps/web` is a Next.js local workspace with profile controls, deterministic avatar commands, browser-local project notes, editable memory notes, an activity log, research links, and explicit service-configuration states. Workspace records live in browser `localStorage`; they are not account-backed or synchronized. The command API maps a small set of phrases to validated, deterministic actions; it does not call an AI provider.
- `apps/extension` is a Manifest V3 extension. The popup requests optional host permission for the current site, the service worker injects the content layer only on granted sites, and the content layer owns rendering and page analysis. A bundled Three.js runtime loads the local robot model and textures; its Walk clip responds to companion movement and its Jump clip reacts to manual fire.
- The content layer builds a temporary, in-memory scene from visible text and image alt labels only when Play mode is activated. Targets, projectiles, particles, score, reconstruction, and respawn exist only in the canvas overlay. The page DOM is not modified.
- Avatar appearance and extension controls use `chrome.storage.local`; web profiles, project notes, memory notes, and activity use browser `localStorage`. These stores are separate and are not cloud-synchronized. The web command center can apply supported appearance changes; browser-scene actions still require the extension.
- `packages/shared-types` currently contains type definitions, not a shared runtime messaging implementation.

## Privacy boundary

Host access is granted per site. Scene extraction is local and excludes forms, editable content, hidden elements, and common credential/payment fields. It does not inspect cross-origin iframe documents or send page content to the web app. Disabling page analysis ends Play mode but leaves the companion visible. Browser-protected pages remain inaccessible.

## Current limitations

The avatar uses a local WebGL/Three.js scene layered with the 2D Canvas target and effects renderer; the webpage DOM remains untouched. This is not a full 3D world renderer. The command parser is not a language model. The local Ollama agent API is a separate process and is not connected to the web command center. There is no account/authentication flow, database, durable task queue, cloud execution sandbox, integration OAuth flow, or web-to-extension synchronization. Web profiles and notes are device-local UI records, not autonomous workers or model memory. These services require explicit infrastructure and authorization before they can be claimed as available.

## Deployment

Vercel's project root should be `apps/web`. The root `vercel.json` invokes the workspace's Next.js build and uses `.next` as the output directory. GitHub Actions typecheck, lint, test, and build the web app and run extension syntax/unit checks.
