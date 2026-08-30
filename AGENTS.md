# Product AI Engineering Constitution — Context-First Edition

## Mission

This repository is an independent Product v1.x derived from an upstream Swiffer 4.4.6 baseline.
Upstream is external R&D input, not the Product roadmap.

Primary direction: Vietnam-first business operating platform for SOHO, solopreneurs and lean companies, built around Customer Data, CRM, omnichannel execution, workflow automation, AI, API/Webhook/MCP and measurable revenue outcomes.

## Prime Directive: repository memory before repository discovery

The repository contains persistent architectural memory. Use it before searching source.

For every task:

1. Read `CONTEXT-MAP.md`.
2. Identify the smallest owning context.
3. Read exactly that context's `docs/contexts/<context>/CONTEXT.md` first.
4. Start from the documented **Primary Entry Points** and **Source of Truth**.
5. Expand investigation only when current evidence requires it.

**Do not re-audit documented architecture merely for reassurance.**

Repository documentation explains ownership, boundaries and why. Code remains the ultimate truth when the two demonstrably conflict.

## Task modes

### FAST / SURGICAL — default

Use for a local, reversible, clearly scoped task.

Read only:
- this `AGENTS.md`;
- `CONTEXT-MAP.md`;
- one owning context document;
- directly referenced source files;
- `DESIGN.md` only when the change is visual/system-design relevant;
- `GLOSSARY.md` only when wording/localization is relevant.

Rules:
- no repository-wide audit;
- no broad architecture rediscovery;
- no unrelated ADR/upstream review sweep;
- no dependency upgrade unless required by the task;
- no opportunistic cleanup;
- prefer the smallest valid change;
- verify only behavior affected by the change;
- stop when acceptance criteria pass.

### DEEP — escalate only when needed

Escalate from FAST to DEEP only if one of these is true:
- ownership is unclear or multiple contexts own meaningful writes;
- documented entry points are missing/stale;
- runtime/code evidence contradicts context memory;
- task changes database schema, RLS, auth, tenant ownership, billing entitlement, identity semantics, messaging core, workflow runtime, security boundary or public API/data contract;
- task is an architecture decision rather than an implementation;
- Tier 3 risk is encountered.

DEEP may additionally read `PRODUCT.md`, `ARCHITECTURE.md`, relevant ADRs, upstream notes and multiple context docs. Still do not audit unrelated domains.

### AUDIT — explicit only

Repository-wide audit is never implied by words such as "check", "ensure", "clean", "production-ready", "robust" or "optimize".

Run a broad audit only when the user explicitly asks for an audit whose scope genuinely requires it.

## Core invariants

### Tenant and data ownership
- Platform → Organization → Workspace is the tenant hierarchy unless an ADR explicitly changes it.
- Tenant resources preserve explicit organization/workspace ownership.
- UI permission checks are convenience; server authorization and RLS are authority.
- Shared business state has one owner. Do not duplicate lifecycle, deal, unread, subscription or score state across competing sources.

### Customer identity
- Contact/Customer remains the canonical customer identity.
- External provider identities attach to canonical contacts; providers do not invent a second customer master.
- Provider payloads remain at system edges and are normalized before entering generic core domains.

### Security
- RLS remains defense-in-depth and is never replaced by frontend guards.
- Privileged operations require server-side authorization and should be auditable.
- Service-role/provider/payment/private secrets never enter browser-visible code or `VITE_*` variables.
- Public webhooks require appropriate validation, idempotency and replay-safe processing.

### Architecture
- Provider-specific at the edge; normalized in the core.
- Prefer existing provider/adapter/registry/config/hook seams over scattered branching.
- Prefer centralized ownership over duplicated state.
- Do not create a new abstraction until the existing abstraction is shown insufficient.
- No unrelated refactors inside feature work.

### Database lifecycle
**Active state: POST-BASELINE / PRODUCT DEVELOPMENT.**
- The 290 Product baseline migrations are immutable.
- Never edit an applied/baseline migration.
- New DB changes use new additive migrations.
- Destructive operations require explicit review.

