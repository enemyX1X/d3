# LIVIA

Living Interactive Virtual Intelligence Avatar.

## Product overview

LIVIA is a hybrid product architecture built for a browser-first companion experience:

- A Vercel-hosted web app for account, configuration, dashboard, and onboarding.
- A Manifest V3 browser extension for overlay injection, scene capture, pointer awareness, transforms, and local game behavior.
- A shared protocol layer for typed messages between the web app and extension.

This repository is intentionally structured as a production-style monorepo, but the browser extension remains limited to the permissions and security boundaries that browsers allow.

## Local development

```bash
cd livia
npm install
npm run dev:web
```

Then open the local Next.js app at http://localhost:3000.

## Extension build

Open the extension folder and load it as an unpacked extension in Chrome/Edge:

```bash
cd livia/apps/extension
```

Then in Chrome:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click Load unpacked
4. Select the `apps/extension` folder

## Required environment variables

Copy `.env.example` and add values if you later connect a real backend or AI provider.

## Deployment

This project is designed for GitHub + Vercel deployment.

1. Push this monorepo to GitHub.
2. Import the repository into Vercel.
3. Set the web app as the production app.
4. Configure the domain in Vercel DNS settings.

## Security and privacy

- No secrets are committed.
- Extension access is intentionally minimal.
- Page analysis is restricted to visible, permitted DOM content.
- Password, card, and private form fields are ignored.

## Notes

This is a feature-complete scaffold for the browser extension + Vercel web app architecture described in the product brief. Native desktop control, arbitrary page modification, and unrestricted access to all browser content are intentionally not implemented.
"# t1" 
