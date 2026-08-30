# CRM Context — Khách hàng & vòng đời

## Purpose
Owns Lead, Contact/Customer business relationship, Company, lifecycle, segmentation/scoring and revenue-facing customer state that is not Deal-specific.

## Primary Entry Points
- `src/lib/leads.ts`
- `src/lib/contacts.ts`
- `src/lib/companies.ts`
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
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
