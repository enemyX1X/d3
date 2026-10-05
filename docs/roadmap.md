# LIVIA product roadmap

## Phase 1 — stable browser-safe MVP
- Confirmed extension installation flow and per-site permissioning.
- Local canvas overlay for avatar and scene tracking.
- Visible text and image target extraction inside the viewport.
- User-triggered manual firing model: left click or Space to fire, right click or M for missile.
- Score, combo, and clear-time loop with a blacked-out reset overlay.
- Security and privacy protections around editable controls, hidden content, and credentials.

## Phase 2 — cinematic gameplay polish
- More dramatic destruction feedback: screen flash, shake, smoke, glyph debris, glass shards.
- Clear-state presentation showing elapsed time and score cleanly after the screen is wiped.
- Refined HUD and mobile-friendly layout for demo and browser mode.
- Demo route to showcase the product without requiring a live site.
- Better weapon feel with richer tracer motion and visual punch.

## Phase 3 — product shell and user onboarding
- Stronger landing page narrative explaining browser mode, demo mode, and privacy-safe operation.
- Dashboard improvements for avatar configuration and command presets.
- Better install and onboarding steps for Chrome and Edge.
- Documentation and support messaging for permissions, site eligibility, and safe use.

## Phase 4 — advanced feature expansion
- More advanced arena states, particle layering, city or sci-fi background themes.
- Optional weapon tiers or power-ups for more game-like progression.
- Better touch support for mobile browser demos and tablet layouts.
- A structured extension/web sync protocol if dashboard configuration becomes a first-class feature.

## Definition of done for the current milestone
- Manual fire remains the only way to trigger destruction.
- The page DOM is never mutated.
- Browser mode and demo mode both work as product surfaces.
- The clear-state UX feels like a game finish rather than a silent background reset.
- Validation remains green with web tests, extension tests, lint, and production builds.
