# Source Ownership Matrix

Use this as a quick path locator. It is not a complete file inventory.

| Context | High-confidence source owners / entry areas |
|---|---|
| Setup | `src/routes/setup.tsx`, `src/lib/setup/setup.functions.ts`, `src/lib/setup/setup-security.server.ts`, `src/lib/setup/environment-readiness.server.ts` |
| Auth | `src/lib/auth/serverfn-auth.ts`, `tenant-auth.ts`, auth routes |
| Platform | `src/lib/tenant/**`, `src/lib/rbac.ts`, `src/lib/rbac-org.ts`, `src/lib/rbac.functions.ts`, `src/hooks/use-organization.ts`, `src/hooks/use-workspace.ts` |
| Identity | `src/lib/identity/identity.functions.ts`, `src/lib/crm/contact-identity.ts`, messaging contact matching/rematch |
| CRM | `src/hooks/use-leads.ts`, `src/hooks/use-contacts.ts`, `src/hooks/use-companies.ts`, `src/lib/crm/**` |
| Sales | `src/hooks/use-deals.ts`, `src/hooks/use-products.ts`, `src/hooks/use-quotes.ts`, `src/hooks/use-invoices.ts`, `src/hooks/use-sales-activities.ts`; server owner targeted discovery required per write task |
| Messaging | `src/lib/messaging/**`, `src/lib/messaging/providers/**`, `src/lib/messenger/**`, `src/lib/telegram/**`, `src/lib/email/**`, provider/integration registries |
| Marketing | `src/lib/marketing/**`, campaign/audience/segment routes and supporting libs |
| Workflow | `src/lib/workflows/engine.server.ts`, `node-registry.ts`, `workflows.functions.ts`, variables/validation/templates |
| Commerce | `src/lib/commerce/**` |
| Service | `src/lib/helpdesk/**`, `src/lib/livechat/**`, satisfaction/support routes |
| Booking | `src/lib/booking/**` |
| AI | `src/lib/ai/**`, `src/lib/admin/ai-providers.functions.ts` |
| Analytics | `src/lib/analytics/**`, plus each domain's `analytics.functions.ts` |
| Developer | `src/lib/developer/**`, `src/lib/api/**`, `src/lib/oauth/**`, `src/lib/webhooks/**`, plugins/integrations |
| Billing | `src/lib/billing/**` |
| Navigation | `src/components/app/nav-config.ts`, sidebar rendering/filter logic |
| Environment | `src/lib/environment/environment-catalog.json`, `src/lib/environment/environment-catalog.ts`, `src/lib/setup/environment-readiness.server.ts`, `scripts/ai/env-audit.mjs`, `.env.example` |
| Vietnam | i18n/glossary/localization surfaces + provider extension seams; no Zalo implementation is assumed until code exists |

When a task needs a symbol outside the listed owner, use one targeted search for that symbol. Do not search the full repo by default.
