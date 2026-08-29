# Product Glossary — English ↔ Vietnamese

Purpose: preserve domain meaning across UI, prompts, docs, AI agents and integrations.
Do not translate isolated words without reading their domain meaning.

## Core product terms

| English | Preferred Vietnamese | Meaning / rule |
|---|---|---|
| Contact | Liên hệ | Canonical individual customer/person record; do not translate as "Danh bạ" in CRM contexts. |
| Customer | Khách hàng | Person/company with established customer relationship; not every Contact is necessarily a Customer. |
| Company | Doanh nghiệp | Organization/company associated with contacts/leads/deals. |
| Lead | Khách hàng tiềm năng | Prospect before qualification/conversion. Keep internal identifier `lead`. |
| Deal | Cơ hội bán hàng | Revenue opportunity in pipeline. Avoid literal "Thỏa thuận" in CRM UI. |
| Pipeline | Quy trình bán hàng | Sales-stage pipeline. Do not use plumbing meaning. |
| Stage | Giai đoạn | Stage within a pipeline/lifecycle. |
| Lifecycle | Vòng đời khách hàng | Customer relationship lifecycle. |
| Score | Điểm | Qualification/priority/intent/etc. Context must name score type where possible. |
| Segment | Phân khúc | Dynamic/static customer grouping. |
| Activity | Hoạt động | Business/customer activity event. |
| Timeline | Dòng thời gian | Chronological customer history. |
| Conversation | Cuộc hội thoại | Channel conversation/thread. |
| Inbox | Hộp thư | Unified communications inbox. |
| Campaign | Chiến dịch | Marketing/outreach campaign. |
| Workflow | Quy trình tự động | Automation workflow; keep `Workflow` if UI space/technical context requires. |
| Trigger | Điều kiện kích hoạt | Event/condition starting a workflow. |
| Action | Hành động | Workflow/agent action. |
| Automation | Tự động hóa | Automated business process. |
| Workspace | Không gian làm việc | Tenant working area. Internal identifier unchanged. |
| Organization | Tổ chức | Parent tenant/business entity. Internal identifier unchanged. |
| Role | Vai trò | Authorization role. |
| Permission | Quyền | Authorization permission. |

## Technology terms normally kept untranslated

API, Webhook, MCP, OAuth, SSO, RLS, JWT, SDK, CLI, JSON, HTTP, URL, AI, Zalo OA, ZBS, WhatsApp, Meta, Supabase, PostHog, Coolify.

## Translation rules

- Never rename database fields, route identifiers, API payload keys or code symbols merely to Vietnamese.
- Keep interpolation placeholders and template syntax byte-for-byte unless implementation explicitly changes them.
- Add ambiguous or disputed terms here before spreading a new translation through product.
