# Architecture Constitution

## System shape

```text
Channels / Touchpoints
        ↓
Provider Adapters
        ↓
Normalized Events + Identities
        ↓
Customer / CRM Core
        ↓
Scoring + Segmentation + Timeline
        ↓
Workflow / Automation / AI Agent
        ↓
API / Webhook / MCP / Provider Actions
        ↓
Execution
        ↓
Events return to Customer Core
```

## Tenant model

Default hierarchy:

`Platform → Organization → Workspace → Members/Roles → Resources`

Every new tenant-owned record must answer:
- who owns it: organization or workspace?
- which RLS policies enforce that ownership?
- who can read/create/update/delete it?
- how is cross-tenant denial tested?

## Customer source of truth

Canonical customer record is Contact/Customer core.
External channels do not own customers.

Correct:

```text
Contact #123
├── WhatsApp identity
├── Zalo identity
├── Email identity
├── Facebook identity
└── Other identities
```

Incorrect:

```text
whatsapp_customers
zalo_customers
email_customers
```

if each acts as an independent customer master.

## Event contract

New business events should converge on a common shape where practical:

```text
organization_id
workspace_id
customer_id
actor_id
source
verb/event_name
object_type
object_id
timestamp
properties/metadata
provider_event_id
```

Provider ingestion must be idempotent.

## Integration rule

Provider-specific code belongs at boundaries.
Core code consumes normalized contracts.

Preferred shape:

`Provider → Verify → Deduplicate → Normalize → Core → Execute → Normalize result`

## Database evolution

Default sequence:

`EXPAND → BACKFILL/MIGRATE → DUAL SUPPORT → VERIFY → CONTRACT LATER`

Never edit a previously deployed migration.
Never drop/rename core schema in the same change that introduces its replacement without an explicit rollout/rollback plan.

## AI/MCP

AI never bypasses application authorization.
MCP tools call authorized service/domain operations, not raw unrestricted database access.
Every consequential AI action should be attributable to workspace, user/agent, tool and target entity.

## Architecture red zones

High-change/high-risk inherited areas:
- auth
- organization/workspace ownership
- RLS
- customer identity
- inbox/conversation core
- workflow runtime
- billing/entitlements
- Developer Center/API keys

Changes here require architecture skill + security skill and should be small, explicit and documented.
