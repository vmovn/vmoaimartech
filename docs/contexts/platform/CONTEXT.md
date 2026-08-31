# Platform Context — Tổ chức, Workspace & Tenant

## Purpose
Owns Platform → Organization → Workspace hierarchy, membership, roles/permissions, tenant context, shared settings and plan/entitlement boundaries.

## Primary Entry Points
- `src/lib/tenant/active-tenant.ts`
- `src/lib/tenant/provision.functions.ts`
- `src/lib/tenant/org-url-sync.tsx`
- `src/lib/rbac.ts`
- `src/lib/rbac-org.ts`
- `src/lib/rbac.functions.ts`
- `src/hooks/use-organization.ts`
- `src/hooks/use-workspace.ts`

## Source of Truth
Organization/workspace membership and server/RLS authorization are authoritative. UI role labels are presentation only.

## Invariants
- tenant resources carry explicit org/workspace ownership.
- organization owner and workspace membership are not interchangeable concepts.
- do not use `user_id` as sole shared-resource ownership without architecture justification.
- configuration that varies by deployment/workspace belongs in centralized settings rather than scattered constants.
- tenant provisioning is security-sensitive when it changes ownership/role semantics.

## Cross-context consumers
CRM, Messaging, Workflow, Commerce, Marketing, Service, Booking, Billing and Developer all consume tenant context; they do not redefine it.

## Validation
Scoped tenant context/membership tests; RLS/security tests only when access semantics change.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
