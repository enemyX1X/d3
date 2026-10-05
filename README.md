# LIVIA

LIVIA (Living Interactive Virtual Intelligence Avatar) is an early browser-extension MVP with a companion web app. The extension runs a local WebGL character and Canvas gameplay overlay on sites the user explicitly enables.

## What works today

- A Manifest V3 extension requests access one site at a time and injects only on granted HTTP/HTTPS sites.
- The supplied animated robot follows the pointer; its Walk animation responds to movement and its Jump animation reacts to manual fire.
- Character scale and accent color are stored in extension-local storage and shared across enabled tabs.
- Play mode creates local virtual targets from visible headings, paragraphs, links, list items, and image alt text. Clicking fires overlay-only projectiles; hits score, produce capped particle effects, and targets rebuild or respawn.
- Page analysis excludes form content, editable controls, hidden content, and common credential/payment fields. Scene data stays in the content script and is not sent to the web app or a model.
- The dashboard stores avatar configuration in that browser's local storage and can export a JSON configuration file.

## Not implemented

There is no account system, cloud database or sync, real AI/model integration, image understanding, full 3D world renderer, cross-device persistence, or native desktop integration. The command interpreter is a small deterministic phrase parser. The dashboard does not currently configure the extension. Do not treat this MVP as a production service for sensitive workflows.

## Development

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev:web
```

Run all repository checks with:

```bash
npm run validate
```

This runs web typechecking, lint, web tests, extension tests and syntax checks, and the production web build.

## Install the extension locally

Build a clean extension folder first:

```bash
npm run build:extension
```

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable Developer mode.
3. Choose **Load unpacked** and select the generated `dist/livia-extension` folder. Do not select the repository root.
4. Leave `chrome://extensions`, open an ordinary page such as `https://example.com`, open the LIVIA popup, and choose **Enable on this site**. Browser pages like `chrome://extensions` are protected and cannot host the companion.
5. Choose **Play** to arm visible DOM text lines and images in the viewport; nothing is destroyed until you fire. Use **W/A/S/D** to move the robot, move the pointer to aim, and press **Space** to jump beside the next live asset. Click/hold fires continuous golden rounds; right-click or **M** fires a locally guided missile. Press **Q** to open LIVIA's transparent page assistant for a local visible-text summary, read aloud, Google News search, Google Translate, or screenshot. News and translation open Google in a new tab; page text is not uploaded to an AI service. Text becomes glyph debris and smoke; image copies break into glass-like shards and smoke. Hit every target to see your clear time and score over a blank LIVIA overlay for 60 seconds. The webpage DOM is never changed.

Browser-protected pages (such as browser settings and extension stores) do not allow injection. Site permission can be revoked in the popup or browser extension settings.

Chrome requires a user gesture to load an unpacked extension; a website cannot install it silently. Automatic one-click distribution requires publishing through the Chrome Web Store (and the equivalent store for other browsers).

## Vercel deployment

Import the GitHub repository into Vercel with the web project root set to `apps/web`. The project uses Next.js, `npm install`, `npm run build`, and `.next` output. No production environment variables are currently required. Add authentication, database, and AI-provider variables only when those services are actually integrated.

## Privacy and security

- Site access is optional and granted per site.
- The extension does not inspect form contents or cross-origin iframe contents.
- Page-derived target labels remain local to the active tab; they are not sent to LIVIA's API.
- Commands map to a fixed action set; arbitrary JavaScript is never executed.
- See [SECURITY.md](SECURITY.md) for vulnerability reporting.

Deploying the web app does not install the browser extension; users must load the unpacked extension separately.
