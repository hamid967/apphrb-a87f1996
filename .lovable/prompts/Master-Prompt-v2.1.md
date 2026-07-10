# HBSpro Master Prompt — v2.1 (Refined)

**Version:** 2.1 · Refined for the existing production project
**Product:** HBSpro · **Domain:** `hrhbs.com` · **Market:** Saudi Arabia
**Languages:** Arabic (primary, RTL) · English (secondary, LTR)
**Supersedes:** v2.0 (2,173 lines → this file ≈ 40% shorter, deduplicated, project-anchored)

---

# 0. PROJECT REALITY ANCHOR — READ FIRST

HBSpro is a **live production platform**, not a greenfield build. Before proposing anything, load `mem://index.md` and every referenced memory. Treat the list below as ground truth; do not rebuild what already exists.

## 0.1 Do Not Touch

- `.theme-tech` (Slate & Steel dark) on all authenticated routes and `.theme-luxe` (navy/gold) on public marketing — locked design tokens.
- 3D Saudi map intro (r3f, 25 city markers, 8s cinematic) at the landing hero.
- Auto-generated Supabase files: `src/integrations/supabase/client.ts`, `client.server.ts`, `auth-middleware.ts`, `auth-attacher.ts`, `types.ts`, `.env` VITE keys, `supabase/config.toml`.
- Auth-managed layout `src/routes/_authenticated/route.tsx` (integration-owned).
- ZATCA CSID onboarding UI, XAdES signing pipeline, Hijri UI helpers.
- Cron infrastructure: `run-scheduled-scripts`, `dispatch-notifications`, `rent-reminders` (with `cron_hook_runs` retry log and `notification_queue` backoff).
- Existing RLS policies on all 109 public tables; every business table already carries `company_id`.
- Subscription model: **manual bank transfer + super_admin approval — no payment gateway**. Do not add Stripe, Paddle, or any card processor.
- Advanced auth: password/OTP/magic/Google + TOTP 2FA (mandatory for super_admin).

## 0.2 Already Built — Refine, Do Not Rebuild

Property management (properties, buildings, floors, units, owners, tenants, contracts, rent schedules, invoices, payments, receipts, vouchers, commissions, expenses, maintenance, vendors, documents), Owner/Tenant portals, Report center, Notification center at `/dashboard/notifications`, Super-admin panel at `/admin/*` (companies, plans, receipts, cron-runs, audit, roles, banks, email providers, SMS providers), AI assistant (bilingual, tool-calling), Twilio/WhatsApp/Email dispatch with exponential backoff and dead-letter queue.

Roadmap trackers live in `mem://features/wave1-progress`, `wave2-progress`, `wave3-progress`.

## 0.3 Saudi-Specific Modules (Must Be Preserved and Extended)

Hijri calendar UI · ZATCA Phase-2 e-invoicing (CSID, XAdES, Fatoora submission) · Vouchers · Commissions · VAT · SMS/WA via Twilio + Meta · E-archive.

**Any transformation that ignores these modules is out of spec.**

---

# 1. OPERATING CONTRACT

## 1.1 Two Modes

**Mode A — Assessment (default).** Inspect, document, propose. No destructive DB ops, no broad redesigns, no production deploys. First response = the Assessment (§8) ending with one bounded first package, then wait for approval.

**Mode B — Implementation (requires explicit approval per package).** Only the approved scope. For each package: record pre-state → smallest plan → preserve behavior → build reusable production-quality code → test AR/RTL + EN/LTR + mobile + desktop + permissions + error states → report evidence, risks, rollback. Stop and ask if scope must expand.

## 1.2 Non-Negotiables

- Never delete/truncate/reseed production data.
- Never weaken RLS, authorization, storage policies, or tenant isolation.
- Never expose secrets or service-role keys.
- Never fabricate data, testimonials, partners, certifications, integrations, or regulatory claims.
- Never claim "complete/secure/optimized/production-ready" without checking the acceptance criteria.
- Every status = **Verified** · **Implemented, not fully verified** · **Proposed** · **Blocked (with blocker stated)**.

## 1.3 Source of Truth Priority

1. User's latest explicit instruction
2. Verified production data + existing business rules (memory files)
3. Approved phase scope
4. This prompt
5. General engineering preferences

Conflicts affecting data, security, compliance, billing, roles, or public claims → stop and surface.

## 1.4 Definition of Done

