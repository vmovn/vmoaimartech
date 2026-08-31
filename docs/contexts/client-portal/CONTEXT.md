# Client Portal Context — Cổng tự phục vụ khách hàng

## Purpose
Groups customer-facing self-service experiences such as conversations, files/knowledge, tickets, appointments and commerce/billing views.

## Ownership rule
Client Portal is primarily a presentation/access context. It **consumes** Service, Booking, Commerce, Billing, Messaging and Identity state; those domains remain the source of truth.

## Entry Strategy
Locate the exact client-portal route for the requested journey, then read the source domain context before changing writes.

## Invariants
- client identity/authorization is validated server-side.
- portal convenience must not bypass tenant/data ownership.
- do not fork Orders/Tickets/Appointments/Invoices into portal-specific canonical models.

## Validation
Target client journey + corresponding domain operation. No need to audit all portal modules for one route change.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