### UI and localization
- Existing design system/components/tokens are authoritative.
- Do not redesign adjacent UI because one screen is touched.
- Vietnamese localization changes display copy, not internal identifiers, route names, table names or API contracts.
- Preserve placeholders/template syntax/provider names.

## Risk tiers

- **Tier 0** — docs/copy/non-code metadata: execute directly.
- **Tier 1** — isolated UI/local logic: FAST path; targeted checks.
- **Tier 2** — DB/RLS/auth/billing/identity/messaging core/workflow runtime/external integrations/security-sensitive bootstrap: impact map + focused security/regression checks.
- **Tier 3** — destructive migrations, production data mutation, auth/tenant model redesign, secret rotation, irreversible deployment changes: STOP for explicit approval.

### Setup risk split

`/setup` is not automatically Tier 2 merely because the route is named setup.

- Presentation/layout/labels/reordering that do not alter secure contracts → Tier 1.
- Business form mapping that reuses existing safe server functions → Tier 1/2 depending on writes.
- `SETUP_SECRET`, setup-open state, `setup_complete`, first Super Admin bootstrap, tenant provisioning, service-role secret evaluation, migration/bootstrap execution → Tier 2 red zone.

## Engineering autonomy

Proceed autonomously when a change is local, reversible, deterministic, unambiguous and testable.
Stop only for semantic/security ambiguity, destructive/data-loss risk, production impact, external credentials/accounts or product/business decisions requiring human judgment.

## External environment failure policy

For Docker, WSL, OS permissions, registries, CLI cache/telemetry or external networking failures:
- diagnose once;
- attempt at most one safe recovery;
- if still failing, stop and report the exact blocker;
- never enter repeated infrastructure-repair loops;
- never factory-reset external infrastructure without explicit approval.

## Task workflow

### Before change
For Tier 1+, state briefly:
- goal;
- owning context;
- documented entry points/source of truth;
- files expected to change;
- risk tier;
- narrow validation to run.

Do not produce a long plan for an obvious small task.

### During change
- Keep diff scoped.
- Start from documented owners.
- Diagnose before editing when root cause is uncertain.
- Prefer smallest valid change.
- If evidence requires leaving the owning context, explain why before expanding.

### After change
Report only:
- files changed;
- behavior changed;
- DB/security implications if any;
- checks actually run and results;
- remaining blocker/limitation if any.

## Validation policy

Inspect `package.json` for available commands. Use the narrowest relevant check first.
Common gates include `npm run typecheck`, `npm run build`, security checks and scoped tests.

Inherited Swiffer lint debt is baselined. Never mass-format or mass-auto-fix as unrelated cleanup.
A pre-existing warning is not a task failure unless the change caused or depends on it.

**Do not repeat an unchanged expensive check in the same task merely for reassurance.**

## Repository memory maintenance

Update context memory only when durable knowledge changes:
- new source of truth;
- new domain owner;
- new cross-context dependency;
- new security/data invariant;
- new stable entry point;
- new validation gate;
- architectural decision future agents could accidentally undo.

Do not update architecture memory for cosmetic patches.

Each context has a `Last Verified` section. A newer commit alone does not make memory stale. Memory becomes stale only when relevant ownership/entry points/contracts changed or evidence contradicts it.

## Upstream policy

Product releases do not merge upstream blindly.
For a new Swiffer release: compare → classify SECURITY/BUGFIX/ARCHITECTURE/FEATURE/DEPENDENCY/MIGRATION → decide ADOPT/ADAPT/REIMPLEMENT/IGNORE/REPLACE → port only Product-relevant changes → record outcome.

## Token-efficiency rule

Optimize **total task cost**, not prompt length.

Total cost ≈ retrieval + reasoning + file reads + edits + validation + retries.

The default optimization is:
**memory → owner → smallest surface → smallest valid change → targeted verify → stop.**
