# Messaging Context — Giao tiếp đa kênh

## Purpose
Owns channel accounts, normalized conversations/messages, delivery/read state, inbox routing and provider ingestion/outbound contracts.

## Primary Entry Points
- `src/lib/messaging/accounts.functions.ts`
- `src/lib/messaging/channel-account-schema.ts`
- `src/lib/messaging/builders.ts`
- `src/lib/messaging/health.functions.ts`
- `src/lib/messaging/contact-matching.functions.ts`
- provider folders: `src/lib/messaging/providers/**`, `src/lib/messenger/**`, `src/lib/telegram/**`, `src/lib/email/**`, provider/integration registries.
- user-facing entry: `/inbox` plus provider-specific routes configured in navigation.

## Source of Truth
Normalized Conversation/Message and shared messaging state. Raw provider payload belongs only at provider edge/log/audit where required.

## Provider pipeline
provider account/config → adapter/ingestion → validated normalized event → identity resolution → conversation/message persistence → inbox/automation/AI.

## Invariants
- signature/token validation and idempotency for public webhooks.
- normalize before generic core.
- shared unread/conversation state has one owner.
- delivery state should be monotonic where provider semantics allow.
- adding a future provider such as Zalo follows the provider seam; do not copy/rename WhatsApp across core.

## Validation
Provider-edge change → provider contract/webhook + normalized output. Core message-state change → focused inbox/message regression.

## Last Verified
- Runtime baseline: `v1.0.0-localhost-1.0.6.2`.
- Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208`.
- Date: 2026-08-31.
- Verification scope: Primary Entry Point paths only; domain semantics were not re-audited.
