export type LlmFailureKind =
  | "timeout"
  | "rate_limit"
  | "network"
  | "auth"
  | "server"
  | "invalid_json"
  | "schema_parse"
  | "unknown";

export const RETRYABLE_FAILURES: LlmFailureKind[] = [
  "timeout",
  "rate_limit",
  "network",
  "server",
  "unknown",
];

export function classifyLlmError(error: any): LlmFailureKind {
  const message = String(error?.message || error || "").toLowerCase();
  const status = Number(
    error?.status || error?.response?.status || error?.code || 0,
  );

  if (
    status === 401 ||
    status === 403 ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  ) {
    return "auth";
  }

  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  ) {
    return "rate_limit";
  }

  if (status >= 500) return "server";

  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted")
  ) {
    return "timeout";
  }

  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("socket")
  ) {
    return "network";
  }

  if (message.includes("json")) return "invalid_json";
  if (message.includes("zod") || message.includes("validation")) {
    return "schema_parse";
  }

  return "unknown";
}
