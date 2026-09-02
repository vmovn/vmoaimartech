# Context-First Skill

## Purpose
Execute a scoped engineering task using repository memory instead of rediscovering PM.ai.vn architecture.

## Procedure
1. Read `CONTEXT-MAP.md`.
2. Name the owning context.
3. Read only that context's `CONTEXT.md`.
4. Identify documented owner/source of truth/red zones.
5. Open the listed Primary Entry Points first.
6. If an unknown symbol blocks work, perform one targeted search for that symbol.
7. Expand to another context only when evidence proves a real dependency.
8. Implement the smallest valid change.
9. Run the narrowest relevant validation.
10. Stop when acceptance criteria pass.

## Forbidden defaults
- repository-wide search/audit for a local task;
- reading all ADRs/upstream notes automatically;
- fixing unrelated warnings/debt;
- repeating already-passed expensive checks for reassurance;
- architecture refactor without evidence it is necessary.

## Memory update
Only write back durable ownership, source-of-truth, boundary, invariant or validation changes.
