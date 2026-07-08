# Aqari by HRHBS

Multi-tenant real-estate SaaS built on TanStack Start + Lovable Cloud.

## AAL2 bypass for E2E tests (Staging / CI only)

The `/admin/*` surface requires the signed-in super-admin to reach
**AAL2** (TOTP) before entering. To keep the Playwright suite in
`scripts/admin-e2e.py` runnable in Staging and CI without weakening
production, the admin layout exposes a **triple-gated bypass** that is
dead-code-eliminated from production bundles.

### Required environment variables

| Variable                  | Where          | Purpose                                                                                                            |
| ------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------ |
| `VITE_E2E_BYPASS_AAL2`    | **Build time** | Must be the literal string `"true"` to include the bypass branch in the bundle. Omit in production.                |
| `VITE_E2E_BYPASS_TOKEN`   | **Build time** | Shared secret (≥16 chars, recommended 32 bytes from `openssl rand -hex 32`). Inlined into the bundle by Vite.      |
| `E2E_BYPASS_TOKEN`        | **Test time**  | Same value as `VITE_E2E_BYPASS_TOKEN`. Read by `scripts/admin-e2e.py` and written to `sessionStorage` before nav.  |

`import.meta.env.DEV` also enables the branch, so local `bun run dev`
works without any of these variables — the token still has to match at
runtime.

### The triple gate (in `src/routes/_authenticated/admin.tsx`)

1. **Build-time flag:** `import.meta.env.DEV === true` **OR**
   `import.meta.env.VITE_E2E_BYPASS_AAL2 === "true"`.
2. **Build-time secret:** `import.meta.env.VITE_E2E_BYPASS_TOKEN` is a
   non-empty string (≥16 chars).
3. **Runtime match:** `sessionStorage["__admin_e2e_skip_aal2"]` equals
   the token exactly.

Production builds set neither `VITE_E2E_*`, so Vite inlines the guard
to `false` and the whole branch is stripped. Every successful bypass is
audited via `logAdminEvent({ kind: "aal2_bypass" })`.

### Step-by-step: enable in GitHub Actions (CI)

1. Generate a token locally: `openssl rand -hex 32`.
2. In the repo, open **Settings → Secrets and variables → Actions →
   New repository secret** and add:
   - Name: `E2E_BYPASS_TOKEN`
   - Value: the string from step 1.
3. `.github/workflows/admin-e2e.yml` already wires it through: the dev
   server is started with `VITE_E2E_BYPASS_AAL2=true` and
   `VITE_E2E_BYPASS_TOKEN=${{ secrets.E2E_BYPASS_TOKEN }}`, and the
   Playwright step receives `E2E_BYPASS_TOKEN` with the same value.
4. Push a PR — the `Admin Panel E2E` job runs with the bypass active
   and uploads `summary.json` + screenshots as artifacts.

### Step-by-step: enable in Staging

1. Reuse the same token generated for CI (one secret, one value).
2. In the Staging hosting provider, set **build-time** env vars:
   - `VITE_E2E_BYPASS_AAL2=true`
   - `VITE_E2E_BYPASS_TOKEN=<same value>`
3. Redeploy Staging so Vite inlines the new values.
4. Point Playwright at the Staging URL and export
   `E2E_BYPASS_TOKEN=<same value>` before running
   `python scripts/admin-e2e.py`.
5. **Production must NOT set `VITE_E2E_BYPASS_AAL2` or
   `VITE_E2E_BYPASS_TOKEN`.** Verify the production build with
   `grep -R __admin_e2e_skip_aal2 dist/ || echo "stripped ✅"`.

### Rotation

Rotate the token by generating a new value, updating the GitHub secret
and the Staging build env, and redeploying. No code changes required.

### Optional: authenticated CI coverage (Supabase session secrets)

`scripts/admin-e2e.py` runs unauthenticated by default. To exercise the
`/admin/*` surface as a real super-admin from CI, add these three
repository secrets in **Settings → Secrets and variables → Actions**.
All three must be set together; missing any one skips the injection
entirely and the run falls back to unauthenticated coverage.

| Secret                          | Source (`window` in a signed-in super-admin browser tab)                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `E2E_SUPABASE_STORAGE_KEY`      | The key name Supabase uses in `localStorage`, i.e. `sb-<project-ref>-auth-token`.                                |
| `E2E_SUPABASE_SESSION_JSON`     | The raw JSON value stored at that key (`localStorage.getItem("sb-<ref>-auth-token")`).                           |
| `E2E_SUPABASE_COOKIES_JSON`     | JSON array of `@supabase/ssr` cookies (`document.cookie` parsed into `[{name, value, domain, path, ...}]`).      |

How to capture them once (do this in a private window against the
**Staging** app, never production):

1. Sign in as a super-admin with TOTP completed (session must be AAL2).
2. Open DevTools → Application:
   - **Local Storage → your staging origin**: copy the key that starts with `sb-` and its value.
   - **Cookies → your staging origin**: export cookies whose name starts with `sb-` as a JSON array.
3. Paste each value into the matching GitHub secret above.

`admin-e2e.yml` already forwards them to Playwright as
`LOVABLE_BROWSER_SUPABASE_STORAGE_KEY` / `_SESSION_JSON` / `_COOKIES_JSON`,
which the script restores before navigating to `/admin`.

**Rotation.** Supabase sessions expire (default 1 hour access token, 30
day refresh token). When CI starts failing with `401` on `/admin` reads,
re-capture the three values from a fresh signed-in session and update
the secrets. Revoke the old session in Supabase Auth → Users if the
values ever leak.

## Core System seed

Seeds the baseline RBAC surface: 26 permissions, three system roles
(`core.owner` / `core.manager` / `core.viewer`) for every organization, plus
the site-owner admin bootstrap. Fully idempotent — safe to run repeatedly.

### Required environment

| Variable       | Purpose                                                                 |
| -------------- | ----------------------------------------------------------------------- |
| `DATABASE_URL` | Postgres connection string with privileges to `EXECUTE` seed functions. |

Any role that can execute the SECURITY DEFINER RPCs works — typically
`service_role` in CI, or a super-admin session locally. `psql` must be on
`PATH`.

### Local commands

```bash
# Preview only — no writes
bun run seed:core-system:dry

# Apply
bun run seed:core-system

# Idempotency test (runs the seed twice, asserts counts don't change)
bun run test:seed
```

### CI

```yaml
# .github/workflows/seed.yml
jobs:
  seed-core-system:
    runs-on: ubuntu-latest
    env:
      DATABASE_URL: ${{ secrets.SUPABASE_DB_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: sudo apt-get update && sudo apt-get install -y postgresql-client
      - run: bun install --frozen-lockfile
      - run: bun run seed:core-system:dry
      - run: bun run seed:core-system
      - run: bun run test:seed
```

### Expected output (apply mode)

```
=== APPLY — seeding Core System ===
                            seed_core_system
-------------------------------------------------------------------------
 {"grants": 108, "core_roles": 6, "permissions": 26, "organizations": 2}

--- Totals ---
 permissions | core_roles | grants
-------------+------------+--------
          26 |          6 |    108

--- Site-owner (admin) approval status ---
 approval_status |          trial_ends_at         | is_admin
-----------------+--------------------------------+----------
 approved        | 2027-07-03 23:42:34.447901+00  | t
```

Idempotency test (`bun run test:seed`) prints:

```
permissions: 26 → 26
core_roles : 6 → 6
grants     : 108 → 108
Result: PASS
```

Any drift makes the final assertion divide by zero and psql exits non-zero,
failing the CI job.