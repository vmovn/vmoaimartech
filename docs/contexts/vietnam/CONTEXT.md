# Vietnam Context — Việt Nam

## Purpose
Vietnam-specific differentiation without contaminating generic core semantics.

## Owns
- Vietnamese localization and terminology.
- `+84` phone normalization/display conventions.
- VND formatting and Vietnam timezone/default conventions when Product policy chooses them.
- future Zalo OA/ZBS/Zalo ecosystem adapters.
- local business templates/onboarding.
- future validated local payment/accounting/e-invoice/tax integrations.

## Boundary rule
Vietnam extends generic provider/domain interfaces; it does not fork generic CRM, Identity, Workflow or tenant semantics merely for local naming.

## Important current-state rule
Do **not** assume Zalo exists just because Product roadmap names it. Add Zalo to current capability/env/readiness maps only after executable implementation exists.

## Validation
Localization-only changes follow glossary/i18n checks. A real local provider/payment integration also reads its generic owner context and becomes Tier 2 at the external/security boundary.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
