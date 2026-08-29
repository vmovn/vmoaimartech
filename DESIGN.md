# UI Design Constitution

## Source of truth

Existing application design tokens and UI primitives are authoritative.
Primary token source: `src/styles.css`.
UI primitive source: `src/components/ui` and existing shared components.

Current baseline characteristics discovered in Swiffer 4.4.6:
- Tailwind CSS v4 token-driven theme.
- Inter is primary UI font.
- Semantic color tokens instead of raw feature colors.
- Centralized semantic radii (`control`, `surface`, `shell`, `pill`).
- Centralized control heights.
- Lucide icon library via shadcn configuration.
- Existing audit scripts enforce accent usage, button uniformity, menu tokens, branding and deprecated utilities.

## Rules for agents

1. Search for an existing component before creating a new UI primitive.
2. Use semantic design tokens, not arbitrary hex/rgb values.
3. Use existing semantic radius/control-height classes.
4. Use Lucide icons unless an existing product-specific icon system says otherwise.
5. Preserve density, spacing and interaction patterns of neighboring screens.
6. No page-wide redesign during feature/bug tasks.
7. No inline styling when an existing token/utility fits.
8. Responsive behavior must match existing breakpoint conventions.
9. New empty/loading/error states should reuse existing patterns.
10. UI labels must come from localization layer when the surrounding feature is localized.

## Mandatory UI inspection before coding

For any new screen/component, inspect:
- 2–3 nearest existing screens with same job;
- corresponding components in `src/components/ui`;
- relevant tokens in `src/styles.css`;
- existing animation/loading/error patterns.

## Visual regression principle

A change is not successful if functionality works but product visual language drifts.
When visual baseline tooling exists, update snapshots only when change is intentional and explain why.
