# AI Engineering Change Memory

Not a customer-facing changelog. Records major AI-assisted engineering milestones and lessons.

For each entry capture:
- date/version;
- user intent;
- architecture touched;
- important implementation choice;
- regressions discovered;
- permanent lesson added to rules/tests/docs.

## 2026-09-02 — AI Core v1 lock (Phase 8)

- Intent: close the first-login Ollama gap, prove P1–P7 with focused E2E, publish the operator run checklist, freeze AI Core v1.
- Architecture: no new router, premium auto-provision, pricing, plan defaults, or migrations. Platform still calls `ensurePlatformOllamaForWorkspace`.
- Choice: `ensureMyOrganization` best-effort provisions Platform Local AI; Premium Credits remain Super Admin configuration (create / applyToAllWorkspaces / sync / price / plan credits).
- Regression discovered: personal-org SQL create never invoked Ollama ensure; signup could miss utility AI even when `OLLAMA_BASE_URL` was set.
- Permanent lesson: workspace SQL provision is not AI provision. Application-side ensure must run on every workspace-create path, including first login, and must never fail signup.

## 2026-08-30 — First-run baseline cleanup

- Intent: remove persistent demo/test/smoke accounts, reduce setup to System → Owner → Business → Review & Finish, and derive readiness from current executable capabilities.
- Architecture: bootstrap setup, local verification tooling, platform environment metadata and additive account-deletion safety.
- Choice: shared metadata is browser-safe; all value/secret evaluation stays in `environment-readiness.server.ts`. Optional provider credentials never block core setup.
- Regression discovered: inherited `prepare_platform_user_deletion` referenced missing `workspace_members.joined_at`, while organization/workspace audit DELETE triggers attempted to insert foreign keys for already-deleted parents.
- Permanent lesson: verification fixtures must be random, wrapped in `finally`, and exercise hard cleanup; environment drift is a blocking deterministic audit.
