# LIVIA architecture

## Implemented runtime

- `apps/web` is a Next.js landing page and local avatar configurator. The command API maps a small set of phrases to validated, deterministic actions; it does not call an AI provider.
- `apps/extension` is a Manifest V3 extension. The popup requests optional host permission for the current site, the service worker injects the content layer only on granted sites, and the content layer owns rendering and page analysis. A bundled Three.js runtime loads the local robot model and textures; its Walk clip responds to companion movement and its Jump clip reacts to manual fire.
- The content layer builds a temporary, in-memory scene from visible text and image alt labels only when Play mode is activated. Targets, projectiles, particles, score, reconstruction, and respawn exist only in the canvas overlay. The page DOM is not modified.
- Avatar appearance and extension controls use `chrome.storage.local`; dashboard configuration uses `localStorage`. These stores are separate and are not cloud-synchronized.
- `packages/shared-types` currently contains type definitions, not a shared runtime messaging implementation.

## Privacy boundary

Host access is granted per site. Scene extraction is local and excludes forms, editable content, hidden elements, and common credential/payment fields. It does not inspect cross-origin iframe documents or send page content to the web app. Disabling page analysis ends Play mode but leaves the companion visible. Browser-protected pages remain inaccessible.

## Current limitations

The avatar uses a local WebGL/Three.js scene layered with the 2D Canvas target and effects renderer; the webpage DOM remains untouched. This is not a full 3D world renderer. The command parser is not a language model. There is no account/authentication flow, database, cloud configuration API, subscription system, robust multi-device identity, or desktop adapter implementation. The web dashboard and extension do not yet communicate. Those systems require explicit service configuration and a designed protocol before they can be claimed as available.

## Deployment

Vercel's project root should be `apps/web`. The root `vercel.json` invokes the workspace's Next.js build and uses `.next` as the output directory. GitHub Actions typecheck, lint, test, and build the web app and run extension syntax/unit checks.
