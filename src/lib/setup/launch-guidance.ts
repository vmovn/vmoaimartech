/**
 * Vietnam-first operator guidance for first-run setup and PM.ai.vn launch.
 * Metadata only — never include secret values. Optional integrations stay
 * non-blocking; this file recommends what to configure, not what to require.
 *
 * `keys` are the names to highlight on the System step (required-core /
 * recommended). Every catalog variable for that capability still appears in
 * the capability card via environment readiness — do not treat `keys` as the
 * full inventory.
 */

export type LaunchPriority =
  | "required-core"
  | "recommended"
  | "later"
  | "skip-vn-first"
  | "local-only";

export type LaunchGuidance = {
  priority: LaunchPriority;
  labelVi: string;
  keys: string[];
  howVi: string;
  howEn: string;
};

export const INTEGRATIONS_ENV_FILE = ".env.integrations.local";
export const PRODUCTION_ORIGIN = "https://pm.ai.vn";

export const LAUNCH_GUIDANCE: Record<string, LaunchGuidance> = {
  database: {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["DATABASE_URL"],
    howVi: "Local do START-LOCAL tạo. Production: URL PostgreSQL của Supabase/Coolify.",
    howEn: "Local START-LOCAL supplies this. Production uses the hosted PostgreSQL URL.",
  },
  supabase: {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
    howVi: "Local do START-LOCAL tạo. Production lấy từ dự án Supabase của PM.ai.vn — không copy khóa local.",
    howEn: "Local START-LOCAL supplies this. Production uses the PM.ai.vn Supabase project — never copy local keys.",
  },
  "setup-security": {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["SETUP_SECRET"],
    howVi: "Local do START-LOCAL tạo. Production: secret mới ≥24 ký tự trên Coolify, khác bản local.",
    howEn: "Local START-LOCAL supplies this. Production needs a new Coolify secret of at least 24 characters.",
  },
  "application-runtime": {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["APP_ORIGIN", "SESSION_SECRET"],
    howVi: `Local dùng origin Docker. Production bắt buộc ${PRODUCTION_ORIGIN} (HTTPS), không localhost. NODE_ENV/HOST/PORT/LOG_LEVEL có mặc định an toàn.`,
    howEn: `Local uses the Docker origin. Production must be ${PRODUCTION_ORIGIN} over HTTPS, never localhost. NODE_ENV/HOST/PORT/LOG_LEVEL have safe defaults.`,
  },
  storage: {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: [],
    howVi: "Đi cùng Supabase. Bucket private được seed khi START/RESET.",
    howEn: "Provided by the same Supabase stack. Private buckets are seeded on START/RESET.",
  },
  realtime: {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: [],
    howVi: "Cùng stack Supabase với Data API — không cần biến môi trường riêng.",
    howEn: "Same Supabase stack as the Data API — no extra environment variable.",
  },
  "tenant-provisioning": {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: [],
    howVi: "Bước Doanh nghiệp tạo Tổ chức và Không gian làm việc đầu tiên.",
    howEn: "The Business step creates the first organization and workspace.",
  },
  "api-webhooks": {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["WEBHOOK_DISPATCH_SECRET"],
    howVi: "Hạ tầng API đã có. Secret local do START-LOCAL tạo; Coolify cần secret riêng. Webhook outbound ký bằng header x-pmai-signature — không đưa secret ra trình duyệt.",
    howEn: "API routes are already present. Local START-LOCAL creates the secret; Coolify needs its own. Outbound webhooks sign with x-pmai-signature — never expose the secret to the browser.",
  },
  "background-jobs": {
    priority: "required-core",
    labelVi: "Bắt buộc",
    keys: ["INTERNAL_CRON_TOKEN"],
    howVi: "Local đồng bộ INTERNAL_CRON_TOKEN và APP_ORIGIN vào Vault khi START. Production cần cùng token trên app và Vault — pg_cron gọi hook nội bộ qua token này.",
    howEn: "Local START syncs INTERNAL_CRON_TOKEN and APP_ORIGIN into Vault. Production must use the same token on the app and Vault — pg_cron calls internal hooks with it.",
  },
  widgets: {
    priority: "later",
    labelVi: "Sau khi chạy",
    keys: ["WIDGET_SIGNING_SECRET"],
    howVi: "Secret đã có local. Bật live chat / widget nhúng / cổng khách hàng sau trong Cài đặt. Không đưa WIDGET_SIGNING_SECRET vào VITE_*.",
    howEn: "The local secret already exists. Enable live chat, embed widgets and the client portal later in Settings. Never put WIDGET_SIGNING_SECRET in VITE_*.",
  },
  plugins: {
    priority: "later",
    labelVi: "Sau khi chạy",
    keys: [],
    howVi: "Marketplace và danh mục nhà cung cấp sẵn sàng sau khi hoàn tất setup.",
    howEn: "Marketplace and provider registry are available after setup completes.",
  },
  ai: {
    priority: "recommended",
    labelVi: "Nên lấy ngay",
    keys: ["GEMINI_API_KEY"],
    howVi:
      "Ưu tiên Gemini (hạn mức miễn phí, tiếng Việt tốt): Google AI Studio → GEMINI_API_KEY. Phương án rẻ: DEEPSEEK_API_KEY. Local miễn phí: OLLAMA_BASE_URL (không cần key khách). Nhà cung cấp khác trong thẻ: OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, CUSTOM_AI_API_KEY. Production Ollama không dùng localhost. BYOK workspace cần AI_CREDENTIAL_ENCRYPTION_KEY. Chỉ cần 1 nhà cung cấp để bắt đầu. Sau setup: Super Admin → AI providers → bật Gemini, secret name GEMINI_API_KEY.",
    howEn:
      "Prefer Gemini (free tier, strong Vietnamese): Google AI Studio → GEMINI_API_KEY. Cheap fallback: DEEPSEEK_API_KEY. Free local: OLLAMA_BASE_URL (no customer key). Other keys in this card: OPENAI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, CUSTOM_AI_API_KEY. Production Ollama must not use localhost. Workspace BYOK needs AI_CREDENTIAL_ENCRYPTION_KEY. One provider is enough to start. After setup: Super Admin → AI providers → enable Gemini with secret name GEMINI_API_KEY.",
  },
  telegram: {
    priority: "recommended",
    labelVi: "Nên lấy ngay",
    keys: ["TELEGRAM_BOT_TOKEN"],
    howVi:
      "Tạo bot miễn phí với @BotFather trên Telegram. Phổ biến tại Việt Nam, không phí tin nhắn. Sau setup kết nối bot trong Hộp thư.",
    howEn:
      "Create a free bot with Telegram @BotFather. Common in Vietnam, no per-message fee. Connect it in Inbox after setup.",
  },
  "meta-app": {
    priority: "recommended",
    labelVi: "Nên lấy ngay",
    keys: ["META_APP_ID", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN"],
    howVi:
      "Tạo ứng dụng miễn phí trên developers.facebook.com. Một App dùng chung cho Messenger và Instagram — kênh chính của SMEs Việt Nam. Verify token tự đặt (≥16 ký tự ngẫu nhiên).",
    howEn:
      "Create a free app at developers.facebook.com. One app covers Messenger and Instagram — primary SME channels in Vietnam. Choose your own verify token (≥16 random characters).",
  },
  messenger: {
    priority: "later",
    labelVi: "Sau khi có Meta App",
    keys: ["MESSENGER_WEBHOOK_VERIFY_TOKEN"],
    howVi:
      "Có thể dùng chung META_WEBHOOK_VERIFY_TOKEN. Kết nối Trang Facebook sau trong Cài đặt kênh.",
    howEn:
      "META_WEBHOOK_VERIFY_TOKEN can be reused. Connect the Facebook Page later in channel settings.",
  },
  instagram: {
    priority: "later",
    labelVi: "Sau khi có Meta App",
    keys: ["IG_WEBHOOK_VERIFY_TOKEN"],
    howVi:
      "Có thể dùng chung META_WEBHOOK_VERIFY_TOKEN. Kết nối tài khoản chuyên nghiệp sau trong Cài đặt kênh.",
    howEn:
      "META_WEBHOOK_VERIFY_TOKEN can be reused. Connect the professional account later in channel settings.",
  },
  "whatsapp-cloud": {
    priority: "skip-vn-first",
    labelVi: "Bỏ qua lần đầu",
    keys: [],
    howVi:
      "Cần WABA và phí Meta; ít phổ biến hơn Facebook/Telegram với SOHO Việt Nam. Zalo chưa có trong mã nguồn hiện tại — không cấu hình giả.",
    howEn:
      "Needs a Meta WABA and usage fees; less common than Facebook/Telegram for Vietnam SOHO. Zalo is not in the current codebase — do not fake it.",
  },
  "whatsapp-qr": {
    priority: "later",
    labelVi: "Khi có worker riêng",
    keys: ["WA_QR_WORKER_URL"],
    howVi:
      "Cần QR worker độc lập. App gọi WA_QR_WORKER_URL với WA_QR_WORKER_TOKEN và WA_QR_WORKER_SIGNING_SECRET. Worker gọi lại PMAI_WEBHOOK_URL (HTTPS, đuôi /api/public/whatsapp/qr-webhook) với WA_QR_WEBHOOK_SECRET. WA_AUTH_DIR phải là thư mục persistent. Production không dùng localhost.",
    howEn:
      "Requires a separate QR worker. The app calls WA_QR_WORKER_URL with WA_QR_WORKER_TOKEN and WA_QR_WORKER_SIGNING_SECRET. The worker posts back to PMAI_WEBHOOK_URL (HTTPS, ending /api/public/whatsapp/qr-webhook) with WA_QR_WEBHOOK_SECRET. WA_AUTH_DIR must be persistent storage. Production must not use localhost.",
  },
  email: {
    priority: "later",
    labelVi: "Sau khi chạy",
    keys: ["SMTP_HOST"],
    howVi:
      "Cấu hình SMTP hoặc Resend/Mailgun trong Marketplace sau setup. SMTP_HOST chỉ là tín hiệu sẵn sàng, chưa phải vận chuyển thư. LOVABLE_API_KEY chỉ cho email/connector Lovable — không dùng cho suy luận AI của PM.ai.vn.",
    howEn:
      "Configure SMTP or Resend/Mailgun in Marketplace after setup. SMTP_HOST is a readiness marker, not a mail transport. LOVABLE_API_KEY is for Lovable email/connector only — not PM.ai.vn AI inference.",
  },
  sms: {
    priority: "skip-vn-first",
    labelVi: "Bỏ qua lần đầu",
    keys: [],
    howVi: "Twilio SMS đắt với số Việt Nam. Bỏ qua cho đến khi có nhà mạng nội địa.",
    howEn: "Twilio SMS is expensive for Vietnam numbers. Skip until a local SMS provider exists.",
  },
  "billing-stripe": {
    priority: "skip-vn-first",
    labelVi: "Bỏ qua lần đầu",
    keys: [],
    howVi:
      "Stripe không phải cổng thanh toán nội địa (VND/MoMo/VNPay). Bỏ qua để platform chạy; thanh toán Việt Nam bổ sung sau.",
    howEn:
      "Stripe is not a Vietnam-local rail (VND/MoMo/VNPay). Skip so the platform can run; local payments come later.",
  },
  "billing-paddle": {
    priority: "skip-vn-first",
    labelVi: "Bỏ qua lần đầu",
    keys: [],
    howVi: "Paddle cũng là cổng quốc tế. Bỏ qua lần chạy đầu tại Việt Nam.",
    howEn: "Paddle is also an international gateway. Skip for the first Vietnam launch.",
  },
  "calendar-oauth": {
    priority: "later",
    labelVi: "Sau khi chạy",
    keys: ["GOOGLE_CALENDAR_APP_USER_CONNECTOR_CLIENT_API_KEY"],
    howVi:
      "Ưu tiên Google Calendar (phổ biến tại VN) hơn Outlook. Cả hai khóa connector và APP_USER_CONNECTION_KEY_SECRET nằm trong thẻ này. Kết nối sau trong Đặt lịch.",
    howEn:
      "Prefer Google Calendar (dominant in Vietnam) over Outlook. Both connector keys and APP_USER_CONNECTION_KEY_SECRET are in this card. Connect later in Booking.",
  },
  "integration-marketplace": {
    priority: "later",
    labelVi: "Sau khi chạy",
    keys: [],
    howVi: "OAuth/API key theo Không gian làm việc, không qua biến môi trường lần đầu.",
    howEn: "Workspace OAuth/API-key connections, not first-run environment variables.",
  },
  deployment: {
    priority: "required-core",
    labelVi: "Khi lên Coolify",
    keys: ["VITE_APP_ENV", "PMAI_VERSION", "VITE_BRAND_NAME"],
    howVi: `Coolify: NODE_ENV=production, APP_ORIGIN=${PRODUCTION_ORIGIN}, VITE_APP_ENV=production. PMAI_VERSION gắn tag image Compose. VITE_BRAND_NAME tùy chọn (mặc định PM.ai.vn). Không copy giá trị local/Docker.`,
    howEn: `Coolify: NODE_ENV=production, APP_ORIGIN=${PRODUCTION_ORIGIN}, VITE_APP_ENV=production. PMAI_VERSION stamps the Compose image tag. VITE_BRAND_NAME is optional (default PM.ai.vn). Do not copy local/Docker values.`,
  },
  "local-development": {
    priority: "local-only",
    labelVi: "Chỉ local",
    keys: [],
    howVi: "Không đưa sang Coolify.",
    howEn: "Do not copy to Coolify.",
  },
  "test-harness": {
    priority: "local-only",
    labelVi: "Chỉ local/CI",
    keys: [],
    howVi: "Không bật trên production.",
    howEn: "Do not enable in production.",
  },
  ci: {
    priority: "local-only",
    labelVi: "Chỉ CI",
    keys: [],
    howVi: "Không phải cấu hình sản phẩm.",
    howEn: "Not product configuration.",
  },
};

export const LAUNCH_KEY_CHECKLIST: Array<{
  key: string;
  whereVi: string;
  whereEn: string;
}> = [
  {
    key: "GEMINI_API_KEY",
    whereVi: "Google AI Studio (aistudio.google.com/apikey) — hạn mức miễn phí",
    whereEn: "Google AI Studio (aistudio.google.com/apikey) — free tier",
  },
  {
    key: "TELEGRAM_BOT_TOKEN",
    whereVi: "Telegram @BotFather — tạo bot miễn phí",
    whereEn: "Telegram @BotFather — free bot",
  },
  {
    key: "META_APP_ID",
    whereVi: "developers.facebook.com → ứng dụng → Settings → Basic",
    whereEn: "developers.facebook.com → app → Settings → Basic",
  },
  {
    key: "META_APP_SECRET",
    whereVi: "Cùng trang Meta App (App Secret)",
    whereEn: "Same Meta App page (App Secret)",
  },
  {
    key: "META_WEBHOOK_VERIFY_TOKEN",
    whereVi: "Tự đặt chuỗi ngẫu nhiên; dùng khi đăng ký webhook Messenger/Instagram",
    whereEn: "Choose a random string; use it when subscribing Messenger/Instagram webhooks",
  },
];

export const PRODUCTION_COOLIFY_CHECKLIST: Array<{
  key: string;
  whereVi: string;
  whereEn: string;
}> = [
  {
    key: "APP_ORIGIN",
    whereVi: `Bắt buộc ${PRODUCTION_ORIGIN} (HTTPS) — không localhost`,
    whereEn: `Must be ${PRODUCTION_ORIGIN} (HTTPS) — never localhost`,
  },
  {
    key: "VITE_APP_ENV",
    whereVi: "production trên Coolify",
    whereEn: "production on Coolify",
  },
  {
    key: "PMAI_VERSION",
    whereVi: "Tag image Docker Compose / Coolify (tùy chọn)",
    whereEn: "Docker Compose / Coolify image tag (optional)",
  },
  {
    key: "VITE_BRAND_NAME",
    whereVi: "Tùy chọn; mặc định PM.ai.vn nếu bỏ trống",
    whereEn: "Optional; defaults to PM.ai.vn when unset",
  },
];

export const LAUNCH_PRIORITY_ORDER: LaunchPriority[] = [
  "required-core",
  "recommended",
  "later",
  "skip-vn-first",
  "local-only",
];

export function getLaunchGuidance(capabilityId: string): LaunchGuidance | undefined {
  return LAUNCH_GUIDANCE[capabilityId];
}

export function envKeyHighlightLabel(priority: LaunchPriority): string | null {
  if (priority === "required-core") return "bắt buộc";
  if (priority === "recommended") return "nên lấy";
  return null;
}
