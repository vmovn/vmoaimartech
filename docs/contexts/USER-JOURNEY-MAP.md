# Product User-Journey Map

This map organizes capability by user cognition rather than source-code folders.

Usage rhythm:
- **1×** = initial setup / rare bootstrap
- **D** = daily operational surface
- **P** = periodic management/campaign work
- **1×→∞** = configure once, machine repeats continuously
- **R** = rare/admin/specialist work

| Journey | English capability | Vietnamese meaning | Typical result | Rhythm | Owning context |
|---|---|---|---|---|---|
| 0. Initialize | Product Setup | Thiết lập sản phẩm | platform ready and securely locked after first run | 1× | Setup |
| 1. Enter work | Dashboard / Inbox / Search | Bảng điều hành / Hộp thư / Tìm kiếm | know what requires attention | D | Navigation / Messaging |
| 2. Organize business | Organization / Workspace / Members / RBAC | Tổ chức / Không gian / Thành viên / Quyền | correct tenant and team boundaries | R | Platform |
| 3. Connect channels | Provider Accounts / Webhooks / Sync | Kết nối kênh / Webhook / Đồng bộ | external channels feed the platform | 1×→∞ | Messaging / Developer |
| 4. Build customer memory | Leads / Contacts / Customers / Companies / Identity | Lead / Liên hệ / Khách hàng / Công ty / Danh tính | one customer picture across channels | D / ∞ | CRM / Identity |
| 5. Communicate & support | Inbox / Live Chat / Helpdesk / CSAT | Hội thoại / Chat / Hỗ trợ / Hài lòng | faster service with shared context | D | Messaging / Service |
| 6. Sell | Deals / Products / Quotes / Invoices / Activities | Cơ hội / Sản phẩm / Báo giá / Hóa đơn / Hoạt động | pipeline moves toward revenue | D | Sales |
| 7. Book | Appointments / Calendar / Meeting integrations | Lịch hẹn / Lịch / Họp | coordinated scheduling | D / 1×→∞ | Booking |
| 8. Commerce | Orders / Inventory / Promotions / Checkout / Shipping | Đơn / Kho / Khuyến mãi / Thanh toán / Giao hàng | transaction and fulfillment | D / P | Commerce |
| 9. Grow | Campaigns / Audience / Segments / Drip / Social | Chiến dịch / Tệp / Phân khúc / Nuôi dưỡng / Social | repeatable customer acquisition/engagement | P / 1×→∞ | Marketing |
| 10. Automate | Workflow / Bots / Webhook automation | Quy trình / Bot / Tự động webhook | human config becomes machine execution | 1×→∞ | Workflow |
| 11. Add intelligence | AI providers / AI assistants / Knowledge | AI / Trợ lý / Tri thức | assist decisions and execution without owning domain truth | D / ∞ | AI |
| 12. Measure | Analytics / Reports / BI / Forecasting | Phân tích / Báo cáo / BI / Dự báo | understand outcomes and bottlenecks | P | Analytics |
| 13. Extend | API Keys / OAuth / Webhooks / Plugins | API / OAuth / Webhook / Plugin | external systems integrate safely | R / ∞ | Developer |
| 14. Monetize platform | Plans / Subscription / Gateways / Metering | Gói / Đăng ký / Cổng thanh toán / Usage | SaaS entitlement and revenue | P / ∞ | Billing |
| 15. Operate SaaS | Super Admin / Platform security / monitoring | Siêu quản trị / Bảo mật / Giám sát | platform-wide control plane | R / P | Platform Admin |

## Product-surface priority

**Daily surface first:** Dashboard, Inbox, Customers/Contacts, Deals/Sales, Activities, Helpdesk/Orders when applicable.

**Leverage surface:** provider connections, webhooks, synchronization, segments, drip, workflows, bots, AI configuration — configure once, run repeatedly.

**Admin/specialist surface:** billing configuration, developer platform, marketplace/plugins, platform administration and deep monitoring. Keep cognitively deeper unless the user role needs them.
