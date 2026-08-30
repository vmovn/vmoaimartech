# Context Memory Maintenance

## Goal
Repository memory should reduce repeated retrieval without becoming a second codebase.

## Update when
- an owner/source of truth changes;
- a stable primary entry point moves;
- a new cross-context dependency is introduced;
- a security/data invariant changes;
- a new provider/domain extension seam becomes canonical;
- validation requirements materially change.

## Do not update when
- button text/color/layout changes;
- a local bug patch does not change ownership;
- an internal helper is renamed but entry points/contracts remain obvious;
- a warning is merely pre-existing debt.

## Verification discipline
Every context records a base checkpoint. A context is not stale just because HEAD is newer.

Mark/re-audit a context only when:
1. a listed primary entry point no longer exists;
2. the source of truth was intentionally changed;
3. a relevant schema/API/security contract changed;
4. runtime evidence contradicts the documented invariant.

## Agent closing rule
Before finishing a substantial task ask one question:
"Did I learn a durable owner/boundary/invariant that a future agent could otherwise rediscover or accidentally undo?"
If yes, update exactly the owning context. If no, do not touch memory docs.
