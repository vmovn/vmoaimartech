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
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
