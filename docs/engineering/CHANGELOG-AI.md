# AI Engineering Change Memory

Not a customer-facing changelog. Records major AI-assisted engineering milestones and lessons.

For each entry capture:
- date/version;
- user intent;
- architecture touched;
- important implementation choice;
- regressions discovered;
- permanent lesson added to rules/tests/docs.

## 2026-08-30 — First-run baseline cleanup

- Intent: remove persistent demo/test/smoke accounts, reduce setup to System → Owner → Business → Review & Finish, and derive readiness from current executable capabilities.
- Architecture: bootstrap setup, local verification tooling, platform environment metadata and additive account-deletion safety.
- Choice: shared metadata is browser-safe; all value/secret evaluation stays in `environment-readiness.server.ts`. Optional provider credentials never block core setup.
- Regression discovered: inherited `prepare_platform_user_deletion` referenced missing `workspace_members.joined_at`, while organization/workspace audit DELETE triggers attempted to insert foreign keys for already-deleted parents.
- Permanent lesson: verification fixtures must be random, wrapped in `finally`, and exercise hard cleanup; environment drift is a blocking deterministic audit.
