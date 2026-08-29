# Skill: Database / Migration

- Read Architecture + relevant context + existing migrations/RLS patterns.
- New migration only; do not edit deployed migration.
- Prefer additive change.
- Explicitly define organization/workspace ownership.
- Add/adjust RLS and grants with schema change.
- Check indexes/constraints/idempotency.
- Provide rollback/forward-fix strategy.
- Never use service-role access as shortcut around missing RLS design.
