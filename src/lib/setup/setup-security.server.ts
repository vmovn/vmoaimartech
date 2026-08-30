import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { deleteCookie, getCookie, getRequest, setCookie } from "@tanstack/react-start/server";

const SETUP_COOKIE = "product_setup_session";
const SETUP_SESSION_SECONDS = 30 * 60;
export const MIN_SETUP_SECRET_LENGTH = 24;

export function getConfiguredSetupSecret(): string | null {
  const value = process.env.SETUP_SECRET?.trim() ?? "";
  return value.length >= MIN_SETUP_SECRET_LENGTH ? value : null;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function matchesSetupSecret(candidate: string, expected: string): boolean {
  return timingSafeEqual(digest(candidate), digest(expected));
}

function signature(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

function setupCookieOptions() {
  const request = getRequest();
  const secure = new URL(request.url).protocol === "https:";
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: SETUP_SESSION_SECONDS,
  };
}

export function issueSetupSession(secret: string): void {
  const payload = Buffer.from(
    JSON.stringify({ exp: Date.now() + SETUP_SESSION_SECONDS * 1000, nonce: randomUUID() }),
    "utf8",
  ).toString("base64url");
  setCookie(SETUP_COOKIE, `${payload}.${signature(payload, secret)}`, setupCookieOptions());
}

export function hasValidSetupSession(secret: string): boolean {
  const raw = getCookie(SETUP_COOKIE);
  if (!raw) return false;
  const [payload, suppliedSignature, extra] = raw.split(".");
  if (!payload || !suppliedSignature || extra) return false;

  const expectedSignature = signature(payload, secret);
  const supplied = Buffer.from(suppliedSignature, "utf8");
  const expected = Buffer.from(expectedSignature, "utf8");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof decoded.exp === "number" && decoded.exp > Date.now();
  } catch {
    return false;
  }
}

export function clearSetupSession(): void {
  deleteCookie(SETUP_COOKIE, { path: "/" });
}

export function setupRequestFingerprint(): string {
  const request = getRequest();
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const address = forwarded || request.headers.get("x-real-ip") || "unknown";
  const agent = request.headers.get("user-agent") ?? "unknown";
  return createHash("sha256").update(`${address}|${agent}`, "utf8").digest("hex");
}
