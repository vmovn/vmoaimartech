export type AIErrorType =
  | "auth"           // 401/403 — bad key
  | "rate_limit"     // 429
  | "timeout"
  | "network"
  | "validation"     // 400 — bad request body
  | "context_length" // input too large
  | "not_found"      // model or endpoint missing
  | "quota"          // Premium Credits / user cap exhausted
  | "configuration"  // operator-owned AI/billing configuration unavailable
  | "server"         // 5xx upstream
  | "cancelled"
  | "unknown";

export class AIError extends Error {
  readonly type: AIErrorType;
  readonly httpStatus?: number;
  readonly providerKind?: string;
  readonly retryable: boolean;

  constructor(
    type: AIErrorType,
    message: string,
    opts: { httpStatus?: number; providerKind?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = "AIError";
    this.type = type;
    this.httpStatus = opts.httpStatus;
    this.providerKind = opts.providerKind;
    this.retryable = opts.retryable ?? (type === "rate_limit" || type === "timeout" || type === "network" || type === "server");
  }
}

export class AICreditsError extends AIError {
  readonly code: string;

  constructor(type: "quota" | "configuration", code: string, message: string) {
    super(type, message, { retryable: false });
    this.name = "AICreditsError";
    this.code = code;
  }
}

export function classifyHttpError(status: number, body?: string): AIErrorType {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status === 408) return "timeout";
  if (status === 413 || (body && /context.*length|too many tokens/i.test(body))) return "context_length";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "server";
  if (status >= 400) return "validation";
  return "unknown";
}
