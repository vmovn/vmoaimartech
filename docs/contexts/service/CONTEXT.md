# Service Context — Hỗ trợ khách hàng

## Purpose
Owns helpdesk tickets, categories/macros, collaboration, SLA, support organization/readiness, CSAT/satisfaction and live-chat service operations.

## Primary Entry Points
- `src/lib/helpdesk/helpdesk.functions.ts`
- `src/lib/helpdesk/ticket-management.functions.ts`
- `src/lib/helpdesk/sla-engine.functions.ts`
- `src/lib/helpdesk/collaboration.functions.ts`
- `src/lib/helpdesk/organization.functions.ts`
- `src/lib/helpdesk/readiness.functions.ts`
- `src/lib/helpdesk/analytics.functions.ts`
- `src/lib/livechat/**` and satisfaction routes when relevant.

## Source of Truth
Ticket/SLA/support case state. Messaging conversation can be linked, but support case is not the same entity as a conversation.

## Invariants
- support organization still respects Platform tenant boundaries.
- AI support assists actions/analysis; it does not silently replace ticket/SLA truth.

## Validation
Ticket/SLA/macro/collaboration surface changed; add Messaging regression only when conversation linkage changed.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
