# Identity Context — Danh tính khách hàng

## Purpose
Owns canonical Contact identity, external channel identities, deterministic/probabilistic matching, merges and customer identity continuity.

## Primary Entry Points
- `src/lib/identity/identity.functions.ts`
- `src/lib/crm/contact-identity.ts`
- `src/lib/messaging/contact-matching.functions.ts`
- `src/lib/messaging/contact-rematch.functions.ts`

## Source of Truth
Canonical Contact/Customer identity. Provider IDs are attached identities, not new customer masters.

## Invariants
- external channel identifiers map to Contact.
- provider adapters do not create their own canonical customer table/model.
- merges are auditable and avoid silent data loss.
- deterministic identity matches remain distinguishable from AI/probabilistic suggestions.

## Cross-context boundary
Messaging produces provider identity evidence → Identity resolves/links → CRM consumes the canonical customer relationship/business state.

## Validation
Target matching/merge/link flows. Escalate to CRM/Messaging only for the exact integration seam changed.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
