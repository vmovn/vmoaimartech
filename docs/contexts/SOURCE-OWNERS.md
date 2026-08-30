# Source Ownership Matrix

Use this as a quick path locator. It is not a complete file inventory.

| Context | High-confidence source owners / entry areas |
|---|---|
| Setup | `src/routes/setup.tsx`, `src/lib/setup/setup.functions.ts`, `setup-lock.server.ts`, `setup-state.server.ts`, `setup-steps.ts`, `setup-store.ts` |
| Auth | `src/lib/auth/serverfn-auth.ts`, `tenant-auth.ts`, auth routes |
| Platform | `src/lib/tenant/**`, `src/lib/organization.ts`, `src/lib/workspace.ts`, `src/lib/workspace-service.ts`, `src/lib/rbac/**`, `src/lib/organizations/**` |
| Identity | `src/lib/identity/identity.functions.ts`, `src/lib/crm/contact-identity.ts`, messaging contact matching/rematch |
| CRM | `src/lib/leads.ts`, `contacts.ts`, `companies.ts`, `src/lib/crm/**` |
| Sales | `src/lib/deals.ts`, `products.ts`, `quotes.ts`, `invoices.ts`, `activities.ts` |
| Messaging | `src/lib/messaging/**`, `src/lib/whatsapp/**`, `meta/**`, `telegram/**`, `email/**`, `sms.ts`, provider/integration registries |
| Marketing | `src/lib/marketing/**`, campaign/audience/segment routes and supporting libs |
| Workflow | `src/lib/workflows/engine.server.ts`, `node-registry.ts`, `workflows.functions.ts`, variables/validation/templates |
| Commerce | `src/lib/commerce/**` |
| Service | `src/lib/helpdesk/**`, `src/lib/livechat/**`, satisfaction/support routes |
| Booking | `src/lib/booking/**` |
| AI | `src/lib/ai/**`, `src/lib/ai-providers/**` |
| Analytics | `src/lib/analytics/**`, plus each domain's `analytics.functions.ts` |
| Developer | `src/lib/developer/**`, `src/lib/api/**`, `src/lib/oauth/**`, `src/lib/webhooks/**`, plugins/integrations |
| Billing | `src/lib/billing/**` |
| Navigation | `src/components/app/nav-config.ts`, sidebar rendering/filter logic |
| Environment | `.env.example`, `scripts/dev/**`, deployment files, env/catalog/readiness module when present |
| Vietnam | i18n/glossary/localization surfaces + provider extension seams; no Zalo implementation is assumed until code exists |

When a task needs a symbol outside the listed owner, use one targeted search for that symbol. Do not search the full repo by default.
