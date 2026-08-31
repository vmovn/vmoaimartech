# Booking Context — Lịch hẹn

## Purpose
Owns appointments, availability calculation, calendar/meeting integrations, synchronization, reminders/notifications and booking readiness/analytics.

## Primary Entry Points
- `src/lib/booking/booking.functions.ts`
- `src/lib/booking/availability-engine.ts`
- `src/lib/booking/calendar-integrations.functions.ts`
- `src/lib/booking/calendar-sync-engine.server.ts`
- `src/lib/booking/meeting-integrations.functions.ts`
- `src/lib/booking/meeting-providers.ts`
- `src/lib/booking/notifications-engine.server.ts`
- `src/lib/booking/readiness.functions.ts`
- `/booking/**` routes.

## Source of Truth
Appointment/availability state belongs to Booking. External calendars/meeting systems are synchronization providers.

## Invariants
- external sync is idempotent/reconcilable where possible.
- availability is calculated from owned booking rules plus connected-calendar evidence; provider data does not redefine tenant ownership.

## Validation
Booking CRUD/availability for local changes; integration/sync tests only if external provider contract changed.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
