import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ENVIRONMENT_CAPABILITIES,
  ENVIRONMENT_VARIABLES,
  type EnvironmentCapabilityMetadata,
  type EnvironmentCategory,
  type EnvironmentStatus,
  type EnvironmentVariableMetadata,
} from "@/lib/environment/environment-catalog";

export type EnvironmentVariableCheck = Pick<
  EnvironmentVariableMetadata,
  "key" | "requiredness" | "scope" | "secret" | "setupBlocking" | "coolify"
> & {
  configured: boolean;
  valid: boolean;
};

export type CapabilityReadiness = EnvironmentCapabilityMetadata & {
  status: EnvironmentStatus;
  detailEn: string;
  detailVi: string;
  environment: EnvironmentVariableCheck[];
};

export type EnvironmentReadinessReport = {
  ready: boolean;
  summary: {
    ready: number;
    needsAttention: number;
    notConfigured: number;
    developmentOnly: number;
  };
  categories: Record<EnvironmentCategory, CapabilityReadiness[]>;
  checkedAt: string;
};

type OperationalResult = {
  status: EnvironmentStatus;
  detailEn: string;
  detailVi: string;
  blocking?: boolean;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"]);

function valueFor(key: string): string {
  return process.env[key]?.trim() ?? "";
}

function validUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function validateValue(key: string, value: string): boolean {
  if (!value) return false;
  if (["DATABASE_URL"].includes(key)) return /^postgres(?:ql)?:\/\//u.test(value);
  if (
    [
      "SUPABASE_URL",
      "VITE_SUPABASE_URL",
      "APP_ORIGIN",
      "WA_QR_WORKER_URL",
      "PMAI_WEBHOOK_URL",
      "E2E_BASE_URL",
    ].includes(key)
  ) {
    return validUrl(value);
  }
  if (
    [
      "SESSION_SECRET",
      "INTERNAL_CRON_TOKEN",
      "WEBHOOK_DISPATCH_SECRET",
      "WIDGET_SIGNING_SECRET",
      "APP_USER_CONNECTION_KEY_SECRET",
      "WA_QR_WORKER_TOKEN",
      "WA_QR_WORKER_SIGNING_SECRET",
      "WA_QR_WEBHOOK_SECRET",
    ].includes(key)
  ) {
    return value.length >= 32;
  }
  if (key === "SETUP_SECRET") return value.length >= 24;
  if (key === "AI_CREDENTIAL_ENCRYPTION_KEY") {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  }
  if (["PORT", "PASSENGER_PORT", "APP_REPLICAS"].includes(key)) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 && (key === "APP_REPLICAS" || number <= 65535);
  }
  if (key === "PADDLE_ENV") return value === "sandbox" || value === "live";
  return true;
}

function variableCheck(variable: EnvironmentVariableMetadata): EnvironmentVariableCheck {
  const value = valueFor(variable.key);
  return {
    key: variable.key,
    requiredness: variable.requiredness,
    scope: variable.scope,
    secret: variable.secret,
    setupBlocking: variable.setupBlocking,
    coolify: variable.coolify,
    configured: value.length > 0,
    valid: value.length > 0 && validateValue(variable.key, value),
  };
}

function result(
  status: EnvironmentStatus,
  detailEn: string,
  detailVi: string,
  blocking = false,
): OperationalResult {
  return { status, detailEn, detailVi, blocking };
}

