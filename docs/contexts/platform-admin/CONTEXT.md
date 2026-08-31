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
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
