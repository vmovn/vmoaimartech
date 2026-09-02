import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CheckCircle2,
  KeyRound,
  Rocket,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  authorizeSetup,
  completeSetup,
  createSetupSuperAdmin,
  getSetupStatus,
  saveSetupBusiness,
  validateSetupEnvironment,
  type SetupEnvironmentReport,
} from "@/lib/setup/setup.functions";
import type { CapabilityReadiness } from "@/lib/setup/environment-readiness.server";
import {
  INTEGRATIONS_ENV_FILE,
  LAUNCH_KEY_CHECKLIST,
  PRODUCTION_ORIGIN,
  getLaunchGuidance,
  type LaunchPriority,
} from "@/lib/setup/launch-guidance";
import { BRAND_NAME } from "@/lib/branding/brand";

export const Route = createFileRoute("/setup")({
  head: () => ({
    meta: [
      { title: "Product Setup" },
      { name: "description", content: "Secure first-run Product initialization." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  beforeLoad: async () => {
    const status = await getSetupStatus();
    if (status.setupComplete) throw redirect({ to: "/auth" });
  },
  component: ProductSetup,
});

type Step = "system" | "owner" | "business" | "finish";
type SetupDraft = {
  owner: { fullName: string; email: string };
  business: {
    businessName: string;
    workspaceName: string;
    appName: string;
    language: string;
    timezone: string;
    currency: string;
    dateFormat: string;
  };
};

const STEPS: Array<{ key: Step; labelEn: string; labelVi: string }> = [
  { key: "system", labelEn: "System", labelVi: "Hệ thống" },
  { key: "owner", labelEn: "Owner", labelVi: "Chủ sở hữu" },
  { key: "business", labelEn: "Business", labelVi: "Doanh nghiệp" },
  { key: "finish", labelEn: "Review & Finish", labelVi: "Xác nhận & Hoàn tất" },
];

const CATEGORY_LABELS: Record<
  keyof SetupEnvironmentReport["categories"],
  { en: string; vi: string }
> = {
  core: { en: "Core Runtime", vi: "Hệ thống cốt lõi" },
  platform: { en: "Platform Services", vi: "Dịch vụ nền tảng" },
  integration: { en: "Current Integrations", vi: "Tích hợp hiện có" },
  deployment: { en: "Deployment Readiness", vi: "Sẵn sàng triển khai" },
  local: { en: "Local Development", vi: "Phát triển local" },
};

const TIMEZONES = [
  { value: "Asia/Ho_Chi_Minh", label: "Asia/Ho_Chi_Minh (Giờ Việt Nam, GMT+7)" },
  { value: "UTC", label: "UTC" },
  { value: "Asia/Singapore", label: "Asia/Singapore" },
  { value: "Asia/Tokyo", label: "Asia/Tokyo" },
  { value: "Europe/London", label: "Europe/London" },
  { value: "America/New_York", label: "America/New_York" },
];
const CURRENCIES = [
  { value: "VND", label: "VND — Đồng Việt Nam" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
  { value: "GBP", label: "GBP" },
  { value: "SGD", label: "SGD" },
  { value: "JPY", label: "JPY" },
  { value: "AUD", label: "AUD" },
  { value: "CAD", label: "CAD" },
];
const LANGUAGES = [
  { code: "vi", label: "Tiếng Việt" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
];
const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY (ngày/tháng/năm — Việt Nam)" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD (ISO)" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY (tháng/ngày/năm)" },
] as const;

function SecretGate() {
  const queryClient = useQueryClient();
  const authorize = useServerFn(authorizeSetup);
  const [secret, setSecret] = useState("");
  const mutation = useMutation({
    mutationFn: () => authorize({ data: { secret } }),
    onSuccess: async () => {
      setSecret("");
      await queryClient.invalidateQueries({ queryKey: ["product-setup-status"] });
    },
  });

  return (
    <SetupShell progress={0}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" /> Secure Setup / Thiết lập bảo mật
          </CardTitle>
          <CardDescription>
            Enter the Setup Secret configured by the deployment operator. / Nhập Setup Secret do
            người vận hành triển khai cấu hình.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Field label="Setup Secret">
            <Input
              id="setup-secret"
              type="password"
              autoComplete="off"
              value={secret}
              onChange={(event) => setSecret(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && secret) mutation.mutate();
              }}
            />
          </Field>
          <Button
            className="w-full"
            disabled={!secret || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending
              ? "Verifying… / Đang xác minh…"
              : "Unlock setup / Mở khóa thiết lập"}
          </Button>
          {mutation.isError && (
            <p className="text-sm text-destructive">{(mutation.error as Error).message}</p>
          )}
          <p className="text-xs text-muted-foreground">
            The secret is checked only on the server and is never stored in browser-accessible
            state.
          </p>
        </CardContent>
      </Card>
    </SetupShell>
  );
}

function ProductSetup() {
  const statusFn = useServerFn(getSetupStatus);
  const status = useQuery({ queryKey: ["product-setup-status"], queryFn: () => statusFn() });
  if (status.isLoading)
    return (
      <SetupShell progress={0}>
        <p className="text-sm text-muted-foreground">
          Checking setup state… / Đang kiểm tra trạng thái…
        </p>
      </SetupShell>
    );
  if (status.isError)
    return (
      <SetupShell progress={0}>
        <p className="text-sm text-destructive">{(status.error as Error).message}</p>
      </SetupShell>
    );
  if (!status.data?.setupSecretConfigured) {
    return (
      <SetupShell progress={0}>
        <p className="text-sm text-destructive">
          SETUP_SECRET is missing or shorter than 24 characters on the server.
        </p>
      </SetupShell>
    );
  }
  if (!status.data.authorized) return <SecretGate />;
  return (
    <SetupWizard
      initialSuperAdmin={status.data.superAdminExists}
      draft={status.data.draft as SetupDraft | null}
    />
  );
}

function SetupWizard({
  initialSuperAdmin,
  draft,
}: {
  initialSuperAdmin: boolean;
  draft: SetupDraft | null;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [stepIndex, setStepIndex] = useState(0);
  const step = STEPS[stepIndex].key;
  const environmentFn = useServerFn(validateSetupEnvironment);
  const createOwnerFn = useServerFn(createSetupSuperAdmin);
  const businessFn = useServerFn(saveSetupBusiness);
  const finishFn = useServerFn(completeSetup);
  const environment = useQuery({
    queryKey: ["product-setup-environment"],
    queryFn: () => environmentFn(),
    enabled: step === "system" || step === "finish",
  });

  const [fullName, setFullName] = useState(draft?.owner.fullName ?? "");
  const [email, setEmail] = useState(draft?.owner.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [ownerReady, setOwnerReady] = useState(initialSuperAdmin);
  const strongPassword = useMemo(
    () =>
      password.length >= 12 &&
      /[a-z]/.test(password) &&
      /[A-Z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password),
    [password],
  );
  const owner = useMutation({
    mutationFn: () => createOwnerFn({ data: { full_name: fullName, email, password } }),
    onSuccess: async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(`Platform Owner created, but sign-in failed: ${error.message}`);
      setPassword("");
      setConfirmPassword("");
      setOwnerReady(true);
      await queryClient.invalidateQueries({ queryKey: ["product-setup-status"] });
    },
  });

  const [businessName, setBusinessName] = useState(draft?.business.businessName ?? "");
  const [workspaceName, setWorkspaceName] = useState(draft?.business.workspaceName ?? "");
  const [appName, setAppName] = useState(draft?.business.appName || BRAND_NAME);
  const [language, setLanguage] = useState(draft?.business.language || "vi");
  const [timezone, setTimezone] = useState(draft?.business.timezone || "Asia/Ho_Chi_Minh");
  const [currency, setCurrency] = useState(draft?.business.currency || "VND");
  const [dateFormat, setDateFormat] = useState<"MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD">(
    (draft?.business.dateFormat as "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD") || "DD/MM/YYYY",
  );
  const [businessReady, setBusinessReady] = useState(
    Boolean(
      draft?.business.businessName &&
      draft.business.workspaceName &&
      draft.business.appName &&
      draft.business.language &&
      draft.business.timezone &&
      draft.business.currency &&
      draft.business.dateFormat,
    ),
  );
  const business = useMutation({
    mutationFn: () =>
      businessFn({
        data: {
          business_name: businessName,
          workspace_name: workspaceName || businessName,
          app_name: appName,
          language,
          timezone,
          currency,
          date_format: dateFormat,
        },
      }),
    onSuccess: async () => {
      setBusinessReady(true);
      await queryClient.invalidateQueries({ queryKey: ["product-setup-status"] });
    },
  });

  const finish = useMutation({
    mutationFn: () => finishFn(),
    onSuccess: () => navigate({ to: "/dashboard" as string as never }),
  });

  const canContinue =
    (step === "system" && environment.data?.ready === true) ||
    (step === "owner" && ownerReady) ||
    (step === "business" && businessReady);

  return (
    <SetupShell progress={((stepIndex + 1) / STEPS.length) * 100} labels={STEPS} active={stepIndex}>
      <Card>
        {step === "system" && (
          <SystemStep
            report={environment.data}
            loading={environment.isLoading}
            error={environment.error as Error | null}
          />
        )}

        {step === "owner" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="h-5 w-5" /> Owner / Chủ sở hữu
              </CardTitle>
              <CardDescription>
                Create the one initial platform owner. No extra profile fields are required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {ownerReady ? (
                <div className="rounded-lg border p-4">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Platform Owner is ready /
                    Chủ sở hữu nền tảng đã sẵn sàng
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {fullName || draft?.owner.fullName} · {email || draft?.owner.email}
                  </p>
                </div>
              ) : (
                <>
                  <Field label="Full name / Họ và tên">
                    <Input
                      value={fullName}
                      autoComplete="name"
                      onChange={(event) => setFullName(event.target.value)}
                    />
                  </Field>
                  <Field label="Email">
                    <Input
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(event) => setEmail(event.target.value)}
                    />
                  </Field>
                  <Field label="Password / Mật khẩu">
                    <Input
                      type="password"
                      value={password}
                      autoComplete="new-password"
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </Field>
                  <Field label="Confirm password / Xác nhận mật khẩu">
                    <Input
                      type="password"
                      value={confirmPassword}
                      autoComplete="new-password"
                      onChange={(event) => setConfirmPassword(event.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    At least 12 characters with uppercase, lowercase, number and symbol. / Ít nhất
                    12 ký tự gồm chữ hoa, chữ thường, số và ký hiệu.
                  </p>
                  <Button
                    disabled={
                      owner.isPending ||
                      !fullName ||
                      !email ||
                      !strongPassword ||
                      password !== confirmPassword
                    }
                    onClick={() => owner.mutate()}
                  >
                    {owner.isPending
                      ? "Creating… / Đang tạo…"
                      : "Create Platform Owner / Tạo Chủ sở hữu"}
                  </Button>
                  {owner.isError && (
                    <p className="text-sm text-destructive">{(owner.error as Error).message}</p>
                  )}
                </>
              )}
            </CardContent>
          </>
        )}

        {step === "business" && (
          <>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" /> Business / Doanh nghiệp
              </CardTitle>
              <CardDescription>
                Mặc định thị trường Việt Nam: tiếng Việt, GMT+7, VND, ngày/tháng/năm. / Vietnam-first
                defaults: Vietnamese, GMT+7, VND, day/month/year.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Field label="Business / Organization name · Tên doanh nghiệp / Tổ chức">
                  <Input
                    value={businessName}
                    maxLength={120}
                    onChange={(event) => {
                      const next = event.target.value;
                      if (!workspaceName || workspaceName === businessName) setWorkspaceName(next);
                      setBusinessName(next);
                      setBusinessReady(false);
                    }}
                  />
                </Field>
              </div>
              <Field label="Workspace name / Tên Không gian làm việc">
                <Input
                  value={workspaceName}
                  maxLength={120}
                  placeholder={businessName || "Default workspace"}
                  onChange={(event) => {
                    setWorkspaceName(event.target.value);
                    setBusinessReady(false);
                  }}
                />
              </Field>
              <Field label="Product display name / Tên hiển thị sản phẩm">
                <Input
                  value={appName}
                  maxLength={80}
                  onChange={(event) => {
                    setAppName(event.target.value);
                    setBusinessReady(false);
                  }}
                />
              </Field>
              <SelectField
                label="Default language / Ngôn ngữ mặc định"
                value={language}
                onChange={(value) => {
                  setLanguage(value);
                  setBusinessReady(false);
                }}
                options={LANGUAGES.map((item) => ({ value: item.code, label: item.label }))}
              />
              <SelectField
                label="Timezone / Múi giờ"
                value={timezone}
                onChange={(value) => {
                  setTimezone(value);
                  setBusinessReady(false);
                }}
                options={TIMEZONES.map((item) => ({ value: item.value, label: item.label }))}
              />
              <SelectField
                label="Currency / Tiền tệ"
                value={currency}
                onChange={(value) => {
                  setCurrency(value);
                  setBusinessReady(false);
                }}
                options={CURRENCIES.map((item) => ({ value: item.value, label: item.label }))}
              />
              <SelectField
                label="Date format / Định dạng ngày"
                value={dateFormat}
                onChange={(value) => {
                  setDateFormat(value as typeof dateFormat);
                  setBusinessReady(false);
                }}
                options={DATE_FORMATS.map((item) => ({ value: item.value, label: item.label }))}
              />
              <div className="sm:col-span-2">
                <Button
                  disabled={business.isPending || !businessName.trim() || !appName.trim()}
                  onClick={() => business.mutate()}
                >
                  {business.isPending
                    ? "Saving… / Đang lưu…"
                    : businessReady
                      ? "Business saved / Đã lưu doanh nghiệp"
                      : "Save business / Lưu doanh nghiệp"}
                </Button>
              </div>
              {business.isError && (
                <p className="text-sm text-destructive sm:col-span-2">
                  {(business.error as Error).message}
                </p>
              )}
            </CardContent>
          </>
        )}

        {step === "finish" && (
          <>
            <CardHeader>
              <CardTitle>Review & Finish / Xác nhận & Hoàn tất</CardTitle>
              <CardDescription>
                Review the essentials. Passwords and secret values are never shown.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ReviewSection title="System / Hệ thống">
                <ReviewRow
                  label="Hệ thống cốt lõi"
                  value={
                    environment.data?.ready ? "SẴN SÀNG / READY" : "CẦN XỬ LÝ / NEEDS ATTENTION"
                  }
                />
                <ReviewRow
                  label="Tích hợp đã cấu hình (Gemini/Telegram/Meta…)"
                  value={String(
                    environment.data?.categories.integration.filter(
                      (item) => item.status === "READY",
                    ).length ?? 0,
                  )}
                />
                <ReviewRow
                  label="Tích hợp chưa cấu hình (đúng nếu chưa có key)"
                  value={String(
                    environment.data?.categories.integration.filter((item) =>
                      ["NOT_CONFIGURED", "OPTIONAL"].includes(item.status),
                    ).length ?? 0,
                  )}
                />
              </ReviewSection>
              <ReviewSection title="Owner / Chủ sở hữu">
                <ReviewRow
                  label={fullName || draft?.owner.fullName || "Platform Owner"}
                  value={email || draft?.owner.email || "Created"}
                />
              </ReviewSection>
              <ReviewSection title="Business / Doanh nghiệp">
                <ReviewRow
                  label="Organization / Tổ chức"
                  value={businessName || draft?.business.businessName || "—"}
                />
                <ReviewRow
                  label="Workspace / Không gian làm việc"
                  value={workspaceName || businessName || draft?.business.workspaceName || "—"}
                />
                <ReviewRow label="Product" value={appName} />
                <ReviewRow
                  label="Locale"
                  value={`${language} · ${timezone} · ${currency} · ${dateFormat}`}
                />
              </ReviewSection>
              <Button
                className="w-full"
                size="lg"
                disabled={
                  finish.isPending ||
                  environment.data?.ready !== true ||
                  !ownerReady ||
                  !businessReady
                }
                onClick={() => finish.mutate()}
              >
                {finish.isPending
                  ? "Finalizing… / Đang hoàn tất…"
                  : "Finish setup / Hoàn tất thiết lập"}
              </Button>
              {finish.isError && (
                <p className="text-sm text-destructive">{(finish.error as Error).message}</p>
              )}
            </CardContent>
          </>
        )}
      </Card>

      <div className="mt-6 flex justify-between">
        <Button
          variant="outline"
          disabled={stepIndex === 0 || finish.isPending}
          onClick={() => setStepIndex((value) => Math.max(0, value - 1))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back / Quay lại
        </Button>
        {step !== "finish" && (
          <Button
            disabled={!canContinue}
            onClick={() => setStepIndex((value) => Math.min(STEPS.length - 1, value + 1))}
          >
            Next / Tiếp tục <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </SetupShell>
  );
}

function SystemStep({
  report,
  loading,
  error,
}: {
  report?: SetupEnvironmentReport;
  loading: boolean;
  error: Error | null;
}) {
  return (
    <>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> System / Hệ thống
        </CardTitle>
        <CardDescription>
          Hệ thống cốt lõi đã đủ thì được hoàn tất setup. Tích hợp tùy chọn không chặn lần chạy đầu.
          / Core runtime is enough to finish setup. Optional integrations never block first-run.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading && (
          <p className="text-sm text-muted-foreground">
            Đang kiểm tra mã nguồn và dịch vụ hiện tại… / Checking current code and services…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {report && (
          <>
            <div className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">
                  {report.ready
                    ? "Hệ thống cốt lõi đã sẵn sàng / Core runtime is ready"
                    : "Hệ thống cốt lõi cần xử lý / Core runtime needs attention"}
                </p>
                <p className="text-sm text-muted-foreground">
                  CHƯA CẤU HÌNH là trạng thái đúng cho tích hợp chưa có key — không phải lỗi cài đặt.
                </p>
              </div>
              <StatusBadge status={report.ready ? "READY" : "NEEDS_ATTENTION"} />
            </div>
            <LaunchPlaybook />
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <SummaryMetric label="Sẵn sàng / Ready" value={report.summary.ready} />
              <SummaryMetric label="Cần xử lý / Needs attention" value={report.summary.needsAttention} />
              <SummaryMetric label="Chưa cấu hình / Not configured" value={report.summary.notConfigured} />
              <SummaryMetric label="Chỉ local / Development only" value={report.summary.developmentOnly} />
            </div>
            <Accordion
              type="multiple"
              defaultValue={["core", "platform", "integration"]}
              className="rounded-lg border px-4"
            >
              {(
                Object.keys(CATEGORY_LABELS) as Array<keyof SetupEnvironmentReport["categories"]>
              ).map((category) => (
                <AccordionItem key={category} value={category}>
                  <AccordionTrigger>
                    <span>
                      {CATEGORY_LABELS[category].vi}{" "}
                      <span className="text-muted-foreground">
                        / {CATEGORY_LABELS[category].en}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-3">
                    {report.categories[category].map((capability) => (
                      <CapabilityCheck key={capability.id} capability={capability} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </>
        )}
      </CardContent>
    </>
  );
}

function LaunchPlaybook() {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <p className="font-medium">Hướng dẫn sẵn sàng cho {PRODUCTION_ORIGIN.replace("https://", "")}</p>
      <p className="text-sm text-muted-foreground">
        Mục tiêu lần này là cho platform chạy được với lựa chọn miễn phí/bền vững, định dạng Việt Nam.
        Không copy <code>.env.local</code> lên Coolify. Production:{" "}
        <code>APP_ORIGIN={PRODUCTION_ORIGIN}</code>, HTTPS.
      </p>
      <div className="space-y-2 text-sm">
        <p className="font-medium">Nên lấy key ngay (ghi vào {INTEGRATIONS_ENV_FILE} rồi chạy lại START-LOCAL):</p>
        <ul className="list-disc space-y-1 pl-5">
          {LAUNCH_KEY_CHECKLIST.map((item) => (
            <li key={item.key}>
              <code>{item.key}</code>
              <span className="text-muted-foreground"> — {item.whereVi}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-sm text-muted-foreground">
        Bỏ qua lần đầu: WhatsApp Cloud (phí Meta), Twilio SMS, Stripe/Paddle (không phải cổng VND).
        Zalo chưa có trong mã nguồn — không cấu hình giả. File {INTEGRATIONS_ENV_FILE} không bị RESET xóa.
      </p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: LaunchPriority }) {
  const label =
    priority === "required-core"
      ? "Bắt buộc"
      : priority === "recommended"
        ? "Nên lấy ngay"
        : priority === "skip-vn-first"
          ? "Bỏ qua lần đầu"
          : priority === "local-only"
            ? "Chỉ local"
            : "Sau khi chạy";
  return (
    <Badge variant="outline" className="w-fit whitespace-nowrap">
      {label}
    </Badge>
  );
}

function CapabilityCheck({ capability }: { capability: CapabilityReadiness }) {
  const guidance = getLaunchGuidance(capability.id);
  const recommended = new Set(guidance?.keys ?? []);
  const shownKeys =
    recommended.size > 0
      ? [
          ...capability.environment.filter((item) => recommended.has(item.key)),
          ...capability.environment.filter((item) => !recommended.has(item.key)),
        ]
      : capability.environment;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-medium">{capability.nameVi}</p>
          <p className="text-sm text-muted-foreground">{capability.nameEn}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {guidance && <PriorityBadge priority={guidance.priority} />}
          <StatusBadge status={capability.status} />
        </div>
      </div>
      <p className="mt-3 text-sm">{capability.descriptionVi}</p>
      <p className="mt-1 text-sm text-muted-foreground">{capability.descriptionEn}</p>
      <p className="mt-2 text-xs text-muted-foreground">{capability.detailVi}</p>
      {guidance && <p className="mt-2 text-sm">{guidance.howVi}</p>}
      {capability.features.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Khả năng: {capability.features.join(" · ")}
        </p>
      )}
      {shownKeys.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-2 text-xs font-medium">
            Tên biến môi trường / Environment variable names only
          </p>
          <div className="flex flex-wrap gap-2">
            {shownKeys.map((variable) => {
              const isRecommended = recommended.has(variable.key);
              return (
                <span
                  key={variable.key}
                  className="inline-flex items-center gap-1 rounded-control border px-2 py-1 text-xs"
                >
                  <code>{variable.key}</code>
                  {isRecommended && (
                    <span className="text-muted-foreground">nên lấy</span>
                  )}
                  {variable.configured && variable.valid ? (
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                  ) : variable.configured ? (
                    <XCircle className="h-3 w-3 text-destructive" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                  <span className="sr-only">
                    {variable.configured ? "Configured" : "Not configured"}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: CapabilityReadiness["status"] | "READY" | "NEEDS_ATTENTION";
}) {
  const variant =
    status === "NEEDS_ATTENTION" || status === "INVALID"
      ? "destructive"
      : status === "READY"
        ? "default"
        : "secondary";
  const labels: Record<string, string> = {
    READY: "SẴN SÀNG",
    NOT_CONFIGURED: "CHƯA CẤU HÌNH",
    OPTIONAL: "TÙY CHỌN",
    INVALID: "KHÔNG HỢP LỆ",
    UNAVAILABLE: "CHƯA ĐO ĐƯỢC",
    DEVELOPMENT_ONLY: "CHỈ LOCAL",
    NEEDS_ATTENTION: "CẦN XỬ LÝ",
  };
  return (
    <Badge variant={variant} className="w-fit whitespace-nowrap">
      {labels[status] ?? status.replaceAll("_", " ")}
    </Badge>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border">
      <h3 className="border-b px-4 py-3 font-medium">{title}</h3>
      <div className="divide-y">{children}</div>
    </section>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col justify-between gap-1 px-4 py-3 text-sm sm:flex-row">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function SetupShell({
  children,
  progress,
  labels,
  active,
}: {
  children: ReactNode;
  progress: number;
  labels?: typeof STEPS;
  active?: number;
}) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-background via-background to-muted/30">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary">
            <Rocket className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">
            First-run Setup / Thiết lập lần đầu
          </h1>
          <p className="text-muted-foreground">
            Chuẩn bị chủ sở hữu và Không gian làm việc đầu tiên theo mặc định Việt Nam.
          </p>
        </div>
        <Progress value={progress} className="mb-3" />
        {labels && (
          <div className="mb-6 hidden justify-between text-xs text-muted-foreground sm:flex">
            {labels.map((item, index) => (
              <span
                key={item.key}
                className={index === active ? "font-medium text-foreground" : ""}
              >
                {item.labelEn} / {item.labelVi}
              </span>
            ))}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}