Acceptance criteria met · AR+EN content where in scope · RTL+LTR visually checked · mobile+desktop checked · loading/empty/success/validation/permission/failure states handled · server+DB authorization enforced · no known Critical/High security regression · relevant checks pass or explicitly disclosed as unrun · delivery report with evidence + risks + rollback.

---

# 2. POSITIONING

**Arabic:** منصة ذكية ومتكاملة لإدارة الأملاك والعقارات، تساعد الملاك والشركات ومديري العقارات على إدارة العقارات والوحدات والمستأجرين والعقود والمدفوعات والصيانة والتقارير من مكان واحد.

**English:** A smart, integrated property management platform that helps owners, real-estate companies, and property managers manage properties, units, tenants, leases, payments, maintenance, and reports from one secure platform.

**Brand name:** always written **HBSpro** — never `HBS Pro`, `HbsPro`, `HBSPRO`, `HRHBS`, `Aqari`.

**Personality:** professional · reliable · intelligent · simple · trusted · financially clear · Saudi-aware · globally competitive.

**Avoid:** template look, excessive gradients, random bright colors, overloaded cards, thin fonts, unnecessary animation, generic real-estate clichés.

---

# 3. DESIGN SYSTEM (Refine only — locked tokens)

## 3.1 Colors

Locked in `.theme-tech` (dashboard/admin) and `.theme-luxe` (public marketing). All color use goes through semantic tokens (`--brand-primary`, `--surface-*`, `--text-*`, `--border-default`, `--status-{success|warning|error|info}`). **No hardcoded hex, no `bg-white`/`text-black` utilities in components.** New surfaces must map to existing tokens; add a new token only when no existing one fits.

## 3.2 Typography

Space Grotesk (display) + DM Sans (body) with Almarai as Arabic fallback. Locked token scale: Display · H1–H4 · Body L/M/S · Caption · Button · Input label · Table header. Do not introduce Inter, Poppins, or generic sans defaults.

## 3.3 Spacing & Components

Use the existing shadcn-based token scale (max content width, section spacing, card padding, form spacing, table density). Build features by composing existing components. New primitives require justification — no parallel component systems.

---

# 4. INFORMATION ARCHITECTURE

## 4.1 Public Site (`.theme-luxe`)

Home · Platform · Solutions (Owners / Real-Estate Companies / Property Managers / Commercial / Residential) · Features · Pricing · About · Contact · Request Demo · FAQ · Help Center · Privacy · Terms · Cookies · Login · Sign Up · Password Recovery.

Sticky nav includes language switcher, Login, Request Demo. Mega-menu groups: Management · Finance · Operations · Portals.

## 4.2 App (`.theme-tech`, under `/_authenticated/`)

All modules listed in §0.2 already exist. Roadmap items = polish, not rebuild.

## 4.3 Public Pricing Page — Special Rule

Show subscription tiers with **manual bank-transfer instructions and an "awaiting approval" flow**. Never render a card-checkout, "Subscribe now" Stripe button, or any gateway CTA.

---

# 5. HOMEPAGE & INTRO

## 5.1 Hero

Preserve the existing 3D Saudi-map intro. Any redesign of surrounding hero copy must keep the r3f canvas mounted and honor its ≤8s cinematic budget.

**Arabic headline (primary):** منصة إدارة أملاك وعقارات ذكية للسوق السعودي.
**English headline (primary):** Intelligent property management, built for Saudi Arabia.

Primary CTA: *ابدأ الآن مجاناً / Start free*. Secondary CTA: *اطلب عرضاً توضيحياً / Request a demo*.

## 5.2 Homepage Sections (in order)

Hero → Trust bar → Platform value → Interactive product showcase → Services → Solutions by customer type → How it works → Pricing teaser → FAQ → CTA footer.

Trust bar shows only real logos/certifications the customer supplies. Never fabricate.

---

# 6. APP EXPERIENCE (Polish Targets)

## 6.1 Dashboard

Role-specific dashboards already exist for Owner · Property Manager · Accountant · Maintenance Manager · Super Admin. Refine metrics, empty states, and personalization; do not re-scaffold.

## 6.2 Cross-Module Consistency

Every module page must expose the same shell: page header (icon + AR/EN title + description + actions) → filters → data view (table/grid/kanban) → empty/error/loading states → row actions → detail drawer or sub-route. Use `AdminPageHeader` / equivalent shells already in `src/components`.

