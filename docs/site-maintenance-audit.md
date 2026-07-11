# Site Maintenance Audit

Date: 2026-07-11
Branch: hrbapp

## Scope Reviewed

- Project scripts and dependencies in `package.json`.
- TypeScript and Vite/PWA configuration.
- Generated route tree overview.
- Public site surfaces recently redesigned.
- Auth and onboarding flows.
- Supabase and Lovable integration entry points.
- Hamid assistant agent, voice settings, TTS route, and onboarding AI helper.
- Font loading strategy.
- Motion library usage.

## Fixes Applied

### Motion package alignment

`CinematicIntro` and `EmeraldSplitHero` imported `framer-motion`, but the project dependency is `motion`. This could break builds because `framer-motion` is not listed in `package.json`.

Fixed files:
- `src/components/hbspro/CinematicIntro.tsx`
- `src/components/hbspro/EmeraldSplitHero.tsx`

Both now import from `motion/react`.

### Font loading cleanup

The app already bundles local fonts through `@fontsource` in `src/styles.css`. The root route also loaded Google Fonts externally for overlapping font families.

Fixed files:
- `src/routes/__root.tsx`
- `src/styles.css`
- `src/components/hbspro/EmeraldSplitHero.tsx`

The site now uses the bundled stack:
- `Almarai`
- `IBM Plex Sans Arabic`
- `Inter`
- `DM Sans`
- `Space Grotesk`

Removed external Google Fonts preconnect/stylesheet from the root shell.

### Hamid TTS protection

`/api/hamid-tts` is intentionally public enough for the assistant experience, but it should not be unlimited because it calls paid upstream TTS.

Fixed file:
- `src/routes/api/hamid-tts.ts`

Added an in-memory per-client rate limit:
- 12 requests per minute.
- Returns HTTP 429 with `Retry-After` when exceeded.

## Verified After Fix

Checked the touched files after commit:
- No remaining `framer-motion` import in the edited components.
- No `fonts.googleapis.com` or `fonts.gstatic.com` reference in `src/routes/__root.tsx`.
- No remaining `Fira Sans` or `DM Serif Display` dependency in edited frontend files.
- `src/routes/api/hamid-tts.ts` includes `TTS_RATE_LIMIT`.

## Notes

A full local `npm install`, `npm run typecheck`, and `npm run build` could not be run in this environment because the private GitHub repository could not be cloned through the terminal auth flow. Review was performed through the GitHub connector by reading and updating repository files directly.

Recommended CI checks after deployment pipeline pulls the branch:

```bash
npm install
npm run typecheck
npm run lint
npm run build
npm test
```

## Follow-up Priority

1. Run CI/build and address any generated type errors.
2. Review all dashboard pages against the `studio-*` design utilities.
3. Add automated import/dead-route checks if CI does not already enforce them.
4. Consider moving high-cost AI routes behind authenticated access or stronger quota rules if public usage grows.
