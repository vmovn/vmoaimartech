# Skill: Architecture Change

Use when task changes boundaries, ownership, shared state or introduces a cross-domain abstraction.

Before coding answer:
- Which context owns this concept?
- What is its source of truth?
- Which existing abstraction can host it?
- Does it duplicate state?
- Does it change tenant/security boundaries?
- Does it need an ADR?

Prefer small seams and explicit contracts over framework-wide rewrites.
