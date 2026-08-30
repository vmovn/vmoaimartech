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
Base scan: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`, 2026-08-30.
