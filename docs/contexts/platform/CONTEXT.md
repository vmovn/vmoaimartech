# Platform Context

## Owns
Organization, Workspace, membership, roles/permissions, global/workspace settings, tenant boundaries, plan/entitlement boundaries.

## Invariants
- Tenant resources must have explicit organization/workspace ownership.
- UI role checks are convenience; server/RLS authorization is authority.
- Do not add `user_id` as sole ownership for shared workspace resources without architecture justification.
- Configuration belongs in centralized settings when it can vary by deployment/workspace.
