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
- Migration: `supabase/migrations/20260809165200_bffcae02-e6e7-46f7-8b9b-62d634d4684c.sql`
- Original vendor filename: `20260809165200_security_hardening.sql`
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

## Owner-directed pre-install migration identity normalization

- Date: 2026-08-29
- Scope: source filenames only; SQL contents were not changed.
- Authorization: the Product owner explicitly reopened the not-yet-installed
  local migration history for one normalization pass, confirmed that the
  target database contained no data, and authorized a clean local reinstall.
- Naming convention: `YYYYMMDDHHMMSS_<UUID-v4>.sql`.
- Renames:
  - `20260717100753_85b58b20-65b4-40fd-b529-0039183e8bc3.sql` → `20260717100752_85b58b20-65b4-40fd-b529-0039183e8bc3.sql`
  - `20260717120553_17aeb447-5c74-4c1f-bda5-dddf9c281fb4.sql` → `20260717120552_17aeb447-5c74-4c1f-bda5-dddf9c281fb4.sql`
  - `20260717134549_7d3ea9c6-6697-435a-9d04-6f99c4641ee6.sql` → `20260717134548_7d3ea9c6-6697-435a-9d04-6f99c4641ee6.sql`
  - `20260719084353_bfff347e-ce89-40e3-98b1-bca15aad1176.sql` → `20260719084352_bfff347e-ce89-40e3-98b1-bca15aad1176.sql`
  - `20260728160853_d31b2e1f-8cba-4a18-ad3d-11d73ef21158.sql` → `20260728160852_d31b2e1f-8cba-4a18-ad3d-11d73ef21158.sql`
  - `20260806104053_7a72a7a2-3eff-4797-996e-5bb36144aebd.sql` → `20260806104052_7a72a7a2-3eff-4797-996e-5bb36144aebd.sql`
  - `20260809165200_security_hardening.sql` → `20260809165200_bffcae02-e6e7-46f7-8b9b-62d634d4684c.sql`
- Lifecycle: after this owner-authorized pre-install rename, the baseline is
  frozen again. These names and SQL contents are immutable going forward.
- Required validation: clean local migration replay before deployment.
