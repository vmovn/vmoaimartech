# Repository Context Memory

These files are compressed architectural memory for AI agents and humans.

## Naming — ĐẶT TÊN
Every durable concept has one owning context and stable English name. Vietnamese descriptions may explain product meaning, but internal identifiers remain English unless the code already says otherwise.

## Map — BẢN ĐỒ
Every context records:
- Purpose / user outcome;
- Primary Entry Points;
- Source of Truth;
- Reads / Writes;
- Dependencies;
- Invariants / Red Zones;
- Validation;
- Last Verified / staleness conditions.

## Repeat — LẶP LẠI
Agents reuse this memory on every task. They do not repeat architectural audits merely to gain confidence.

### Update memory only for durable changes
Update a context when ownership, source of truth, stable entry points, cross-context contracts, security/data invariants or validation gates change.
Do not update it for cosmetic patches.

### Verification checkpoint

- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`, 2026-08-31.
- This checkpoint verifies context paths and memory governance. It does not claim a semantic re-audit of every domain.
