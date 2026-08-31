# Context Map — AI Task Router

This is the single authoritative router for repository architectural memory.

**Rule:** route the task here before searching source. Read one owning context first. Do not rediscover documented architecture unless evidence contradicts it.

Memory installation checkpoint: `v1.0.0-localhost-1.0.7` / `0f401975274490d0201581325a932d7865f73208` on 2026-08-31. Primary Entry Points were path-verified only; this is not a semantic domain re-audit.

Runtime baseline: `v1.0.0-localhost-1.0.6.2`.

## Task Router

| If the task is about… | Owning context | Read first | Primary starting surface |
|---|---|---|---|
| first-run `/setup`, Setup Secret, Super Admin, setup completion | Setup | `docs/contexts/setup/CONTEXT.md` | `src/routes/setup.tsx`, `src/lib/setup/setup.functions.ts`, `src/lib/setup/setup-security.server.ts`, `src/lib/setup/environment-readiness.server.ts` |
| env keys, Coolify, public/server secrets, readiness | Environment | `docs/contexts/environment/CONTEXT.md` | `src/lib/environment/environment-catalog.json`, `src/lib/setup/environment-readiness.server.ts`, `scripts/ai/env-audit.mjs`, `.env.example` |
| login, session, auth guards, authenticated server functions | Auth | `docs/contexts/auth/CONTEXT.md` | `src/lib/auth/**`, auth routes |
| organization, workspace, membership, RBAC, tenant boundaries | Platform | `docs/contexts/platform/CONTEXT.md` | `src/lib/tenant/**`, `src/lib/rbac.ts`, `src/lib/rbac-org.ts`, `src/hooks/use-organization.ts`, `src/hooks/use-workspace.ts` |
| contact identity, channel identities, matching/merges | Identity | `docs/contexts/identity/CONTEXT.md` | `src/lib/identity/**`, `src/lib/crm/contact-identity.ts` |
| leads, contacts, customers, companies, lifecycle, segmentation | CRM | `docs/contexts/crm/CONTEXT.md` | `src/hooks/use-leads.ts`, `src/hooks/use-contacts.ts`, `src/hooks/use-companies.ts`, `src/lib/crm/**` |
| deals, pipeline, products, quotes, invoices, activities | Sales | `docs/contexts/sales/CONTEXT.md` | `src/hooks/use-deals.ts`, `src/hooks/use-products.ts`, `src/hooks/use-quotes.ts`, `src/hooks/use-invoices.ts`, `src/hooks/use-sales-activities.ts` |
| inbox, channels, accounts, conversations, messages, provider ingestion | Messaging | `docs/contexts/messaging/CONTEXT.md` | `src/lib/messaging/**`, provider folders, `/inbox` |
| campaigns, audience, segments, drip, content/social marketing | Marketing | `docs/contexts/marketing/CONTEXT.md` | `src/lib/marketing/**`, campaign/audience routes |
| triggers, actions, workflow definitions/runtime/runs | Workflow | `docs/contexts/workflow/CONTEXT.md` | `src/lib/workflows/**`, automation routes |
| catalog, checkout, orders, inventory, promotions, shipping | Commerce | `docs/contexts/commerce/CONTEXT.md` | `src/lib/commerce/**`, `/commerce/**` |
| helpdesk, tickets, SLA, CSAT, live chat support | Service | `docs/contexts/service/CONTEXT.md` | `src/lib/helpdesk/**`, livechat/satisfaction domains |
| appointments, availability, calendar/meeting integrations | Booking | `docs/contexts/booking/CONTEXT.md` | `src/lib/booking/**`, `/booking/**` |
| AI configuration, providers, completion, customer intelligence | AI | `docs/contexts/ai/CONTEXT.md` | `src/lib/ai/**`, `src/lib/admin/ai-providers.functions.ts` |
| reports, analytics, BI, forecasting, monitoring/export | Analytics | `docs/contexts/analytics/CONTEXT.md` | `src/lib/analytics/**` + domain analytics functions |
| API keys, webhooks, OAuth, plugins/extensions, developer surfaces | Developer | `docs/contexts/developer/CONTEXT.md` | `src/lib/developer/**`, `src/lib/api/**`, `oauth`, `webhooks`, integrations |
| plans, subscription, feature limits, gateways, metering | Billing | `docs/contexts/billing/CONTEXT.md` | `src/lib/billing/**` |
| navigation/menu ownership and product surface | Navigation | `docs/contexts/navigation/CONTEXT.md` | `src/components/app/nav-config.ts` |
| Super Admin control plane / platform-wide operations | Platform Admin | `docs/contexts/platform-admin/CONTEXT.md` | Super Admin routes + platform services |
| client/customer self-service portal | Client Portal | `docs/contexts/client-portal/CONTEXT.md` | targeted discovery required: begin from the requested client-portal route |
| Vietnamese localization, +84, VND, VN defaults, Zalo future adapter | Vietnam | `docs/contexts/vietnam/CONTEXT.md` | localization + generic provider seams |

## Cross-context rule

A cross-context change must name:
1. the context that **owns the new state/behavior**;
2. contexts that only **consume** it;
3. the normalization/integration seam between them.

Do not create a second owner merely because another UI needs the data.

## Search budget

For a scoped task:
- first read the owning context;
- inspect its listed primary files;
- allow at most one targeted search to resolve an unknown symbol/dependency;
- broaden further only when the result proves the documented map insufficient.

## Memory trust rule

Trust a context if its primary entry points still exist and current evidence does not contradict its invariants.
A newer commit alone is **not** a reason to re-audit the domain.
