# CRM Context — Khách hàng & vòng đời

## Purpose
Owns Lead, Contact/Customer business relationship, Company, lifecycle, segmentation/scoring and revenue-facing customer state that is not Deal-specific.

## Primary Entry Points
- `src/hooks/use-leads.ts`
- `src/hooks/use-contacts.ts`
- `src/hooks/use-companies.ts`
- `src/lib/crm/contact-attachments.ts`
- `src/lib/crm/contact-identity.ts`
- CRM routes: `/leads`, `/contacts`, `/customers`, `/companies`, `/vcards`.

## Source of Truth
CRM records interpret canonical identity for business use; Identity owns who the person is, CRM owns business/customer meaning.

## Invariants
- lifecycle state and Deal state are different concepts.
- scoring remains explainable; avoid one opaque AI score becoming unchallengeable truth.
- segmentation may consume events from other domains but CRM/Marketing must not duplicate canonical identity.

## Validation
CRUD/lifecycle/filter/segment path actually changed. Cross-context checks only if identity, Deal or campaign contracts changed.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
