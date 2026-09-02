/**
 * AI log privacy — honor ai_settings.log_prompts / log_responses and
 * never persist credential-shaped values.
 */

const CREDENTIAL_RE = [
  /sk-[A-Za-z0-9]{8,}/g,
  /AIza[A-Za-z0-9_-]{10,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /api[_-]?key["'\s:=]+[A-Za-z0-9._~+/=-]{8,}/gi,
];

export function stripCredentialShapes(value: string): string {
  let out = value;
  for (const re of CREDENTIAL_RE) out = out.replace(re, "[redacted]");
  return out;
}

function scrub(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "string") return stripCredentialShapes(value);
  try {
    return JSON.parse(stripCredentialShapes(JSON.stringify(value)));
  } catch {
    return "[unserializable]";
  }
}

export function selectAiLogPreviews(opts: {
  logPrompts: boolean;
  logResponses: boolean;
  requestPreview?: unknown;
  responsePreview?: unknown;
}): { requestPreview: unknown | null; responsePreview: unknown | null } {
  return {
    requestPreview: opts.logPrompts ? scrub(opts.requestPreview) : null,
    responsePreview: opts.logPrompts && opts.logResponses ? scrub(opts.responsePreview) : null,
  };
}
