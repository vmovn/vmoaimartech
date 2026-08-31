# Developer Context — API & Extensibility

## Purpose
Owns external programmable access: API keys, API surface/security/analytics, OAuth, webhooks, integrations/plugins/extensions and developer tooling contracts.

## Primary Entry Points
- `src/lib/developer/api-keys.functions.ts`
- `src/lib/developer/api-key-errors.ts`
- `src/lib/api/**`
- `src/lib/oauth/**`
- `src/lib/webhooks/**`
- `src/lib/integrations/**`, plugin/extension/provider registries as relevant.
- API configuration catalog: `src/components/app/settings/api-config-sections.ts`.

## Source of Truth
Developer credentials/config own access contracts; called domain services still own business state.

## Invariants
- API/webhook access never bypasses domain authorization/tenant ownership.
- secrets are stored/evaluated server-side.
- webhook delivery/ingestion is observable/idempotent where applicable.
- API keys/OAuth scopes are explicit rather than relying on UI permissions.

## Current API configuration catalog
Verified checkpoint exposes 25 configuration panels across AI, WhatsApp, Messenger, Instagram, Telegram, Email/SMS, Meta, synchronization/provider registry and API keys. Treat the catalog as user-facing configuration authority, not a substitute for executable env/source discovery.

## Validation
Target API/auth/webhook/integration contract only; public-contract changes may require DEEP mode.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