## 6.3 Portals

Owner portal at `/portal/*`, Tenant portal likewise. Both share the same auth gate and RLS scoping; add features by extending existing routes, not by forking layouts.

---

# 7. QUALITY BAR

## 7.1 i18n

All UI strings go through `t()` with matching AR+EN keys. Run `bun run audit:i18n` before declaring a feature done. Arabic is RTL default; test both directions.

## 7.2 Performance

LCP < 2.5s on 4G · CLS < 0.1 · TBT < 200ms. Lazy-load 3D and heavy charts. No blocking web-fonts (`display: swap`).

## 7.3 Accessibility

WCAG 2.1 AA color contrast · keyboard-navigable · visible focus rings · aria-labels on icon-only buttons · form errors linked via `aria-describedby`.

## 7.4 Security

RLS on every public table with GRANTs · roles in `user_roles` never on profiles · `has_role()` for policy checks · signed webhooks · `x-cron-secret` for cron hooks · super_admin gated by AAL2 (TOTP). Never widen `anon` grants on user-owned data.

## 7.5 SEO

Unique `<title>`/`meta description` per route via `head()` · single H1 · og:image on leaf routes only · sitemap.xml served as `application/xml` · JSON-LD where meaningful. Never reuse the home page's metadata on subpages.

## 7.6 Analytics

Track: signup, demo request, subscription approval, feature activation, portal invitation accepted. No PII in event payloads.

## 7.7 State Coverage

Every list view ships empty · loading · error · unauthorized states. Every form ships validation · submitting · success · failure states.

---

# 8. REQUIRED ASSESSMENT RESPONSE

Before any implementation, produce the **HBSpro Global Transformation Assessment** with these sections:

1. **Reality check** — Confirm each item in §0.1–0.3 is present in the current build. Flag anything missing or degraded.
2. **Public site evaluation** — Existing pages, brand consistency, content quality, RTL/LTR correctness, mobile behavior.
3. **App evaluation** — Module completeness vs §0.2, dashboard clarity, cross-module consistency gaps.
4. **Saudi-modules evaluation** — Hijri, ZATCA, Vouchers, Commissions, VAT, SMS/WA, E-archive status.
5. **Technical evaluation** — Route architecture, server-fn boundaries, RLS coverage, migration hygiene.
6. **Performance / Accessibility / SEO / Security** — Measured or observed, not assumed.
7. **Transformation opportunities** — Ranked by impact × safety.
8. **Recommended first package** — smallest coherent scope that delivers visible value without touching §0.1.

Every finding tagged Verified / Implemented-not-verified / Proposed / Blocked.

---

# 9. IMPLEMENTATION ROADMAP (Phases)

0. Assessment (this file's §8).
1. Brand & design polish (tokens, missing states, component gaps).
2. Public website polish (copy, SEO, missing pages, mega-menu).
3. Auth & onboarding refinement (existing flows, no rewrite).
4. Dashboard polish (metrics, personalization).
5. Lease & finance polish (invoicing, vouchers, commissions).
6. Maintenance & operations polish.
7. Reports & portals polish.
8. Quality pass & launch (performance, a11y, SEO, security).

Each phase = one or more packages, each package = one Assessment→Approval→Implementation→Delivery-Report cycle.

---

# 10. FEATURE DELIVERY REPORT (Required after every package)

```
## HBSpro Feature Delivery Report
Feature / Stage:
Status: Verified | Implemented-not-verified | Blocked
Objective:
Design changes:
Content changes (AR + EN):
Frontend changes:
Backend / server-fn changes:
Database changes (migrations, RLS, GRANTs):
Arabic + RTL check:
English + LTR check:
Security notes:
Performance notes:
Testing performed (evidence):
Known risks / rollback:
Release status:
```

---

# 11. INITIAL RESPONSE — REQUIRED FINAL BLOCK

End the first assessment response with exactly:

```
## Approval Required
Recommended first package: [name]
Why this comes first: [one concise business + technical reason]
Included: [bounded scope]
Excluded: [explicit exclusions]
Primary risks: [risks]
Acceptance criteria: [measurable checks]

Choose one:
1. Approve Package 1 — begin implementation in preview.
2. Revise Package 1 — adjust scope before implementation.
3. Assessment only — make no project changes.
```

Do not proceed to Mode B without an explicit "Approve" or "Revise then approve" response.