async function probe(admin: SupabaseClient): Promise<Map<string, OperationalResult>> {
  const checks = new Map<string, OperationalResult>();
  const coreTables = [
    "settings",
    "user_roles",
    "profiles",
    "organizations",
    "organization_members",
    "workspaces",
    "workspace_members",
  ];
  let schemaReady = true;
  let schemaFailure = "";

  for (const table of coreTables) {
    const { error } = await admin.from(table).select("*", { head: true, count: "exact" }).limit(1);
    if (error) {
      schemaReady = false;
      schemaFailure = table;
      break;
    }
  }
  checks.set(
    "database",
    schemaReady
      ? result(
          "READY",
          "Database connection and current core schema are ready.",
          "Kết nối cơ sở dữ liệu và schema cốt lõi hiện tại đã sẵn sàng.",
          true,
        )
      : result(
          "NEEDS_ATTENTION",
          `Core schema check failed at ${schemaFailure}.`,
          `Kiểm tra schema cốt lõi thất bại tại ${schemaFailure}.`,
          true,
        ),
  );

  const auth = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  checks.set(
    "supabase",
    auth.error
      ? result(
          "NEEDS_ATTENTION",
          "Supabase authentication administration is unavailable.",
          "Quản trị xác thực Supabase không khả dụng.",
          true,
        )
      : result(
          "READY",
          "Supabase Data API and authentication administration are reachable.",
          "Data API và quản trị xác thực Supabase có thể truy cập.",
          true,
        ),
  );

  const storage = await admin.storage.listBuckets();
  checks.set(
    "storage",
    storage.error
      ? result(
          "NEEDS_ATTENTION",
          "Storage service is unavailable.",
          "Dịch vụ lưu trữ không khả dụng.",
          true,
        )
      : result(
          "READY",
          `Storage is reachable with ${storage.data.length} private bucket definition(s).`,
          `Dịch vụ lưu trữ có thể truy cập với ${storage.data.length} định nghĩa bucket riêng tư.`,
          true,
        ),
  );

  checks.set(
    "tenant-provisioning",
    schemaReady
      ? result(
          "READY",
          "Organization, workspace, membership and RLS-owned tables are available.",
          "Các bảng Tổ chức, Không gian làm việc, thành viên và sở hữu RLS đã sẵn sàng.",
          true,
        )
      : result(
          "NEEDS_ATTENTION",
          "Tenant provisioning tables are incomplete.",
          "Các bảng khởi tạo tenant chưa đầy đủ.",
          true,
        ),
  );

  checks.set(
    "realtime",
    schemaReady && !auth.error
      ? result(
          "READY",
          "Realtime is provided by the same reachable Supabase stack; setup does not open a separate WebSocket.",
          "Realtime đi cùng stack Supabase đang truy cập được; setup không mở WebSocket riêng.",
          true,
        )
      : result(
          "NEEDS_ATTENTION",
          "Realtime cannot be assumed until the Supabase Data API and Auth administration are reachable.",
          "Chưa thể coi Realtime sẵn sàng khi Data API và quản trị Auth Supabase chưa truy cập được.",
          true,
        ),
  );
  checks.set(
    "api-webhooks",
    result(
      "READY",
      "API, webhook and health routes are present in the current route tree.",
      "Các route API, webhook và health hiện diện trong route tree hiện tại.",
    ),
  );
  checks.set(
    "plugins",
    result(
      "READY",
      "Provider registry, API keys and plugin management are available after setup.",
      "Danh mục nhà cung cấp, API key và quản lý plugin sẵn sàng sau thiết lập.",
    ),
  );
  checks.set(
    "integration-marketplace",
    result(
      "OPTIONAL",
      "Connections are configured per workspace after setup, not through first-run environment variables.",
      "Các kết nối được cấu hình theo Không gian làm việc sau thiết lập, không qua biến môi trường lần chạy đầu.",
    ),
  );

  const nodeEnv = valueFor("NODE_ENV") || "development";
  const appOrigin = valueFor("APP_ORIGIN");
  const publicSupabase = valueFor("VITE_SUPABASE_URL");
  if (nodeEnv !== "production") {
    checks.set(
      "deployment",
      result(
        "DEVELOPMENT_ONLY",
        "This process is running in development mode. Do not copy local values to Coolify.",
        "Tiến trình đang chạy ở chế độ phát triển. Không sao chép giá trị local sang Coolify.",
      ),
    );
  } else {
    const localProductionValue = [appOrigin, publicSupabase].some((raw) => {
      if (!validUrl(raw)) return false;
      return LOCAL_HOSTS.has(new URL(raw).hostname);
    });
    checks.set(
      "deployment",
      localProductionValue || !appOrigin.startsWith("https://")
        ? result(
            "NEEDS_ATTENTION",
            "Production contains a localhost value or non-HTTPS application origin.",
            "Production chứa giá trị localhost hoặc origin ứng dụng không dùng HTTPS.",
          )
        : result(
            "READY",
            "Production origin and public backend URL are non-local and HTTPS-ready.",
            "Origin production và URL backend public không phải local và sẵn sàng HTTPS.",
          ),
    );
  }

  const list = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const knownPersistentFixture = list.data?.users.some((user) => {
    const email = user.email?.toLowerCase() ?? "";
    return (
      email.endsWith("@local.test") ||
      email.endsWith("@example.test") ||
      /^fixture-[^@]+@example\.invalid$/u.test(email)
    );
  });
  checks.set(
    "local-development",
    knownPersistentFixture
      ? result(
          "NEEDS_ATTENTION",
          "A legacy persistent local smoke account still exists; reset local state before setup.",
          "Vẫn còn tài khoản smoke local cố định kế thừa; hãy reset local trước khi thiết lập.",
        )
      : result(
          "DEVELOPMENT_ONLY",
          "Local runtime detected with no known persistent demo/smoke account. Do not copy local values to Coolify.",
          "Đã phát hiện môi trường local và không có tài khoản demo/smoke cố định đã biết. Không sao chép giá trị local sang Coolify.",
        ),
  );
  checks.set(
    "test-harness",
    result(
      "DEVELOPMENT_ONLY",
      "The RLS harness is disabled unless its dedicated CI secret is supplied.",
      "Bộ kiểm thử RLS bị tắt trừ khi cung cấp secret CI riêng.",
    ),
  );
  checks.set(
    "ci",
    result(
      "DEVELOPMENT_ONLY",
      "CI variables are engineering-only and are not production configuration.",
      "Biến CI chỉ dùng cho kỹ thuật và không phải cấu hình production.",
    ),
  );

  return checks;
}

