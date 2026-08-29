# ADR-0004: Baseline Inherited Vendor Lint Debt

**Status:** Accepted

## Context

Product v1.0.0 is frozen from the Swiffer 4.4.6 technical baseline. A
repository-wide `npm run lint` inventory reports approximately 59,113 inherited
lint and formatting findings (58,939 errors and 174 warnings). The findings
predate Product baseline work and are dominated by repository-wide formatting
differences rather than failures introduced by the localhost baseline.

A mass format or mass auto-fix would create a very large, low-signal diff,
obscure functional history, increase upstream comparison cost, and carry
unrelated regression risk.

## Decision

The inherited repository-wide lint inventory is accepted as Product v1.0.0
technical debt and is not a baseline freeze blocker.

- Do not mass-format or mass-auto-fix the inherited codebase.
- Future changes must not introduce new lint debt.
- Prefer lint and static checks scoped to changed files or modules.
- When inherited code is touched, improve nearby findings only when the change
  is safe, scoped, and does not create unrelated churn.
- Reduce repository-wide debt incrementally through dedicated, reviewable work;
  never include it as unrelated cleanup inside feature or bug-fix changes.
- Keep the repository-wide lint command as an inventory signal until the debt is
  reduced enough to become a practical blocking gate.

## Consequences

- Product v1.0.0 may be frozen with the inherited lint inventory documented.
- Typecheck, build, security checks, migration replay, and scoped lint remain
  authoritative gates for new work.
- Reviews must distinguish changed-file regressions from accepted vendor debt.
- Dedicated lint-normalization changes should be small enough to review and
  should not alter product behavior.

## Alternatives considered

- Mass auto-fix before freeze: rejected because of diff size, reviewability and
  regression risk.
- Ignore lint permanently: rejected because future changes must remain clean and
  the inherited debt should be reduced incrementally.
- Treat all inherited findings as a freeze blocker: rejected because the debt
  predates Product work and the functional/security baseline is independently
  validated.

## Revisit trigger

Revisit when the inherited count has been reduced enough for repository-wide
lint to become a stable blocking gate, or when lint configuration changes
materially alter the inventory.
