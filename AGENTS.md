# Product AI Engineering Constitution

## Mission

This repository is an independent Product v1.x derived from an upstream Swiffer 4.4.6 baseline.
Upstream is external R&D input, not the product roadmap.

Primary product direction: Vietnam-first business operating platform for SOHO, solopreneurs and lean companies, built around Customer Data, CRM, omnichannel execution, workflow automation, AI agents, API/Webhook/MCP and measurable revenue outcomes.

## Mandatory preflight

Before local development, read `docs/engineering/LOCAL-DEVELOPMENT.md`.

Before any substantial code change:

1. Read `PRODUCT.md`.
2. Read `ARCHITECTURE.md`.
3. For UI work, read `DESIGN.md`.
4. For wording/localization, read `GLOSSARY.md`.
5. Read `CONTEXT-MAP.md`, then relevant context docs.
6. Load the most relevant `.ai/skills/<skill>/SKILL.md`.
7. Inspect existing code and reuse existing abstractions before creating new ones.
8. Check `docs/adr/` for decisions affecting the task.
9. If touching an area inherited from upstream, check `docs/upstream/BASELINE.md` and recent upstream review notes.

Do not edit first and understand later.

## Core invariants

### Data ownership

- Platform → Organization → Workspace is the tenant hierarchy unless an ADR explicitly changes it.
- Customer/Contact remains the canonical customer identity. Do not create a second customer source of truth for Zalo, WhatsApp, email, social, POS, etc.
- Provider-specific identities attach to canonical contacts through identity mapping.
- Provider payloads live at system edges. Normalize before entering core domains.
- Shared business state has one owner. Never duplicate unread counts, lifecycle state, subscription status, deal state, or score state across competing tables/services.

### Security

- RLS is mandatory defense, never replaced by frontend guards.
- Preserve organization/workspace ownership on all tenant data.
- Privileged operations require server-side authorization and auditability.
- Never expose service-role secrets to browser code.
- Public webhooks require signature/token validation, idempotency and replay-safe processing.
- Destructive production/data/security changes are Tier 3 and require explicit human approval.

### Architecture

- Provider-specific at edge; normalized in core.
- Prefer provider/adapter/registry/config/hook over scattered branching.
- Prefer centralized ownership over duplicated state.
- Prefer additive/backward-compatible database migrations.
- Never rewrite existing migrations already used by deployed environments.
- Do not create a new abstraction until existing abstractions are inspected and shown insufficient.
- No unrelated refactors inside feature work.

### UI

- Existing design system is authoritative. Reuse existing components and tokens.
- Do not introduce arbitrary colors, radii, typography, spacing, shadows, icon styles, or interaction patterns.
- Do not redesign adjacent UI because a task touches one screen.
- Any deliberate design-system change requires updating `DESIGN.md` and an ADR if broad/systemic.

### Localization

- Vietnamese localization changes display copy, not internal identifiers, route names, table names or API contracts.
- Use glossary-approved Vietnamese terminology.
- Preserve placeholders, variables, template syntax and provider-specific names.
- Do not mass find/replace vendor terms through source without understanding context.

## Risk tiers

- Tier 0: docs/copy/non-code metadata. Execute directly.
- Tier 1: isolated UI/local logic. Inspect → plan → implement → targeted checks.
- Tier 2: database, RLS, auth, billing, identity, messaging core, workflow runtime, external integrations. Produce impact map before implementation; run security/regression checks.
- Tier 3: destructive migrations, production data mutation, auth/tenant model redesign, secret rotation, irreversible deployment changes. STOP and request explicit approval.

## Database lifecycle states

**Active state: POST-BASELINE / PRODUCT DEVELOPMENT.** Product v1.0.0 is frozen.
The 290 baseline migrations are immutable from this point forward.

### PRE-BASELINE / PRODUCT NORMALIZATION

This state is historical and no longer active. Before Product v1.0.0 was
frozen or its migration history reached production,
vendor migrations may receive minimal in-place corrections only when a defect
is proven, unambiguous, required for deterministic clean bootstrap, and has no
production data impact. The correction must preserve the vendor state in Git
history and be documented in `docs/engineering/BASELINE-FIXES.md`.

### POST-BASELINE / PRODUCT DEVELOPMENT

This is the active state. From the Product v1.0.0 freeze forward:

- all 290 baseline migrations are immutable;
- never modify a baseline or applied migration;
- all database changes use new additive migrations;
- baseline vendor fixes in `docs/engineering/BASELINE-FIXES.md` are historical
  records only and do not authorize further in-place edits;
- destructive operations require explicit review.

## Engineering autonomy

Proceed autonomously when a change is local, reversible, deterministic,
unambiguous and testable.

Stop only for semantic ambiguity, security ambiguity, destructive or data-loss
risk, production impact, external credentials/accounts, or business/product
decisions requiring human judgment. Do not ask for approval for routine,
reversible engineering work.

### External environment failure policy

When Docker, WSL, OS permissions, external registries, CLI telemetry/cache,
networking, or another environment outside application source fails:

- diagnose once;
- attempt at most one safe recovery;
- if it still fails, stop and report the exact blocker;
- never enter repeated infrastructure-repair loops;
- never use factory reset or destructive repair without explicit human approval.

## Required task workflow

For Tier 1+ tasks:

### Before change

Return a short internal plan containing:
- task intent;
- existing architecture discovered;
- files/subsystems affected;
- source of truth involved;
- risk tier;
- tests/checks to run.

Then implement unless Tier 3.

### During change

- Keep diff scoped.
- Follow existing naming and structure.
- Add new code to the domain that owns it.
- If an invariant is violated, stop and redesign rather than patch around it.

### After change

Report:
- files changed;
- behavior changed;
- database/security implications;
- checks actually executed and results;
- known limitations;
- rollback path.

Update repository memory when appropriate:
- architecture decision → ADR;
- new stable domain concept → context/glossary;
- new upstream adoption decision → upstream ledger;
- recurring bug/lesson → engineering notes or regression matrix.

## Quality gates

At minimum inspect `package.json` and run the narrowest relevant existing checks. Current upstream baseline exposes checks including:
- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run security:scan`
- `npm run security:policies`
- design audits such as branding/buttons/fonts/menu/accent where relevant.

Repository-wide lint debt inherited from Swiffer 4.4.6 is baselined by
`docs/adr/0004-inherited-vendor-lint-debt-baseline.md`. New work must not add
lint debt; prefer lint/checks scoped to changed files or modules. Never run a
mass format or mass auto-fix as unrelated cleanup.

Do not claim tests passed if test files are absent or commands were not run.

## Upstream policy

Product releases do not merge upstream blindly.

When a new Swiffer version appears:
1. compare old vendor baseline with new vendor release;
2. classify each change: SECURITY, BUGFIX, ARCHITECTURE, FEATURE, DEPENDENCY, MIGRATION;
3. decide: ADOPT, ADAPT, REIMPLEMENT, IGNORE, REPLACE;
4. map database/RLS/security changes first;
5. port only changes useful to Product roadmap;
6. record outcome in `docs/upstream/`.

Never describe this as "upgrade Product to Swiffer X". Product has its own version line.

## Product memory rule

Code explains what exists. Documentation explains why it exists.
Any non-obvious architectural decision that future agents could accidentally undo must be written down.
