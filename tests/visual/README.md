# Visual Regression

Snapshot tests that guard the shared design tokens (colors, fonts, shadows) across `/dashboard`, `/admin`, and a representative form (`/onboarding`).

## Run

```bash
# 1) Generate baselines once (or after intentional design changes)
UPDATE_BASELINES=1 python tests/visual/visual-regression.spec.py

# 2) Compare against baselines on subsequent runs
python tests/visual/visual-regression.spec.py
```

Exit code `1` = at least one surface drifted. Diffs are written to `tests/visual/diffs/<scenario>.png`.

Tunables at the top of the script:
- `THRESHOLD` — per-channel color tolerance (default 24)
- `MAX_DIFF_RATIO` — allowed fraction of changed pixels (default 2%)

Requires an authenticated session — the script auto-restores the `LOVABLE_BROWSER_SUPABASE_*` env when present.
