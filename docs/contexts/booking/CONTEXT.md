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
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
