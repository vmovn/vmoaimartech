# VMO AIMarTech Audit Memory Pack

Purpose: make Codex/Cursor consume durable repository memory before rediscovering Swiffer architecture on every task.

Built from a targeted GitHub architecture scan of `vmovn/vmoaimartech` at `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea` (2026-08-30), plus the established Product architecture/governance already in the repository.

## Install

Extract this ZIP **at the repository root** so paths merge directly.

This pack intentionally:
- replaces `AGENTS.md` with a context-first FAST/DEEP/AUDIT workflow;
- replaces `CONTEXT-MAP.md` with the authoritative AI Task Router;
- expands `docs/contexts/**` into persistent architectural memory;
- adds a Cursor always-on rule and context-first AI skill;
- does **not** modify application source, migrations, package dependencies, `.env`, Docker or Supabase configuration.

After extraction:
1. run `git diff -- AGENTS.md CONTEXT-MAP.md docs/contexts .cursor/rules .ai/skills docs/engineering/AI-*`;
2. review that no active local Codex task changed the same governance files;
3. commit as a governance/memory checkpoint.

## Important limitation

This pack prevents **unnecessary rediscovery**, not legitimate verification.
Code remains authoritative if a documented path disappears or behavior contradicts memory.

## Active setup/env task note

The repository `main` checkpoint scanned here predates any uncommitted local changes currently being made by Codex after `v1.0.0-localhost-1.0.5`. `setup` and `environment` context files therefore contain explicit staleness rules: UI step labels may change without invalidating the secure bootstrap architecture; a newly added environment catalog/readiness module should be adopted as the canonical metadata source after it is committed.