function capabilityStatus(
  capability: EnvironmentCapabilityMetadata,
  environment: EnvironmentVariableCheck[],
  operational: OperationalResult | undefined,
): OperationalResult {
  const blockingMissing = environment.some(
    (item) => item.setupBlocking === "YES" && !item.configured,
  );
  const blockingInvalid = environment.some(
    (item) => item.setupBlocking === "YES" && item.configured && !item.valid,
  );
  if (blockingInvalid)
    return result(
      "INVALID",
      "A required value is configured but invalid.",
      "Một giá trị bắt buộc đã cấu hình nhưng không hợp lệ.",
      true,
    );
  if (blockingMissing)
    return result(
      "NEEDS_ATTENTION",
      "A required environment value is missing.",
      "Thiếu một biến môi trường bắt buộc.",
      true,
    );

  if (operational) return operational;

  if (capability.category === "local") {
    return result(
      "DEVELOPMENT_ONLY",
      "Development/CI only — do not copy to Coolify.",
      "Chỉ dùng cho phát triển/CI — không sao chép sang Coolify.",
    );
  }

  const configured = environment.filter((item) => item.configured);
  const invalid = configured.some((item) => !item.valid);
  if (invalid)
    return result(
      "INVALID",
      "One or more configured values are invalid.",
      "Một hoặc nhiều giá trị đã cấu hình không hợp lệ.",
    );
  if (capability.category === "integration") {
    if (environment.length === 0)
      return result(
        "OPTIONAL",
        "Available for workspace configuration after setup.",
        "Có thể cấu hình theo Không gian làm việc sau thiết lập.",
      );
    if (configured.length === 0)
      return result(
        "NOT_CONFIGURED",
        "Supported by the current codebase but not configured. Core setup is unaffected.",
        "Mã nguồn hiện tại có hỗ trợ nhưng chưa cấu hình. Thiết lập cốt lõi không bị ảnh hưởng.",
      );
    return result(
      "READY",
      "At least one environment-backed path is configured; complete account setup later in Settings.",
      "Ít nhất một đường dẫn dựa trên biến môi trường đã cấu hình; hoàn tất tài khoản sau trong Cài đặt.",
    );
  }

  if (environment.length > 0 && configured.length === 0) {
    return result(
      "OPTIONAL",
      "No optional environment values are configured.",
      "Chưa cấu hình biến môi trường tùy chọn.",
    );
  }
  return result("READY", "Configuration metadata is ready.", "Metadata cấu hình đã sẵn sàng.");
}

export async function buildEnvironmentReadiness(
  admin: SupabaseClient,
): Promise<EnvironmentReadinessReport> {
  const operational = await probe(admin);
  const categories: EnvironmentReadinessReport["categories"] = {
    core: [],
    platform: [],
    integration: [],
    deployment: [],
    local: [],
  };
  const blockingFailures: string[] = [];

  for (const capability of ENVIRONMENT_CAPABILITIES) {
    const environment = ENVIRONMENT_VARIABLES.filter(
      (item) => item.capability === capability.id,
    ).map(variableCheck);
    const state = capabilityStatus(capability, environment, operational.get(capability.id));
    if (state.blocking && state.status !== "READY") blockingFailures.push(capability.id);
    categories[capability.category].push({
      ...capability,
      status: state.status,
      detailEn: state.detailEn,
      detailVi: state.detailVi,
      environment,
    });
  }

  const all = Object.values(categories).flat();
  return {
    ready: blockingFailures.length === 0,
    summary: {
      ready: all.filter((item) => item.status === "READY").length,
      needsAttention: all.filter((item) =>
        ["NEEDS_ATTENTION", "INVALID", "UNAVAILABLE"].includes(item.status),
      ).length,
      notConfigured: all.filter((item) => ["NOT_CONFIGURED", "OPTIONAL"].includes(item.status))
        .length,
      developmentOnly: all.filter((item) => item.status === "DEVELOPMENT_ONLY").length,
    },
    categories,
    checkedAt: new Date().toISOString(),
  };
}
