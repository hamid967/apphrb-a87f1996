# HBSpro Studio Direction

This document locks the current site-wide visual direction so design, frontend, AI assistant, and product work move as one system.

## Creative Direction

HBSpro should feel like a premium Saudi real-estate operating system: calm, editorial, spacious, and product-grade. The reference mood is Ramotion-style product design, adapted to HBSpro's emerald/gold identity rather than copied directly.

Core feel:
- Clean cinematic product storytelling.
- Large confident typography.
- Generous spacing with fewer competing blocks.
- Tactile cards, glass, soft borders, and controlled motion.
- Arabic-first RTL rhythm with bilingual compatibility.
- Real product utility first, marketing polish second.

## Global System

Use the studio utilities added in `src/styles.css` before creating one-off styles:

- `studio-shell`: page background and full-page canvas.
- `studio-section`: consistent section width and vertical rhythm.
- `studio-eyebrow`: premium label/chip.
- `studio-title`: major headings.
- `studio-copy`: readable supporting text.
- `studio-card`: standard product card.
- `studio-card-lg`: hero cards and larger page panels.
- `studio-panel-dark`: dark emerald hero/control panels.
- `studio-button`: gold primary action.
- `studio-button-ghost`: secondary action.
- `studio-hover`: restrained card hover.
- `studio-grid`: subtle product grid background.
- `studio-noise`: light surface texture.

## Page Rules

Home:
- Keep the cinematic intro as the first impression.
- Avoid duplicate hero blocks.
- Show the product and command center quickly.

Auth:
- Treat login/signup as a premium product gateway.
- Keep inputs clear, large, and calm.
- No distracting promotional sections on mobile.

Onboarding:
- Treat registration as a guided setup, not a form dump.
- Keep Hamed visible as a helper, not a decoration.
- Every step should explain why the user is entering the data.

Dashboard:
- Prefer dense, scannable operational panels.
- Metrics should appear in cards with clear label/value/context.
- Avoid nested cards and ornamental backgrounds inside data-heavy screens.

Compare:
- Keep data and feature comparison readable first.
- Styling should frame the evidence, not compete with it.

## Motion

Use motion only when it adds orientation:
- Route cross-fade.
- Gentle card lift.
- Cinematic intro.
- Assistant state changes.

Do not animate tables, long forms, or core task flows heavily.

## Assistant Integration

Hamed should act like an embedded operator:
- Help with signup.
- Explain current page.
- Navigate to common tasks.
- Suggest next actions in dashboard workflows.
- Never block the user from manual control.

## Acceptance Checklist

Before shipping a new page:
- It uses the studio utilities or a justified local variant.
- It works in RTL and mobile.
- CTA hierarchy is obvious.
- No duplicate section performing the same purpose.
- Cards are not nested unless functionally necessary.
- Forms preserve existing validation and auth logic.
- Motion respects reduced-motion preferences.
