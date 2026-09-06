# THE UNSEEN ARCHIVE / The Paranormal Wiki

Verified source workspace for the live `www.theparanormalwiki.com` site.

## Current source baseline

- Exact uploaded baseline: `index(20260906-111621).html`
- Public entity count: **913**
- Public entity IDs: **913 unique**
- Public entity slugs: **913 unique**
- First entity: `PARA-0001`
- Last entity: `UFO-0913`
- Alien/NHI archetypes: **60**
- UAP case files: **24**

The baseline is retained byte-for-byte under `archive/` for audit purposes. `.vercelignore` excludes the archive, audit material, and tooling from a future deployment.

## Phase 1 Earth integration

`index.html` is the verified baseline plus an isolated homepage-only Earth patch. The patch loads `paranormal-earth.css` and `paranormal-earth.js` and adds the `GLOBAL VIEW` section.

Phase 1 intentionally contains **no paranormal entity coordinates, case markers, dossier links, or 913-entity geographic layer**. Those remain a later phase.

The Earth engine includes lazy WebGL loading, day texture, normal/specular surface detail, clouds, city lights, solar direction, atmosphere, star field, drag/inertia, wheel/pinch zoom, keyboard control, reset, fullscreen, adaptive quality, reduced-motion handling, WebGL context recovery, cleanup, and a static fallback.

## Integrity guarantee

The QA harness removes the marked Earth patch and confirms byte-for-byte identity with the original uploaded HTML. It separately hashes the embedded archive DB and confirms the DB is unchanged.

See `audit/PHASE1-QA-REPORT.md` and `audit/INTEGRATION-MANIFEST.json`.

## Vercel safety

`vercel.json` currently sets `git.deploymentEnabled` to `false`. This is intended to keep Git-based deployments disabled **after the configuration is present in the repository**. Do not assume it prevents a deployment triggered by the empty repository's very first commit. Confirm the Vercel Git setting before bootstrapping `main`.
