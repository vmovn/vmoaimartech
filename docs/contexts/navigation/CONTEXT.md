# Navigation Context — Bản đồ trải nghiệm người dùng

## Purpose
Owns the user-facing product menu taxonomy and route discoverability, not the business logic behind each route.

## Primary Entry Point
- `src/components/app/nav-config.ts` — flat navigation authority with few top-level groups and nested categories.

## Verified product groups
Workspace; Communications; CRM & Sales; Marketing; Automation & Bots; Insights; API Configurations; Settings; Platform for Super Admin where authorized.

## Invariants
- navigation visibility is not authorization.
- permissions/feature flags/role filtering may hide a route; server/RLS remain authority.
- moving/hiding a menu item does not move business ownership to Navigation.
- avoid deleting capability code merely to simplify product surface; hide/defer first when Product policy calls for it.

## Validation
Menu rendering/active state/permission visibility only. Do not run domain regressions unless route behavior itself changed.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
