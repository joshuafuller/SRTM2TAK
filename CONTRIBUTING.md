# Contributing to SRTM2TAK

Thanks for your interest in contributing! A few quick guidelines:

- Use TypeScript and keep changes small and focused.
- Write tests for new logic (Vitest for unit, Playwright for E2E).
- Follow the existing folder structure. Prefer small libraries in `src/lib/`.
- For map/UI work, keep logic modular (no large monoliths in `main.ts`).
- Run `npm run test` and `npm run build` before opening a PR.
- For PWA/GitHub Pages issues, verify the app under the `base` path `/SRTM2TAK/`.

## Project setup

- Dev server: `npm run dev`
- Unit tests: `npm run test`
- E2E tests: `npm run test:e2e`
- Build: `npm run build`

## Coding style

- `strict` TypeScript is enabled; keep types accurate.
- Avoid noisy console logs in production paths; use a debug flag.
- Prefer streaming and memory‑efficient patterns.

## Commit hygiene

- Keep commits logically scoped and messages descriptive.

Thanks again for helping improve SRTM2TAK!
