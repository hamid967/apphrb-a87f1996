# HBSpro Full-Site Redesign Brief

## Main Goal
Upgrade every public page and authenticated dashboard screen into a modern Wix-quality SaaS template for the Saudi real-estate market: premium, bilingual, mobile-first, fast, and task-oriented.

## Design Direction
Use one unified visual system across the website and dashboard:

- Brand mood: Saudi premium real-estate operating system, Vision 2030 ready.
- Palette: deep emerald, soft ivory, luxe gold, restrained slate, and clean white surfaces.
- Layout: full-width bands, strong first viewport, spacious sections, clear cards, and obvious CTAs.
- Feel: like a polished Wix premium template, but operational and enterprise-ready.
- Avoid: clutter, dark-only pages, excessive gradients, decorative blobs, tiny buttons, nested cards, and mixed visual identities.

## Global UI Rules
- Every page starts with a clear hero/header section: title, short value statement, and 1-2 actions.
- Every long page uses repeatable bands: hero, proof, feature grid, workflow, screenshots/dashboard preview, FAQ/CTA.
- Every dashboard page uses: page header, KPI/action strip, main content, side recommendations when useful.
- Cards use radius 16-24px, soft shadow, 1px border, and generous padding.
- Forms are step-based where possible, with labels, helper text, validation, and clear completion states.
- Mobile is not a compressed desktop. Use single-column flows, sticky primary actions, and large touch targets.
- Arabic is first-class: RTL-safe spacing, Arabic labels, natural Saudi wording, and no awkward truncation.
- English remains supported with the same information architecture.

## Public Website Scope
Apply the new template language to:

- Home
- Features
- Platform
- Services
- Pricing
- Compare
- Solutions pages
- Listings pages
- Contact
- FAQ
- About
- Auth and onboarding pages

### Public Page Structure
Use this default structure unless a page has a strong reason to differ:

1. Hero: page-specific headline, short explanation, primary CTA, secondary CTA.
2. Trust strip: Saudi readiness, bilingual, AI assistant, secure cloud.
3. Feature/workflow blocks: 3-6 cards max per band.
4. Product visual: dashboard screenshot, generated product image, or real UI preview.
5. Outcome proof: metrics, testimonials, or use-case examples.
6. Final CTA: registration, demo, or contact.

## Dashboard Scope
Apply the new template language to:

- Dashboard overview
- Properties
- Property create/edit
- Leasing/contracts
- Accounting
- Maintenance
- Reports
- Tasks
- Contacts/CRM/leads/deals
- Assistant pages
- Admin/settings pages
- Tenant/owner portal pages

### Dashboard Page Structure
Use this structure:

1. Page header: title, context, primary action.
2. Action bar: search, filters, quick actions.
3. KPI row when relevant.
4. Main work area: table/grid/form/report.
5. Hamed assistant support: task guidance, next action, safe navigation.
6. Empty/loading/error states matching the premium theme.

## Hamed Assistant Direction
Hamed is part of the product UI, not a separate gimmick.

- Public site: helps users understand HBSpro and register.
- Dashboard: helps users complete tasks and navigate pages.
- Tone: Saudi Arabic, concise, operational, respectful.
- Must not request passwords, OTPs, payment cards, API keys, or private tenant data.
- Should open the right page/action where available, and explain the next step.

## Engineering Implementation Rules
- Prefer shared CSS tokens and utilities over one-off colors.
- Use existing components and route patterns.
- Do not rewrite business logic just for design.
- Add reusable page headers, cards, empty states, and section bands when repeated.
- Keep routes stable. Do not change URLs unless there is a migration plan.
- Preserve accessibility: labels, focus states, contrast, keyboard navigation, and responsive text.

## Definition of Done
A page is considered upgraded when:

- It follows the unified palette and spacing.
- It has clear hierarchy and CTA placement.
- It works in Arabic and English.
- It is responsive on mobile and desktop.
- Empty/loading/error states are present.
- Hamed can guide the user to the next useful action where relevant.
