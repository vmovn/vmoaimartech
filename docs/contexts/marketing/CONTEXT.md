# Marketing Context — Tăng trưởng & Chiến dịch

## Purpose
Owns campaigns, audience targeting, segments/lists, drip/scheduling, marketing policy/compliance and marketing-specific AI assistance.

## Primary Entry Points
- `src/lib/marketing/marketing.functions.ts`
- `src/lib/marketing/lead-capture.functions.ts`
- `src/lib/marketing/lead-capture.ts`
- `src/lib/marketing/segment-filters.ts`
- `src/lib/marketing/policy-compliance.ts`
- `src/lib/marketing/ab-testing.functions.ts`
- `src/lib/marketing/test-send.functions.ts`
- campaign/audience/segment/drip/scheduling routes.

## Source of Truth
Campaign configuration/execution and marketing audience semantics. CRM/Identity remain source of customer identity; Messaging remains delivery-channel core.

## Invariants
- marketing does not create an alternative contact master.
- consent/policy checks stay explicit where required.
- test-send behavior must not become persistent demo/test account provisioning.
- provider-specific message constraints remain at provider/marketing edge, not generic CRM.

## Validation
Campaign/audience/segment/test-send path touched; include provider delivery only if execution contract changed.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
