# Platform Context — Tổ chức, Workspace & Tenant

## Purpose
Owns Platform → Organization → Workspace hierarchy, membership, roles/permissions, tenant context, shared settings and plan/entitlement boundaries.

## Primary Entry Points
- `src/lib/tenant/active-tenant.ts`
- `src/lib/tenant/provision.functions.ts`
- `src/lib/tenant/org-url-sync.tsx`
- `src/lib/organization.ts`
- `src/lib/workspace.ts`
- `src/lib/workspace-service.ts`
- `src/lib/rbac/**`, `src/lib/organizations/**`

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
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
