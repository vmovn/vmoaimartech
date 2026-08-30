# Platform Admin Context — Super Admin Control Plane

## Purpose
Owns platform-wide administration above a normal organization/workspace: users/workspaces, plans/subscriptions/gateways, provider configuration, platform settings/features, security/audit/monitoring and marketplace/support operations.

## Entry Strategy
Start from Super Admin routes/navigation, then route into the owning domain context for writes (Billing, Messaging, AI, Developer, Platform, Security). Platform Admin is a control plane, not a second source of truth.

## Invariants
- Super Admin privilege is server-authorized, not inferred from visible navigation.
- platform-wide changes preserve tenant isolation and auditability.
- do not duplicate domain data models inside an admin-only table/service merely for control-plane UI.

## Validation
Control-plane UI can be scoped; privilege/tenant/platform-setting changes are Tier 2.

## Last Verified
- Base checkpoint: `v1.0.0-localhost-1.0.5` / `67704b8967b6db5cb2a9389d8f1a7f2f836783ea`
- Date: 2026-08-30
- Newer commit alone does not invalidate this memory. Re-audit only if the listed owner/source-of-truth disappears or current evidence contradicts the contract.
