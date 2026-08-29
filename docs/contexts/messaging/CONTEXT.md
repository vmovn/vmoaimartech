# Messaging Context

## Owns
Channel accounts, normalized conversations/messages, delivery/read state, inbox routing, channel ingestion/outbound provider contracts.

## Invariants
- Provider payloads remain at provider edge; normalize before core.
- Webhook ingestion is signature-verified and idempotent.
- Delivery state is monotonic where provider semantics allow it.
- Shared unread/conversation state has one owner.
- Adding Zalo should follow provider architecture, not copy/rename WhatsApp implementation across core.
