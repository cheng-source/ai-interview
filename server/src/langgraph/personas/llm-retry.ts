import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions } from "./persona-types";
import { classifyLlmError, RETRYABLE_FAILURES } from "./llm-errors";
import { emitPersonaWarning } from "./persona-warning";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function invokeWithRetry<T>(
  persona: PersonaDefinition,
  options: PersonaExecuteOptions | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? 2;
  let lastError: any;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const kind = classifyLlmError(error);
      const canRetry =
        RETRYABLE_FAILURES.includes(kind) && attempt < maxRetries;

      if (!canRetry) throw error;

      emitPersonaWarning(
        persona,
        "LLM_RETRY",
        `模型调用失败，正在进行第 ${attempt + 1} 次重试`,
        options,
        attempt + 1,
      );
      await sleep(500 * Math.pow(2, attempt));
    }
  }

  throw lastError;
}
