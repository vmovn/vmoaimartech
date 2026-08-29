# Identity Context

## Owns
Canonical Contact identity, external channel identities, identity matching/merges, customer-level identity continuity.

## Invariants
- External channel identifiers map to Contact; they do not replace Contact.
- Merge operations must be auditable and avoid silent data loss.
- Identity matching must distinguish deterministic matches from AI/probabilistic suggestions.
- Provider adapters should not invent their own customer master.
