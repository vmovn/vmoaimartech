# VMO AIMarTech Audit Memory Pack

Purpose: make Codex/Cursor consume durable repository memory before rediscovering PM.ai.vn architecture on every task.

Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208` (2026-08-31).

Runtime baseline: `v1.0.0-localhost-1.0.6.2`.

The 1.0.7 checkpoint path-verifies repository memory and governance; it does not claim a semantic re-audit of every domain.

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

The memory checkpoint distinguishes runtime verification from memory verification. Setup and environment context now record the verified four-step setup and canonical environment artifacts; future changes should update those contexts only when their durable owners or contracts change.
