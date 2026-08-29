# Skill: External Integration

Use for Zalo, payments, analytics, social, AI providers, etc.

Required flow:
Provider credentials/config → server-side verification → webhook/API edge → idempotency → normalization → existing core domain → outbound adapter.

Do not create provider-specific customer/deal/workflow source of truth.
Store secrets using established secret-storage patterns.
Define retry, error mapping, audit/logging and disconnect behavior.
