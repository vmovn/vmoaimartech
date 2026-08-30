# Auth Context — Xác thực

## Purpose
Owns login/session/authenticated server-function identity and its handoff into tenant authorization.

## Primary Entry Points
- `src/lib/auth/serverfn-auth.ts`
- `src/lib/auth/tenant-auth.ts`
- `src/lib/auth/next-path.ts`
- auth routes/components discovered from the specific task.

## Source of Truth
Supabase Auth owns authentication/session identity. Tenant membership/roles remain Platform-owned authorization context.

## Boundaries
Authentication answers **who is this user?** Platform/RBAC/RLS answer **what may they access in this organization/workspace?**

## Invariants
- frontend guards are not authorization authority.
- never replace tenant checks with a bare authenticated `user_id` check for shared resources.
- service-role operations stay server-side.
- normal auth must not expose demo/test quick-login credentials.

## Validation
Use the narrowest auth flow affected: session/login/logout/redirect/server function. Escalate to tenant/RLS tests only if authorization boundary changed.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
