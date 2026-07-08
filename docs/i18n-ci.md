# i18n CI (warn-only + baseline)

The `i18n-audit` job in `.github/workflows/quality.yml` protects translation
coverage without blocking PRs while we clean up the pre-existing debt.

## How it works

1. `bun run i18n:ci` runs both audits and compares the counts to
   `.i18n-baseline.json`.
2. `I18N_WARN_ONLY=1` is set in CI, so regressions print `⚠️` but the job
   still passes. `continue-on-error: true` keeps the whole PR green even if
   we flip the switch later.
3. Improvements pass, and the script reminds you to lower the baseline.

## Metrics tracked

| Metric | Source |
| --- | --- |
| `hardcodedStrings.total` | `scripts/i18n-audit.mjs --json` → `total` |
| `hardcodedStrings.filesWithFindings` | same script → `files` |
| `keys.missingInEn` / `missingInAr` | `scripts/i18n-keys-audit.mjs --json` |
| `keys.arMissingVsEn` / `enMissingVsAr` | same |
| `keys.dynamicUnresolvedSites` | dynamic `t(var)` sites we can't resolve |

## Batch cleanup workflow

1. Pick a batch (a folder, a namespace, or ~50 strings).
2. Move strings behind `t("…")`, add EN + AR keys in `src/lib/i18n.ts`.
3. Run:
   ```bash
   bun run i18n:ci             # sanity: no regression
   bun run i18n:ci:update      # lock the improvement into the baseline
   ```
4. Commit the code changes **and** `.i18n-baseline.json` in the same PR.

## Going strict

When `hardcodedStrings.total` reaches 0, remove `I18N_WARN_ONLY` and
`continue-on-error: true` from `.github/workflows/quality.yml` to start
failing PRs that introduce new hard-coded strings.