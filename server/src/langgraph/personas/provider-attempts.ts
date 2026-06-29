import { getEnabledChatProviderIds } from "../llm";
import type { PersonaExecuteOptions } from "./persona-types";

export function resolveProviderAttempts(
  options?: PersonaExecuteOptions,
): Array<string | undefined> {
  // Provider priority:
  // 1. If the caller pins providerId/fallbackProviderIds, try only that explicit chain.
  // 2. Otherwise, try every enabled runtime provider in configured order.
  // 3. If no runtime snapshot exists, return undefined so createLLM falls back to env config.
  const explicit = [
    options?.providerId,
    ...(options?.fallbackProviderIds || []),
  ].filter(Boolean) as string[];
  if (explicit.length) return [...new Set(explicit)];

  const enabled = getEnabledChatProviderIds();
  return enabled.length ? enabled : [undefined];
}
