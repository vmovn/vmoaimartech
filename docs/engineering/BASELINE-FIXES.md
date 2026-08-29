# Product v1.0.0 Baseline Fixes

This ledger records minimal corrections made while normalizing the unshipped
Swiffer vendor migration history into the deterministic Product v1.0.0
baseline. Product v1.0.0 is now frozen. These corrections are historical;
all 290 baseline migrations are immutable and future database changes must use
new additive migrations.

## Swiffer 4.4.6 — vCard view-policy column mismatch

- Date: 2026-08-29
- Source baseline: Swiffer 4.4.6
- Product baseline: v1.0.0
- Migration: `supabase/migrations/20260809165200_security_hardening.sql`
- Vendor defect: the `vcard_views` insert policy referenced `public.vcards.status`
  and `public.vcards.owner_id`, but neither column exists in the vCards schema.
- Original expression: `status = 'published' OR owner_id = auth.uid()`
- Corrected expression: `is_public = true OR created_by = auth.uid()`
- Evidence:
  - `20260728154545_c9bbcba2-9f34-41b8-aa85-9ea7c5413b13.sql` creates
    `is_public boolean not null default true` and `created_by uuid`.
  - Subsequent vCard lifecycle migrations preserve those columns and do not add
    `status` or `owner_id`.
  - `src/integrations/supabase/types.ts` exposes `is_public` and `created_by`
    for `public.vcards` and exposes neither invalid identifier.
  - Application queries and the public vCard UI use `is_public` as the card's
    published/public visibility flag.
  - The immediately following migration,
    `20260809165739_3e11ff78-d095-4976-b0d6-681c397a6b4c.sql`, uses the corrected
    expression for the same policy; later hardening migrations repeat it.
- In-place rationale: Product v1.0.0 has not been frozen or deployed, the
  original statement prevents clean bootstrap, the intended mapping is proven
  by repository history, and changing two identifiers is the smallest repair.
- Original vendor state: Git commit
  `982bf9d48b48701b269c766bf658d91ab24b8410` (`v1.0.0-ss4.4.6`).
- Validation result: PASS on 2026-08-29. The corrected chain applied all
  290 migrations from an empty local PostgreSQL 17 database, followed by the
  local infrastructure seed, with no skipped SQL migrations or further errors.
