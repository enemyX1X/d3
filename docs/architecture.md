# LIVIA architecture

## Core model

The product uses a browser-first hybrid architecture:

- Web application: Vercel-hosted dashboard and landing page.
- Browser extension: local scene overlay and pointer-aware avatar behavior.
- Shared types: message and object schemas reused by the web app and extension.

## Browser boundaries

This product does not attempt to implement privileged access outside browser boundaries. The extension does not inspect private forms, password fields, payment inputs, or content from cross-origin iframes without explicit permission.

## Future desktop adaptation

A future desktop environment can plug into the same abstraction with a desktop adapter, but the current version intentionally implements a browser adapter only.
