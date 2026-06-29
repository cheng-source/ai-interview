import { SystemMessage } from "@langchain/core/messages";
import { createLLM, setCallType, pushEvent } from "../llm";
import {
  ANTI_INJECTION_INSTRUCTION,
  sanitizeErrorMessage,
} from "../prompt-security";
import type { PersonaDefinition } from "./persona.interface";
import type { PersonaExecuteOptions, PersonaResult } from "./persona-types";
import { classifyLlmError } from "./llm-errors";
import { invokeWithRetry } from "./llm-retry";
import { isMockEnabled, mockExecutePersona } from "./mock-persona";
import { createPersonaFallback } from "./persona-fallback";
import { emitPersonaWarning } from "./persona-warning";
import { resolveProviderAttempts } from "./provider-attempts";
import {
  parseStructuredResponseStrict,
  repairStructuredJson,
  zodToJsonTemplate,
} from "./structured-output";

export type { PersonaExecuteOptions, PersonaResult } from "./persona-types";

async function invokePersonaOnce(
  persona: PersonaDefinition,
  userMessage: any,
  options: PersonaExecuteOptions | undefined,
  providerId: string | undefined,
  streaming: boolean,
): Promise<PersonaResult> {
  const llm = createLLM({
    providerId,
    temperature: persona.temperature,
    streaming,
  });

  if (persona.outputMode === "structured" && persona.schema) {
    const jsonTemplate = zodToJsonTemplate(persona.schema);
    const jsonPrompt = `${persona.systemPrompt}

${ANTI_INJECTION_INSTRUCTION}

只输出纯 JSON，不要用 markdown 代码块包裹。格式如下：
${jsonTemplate}`;
    const messages = [new SystemMessage(jsonPrompt), userMessage];
    const response = await invokeWithRetry(persona, options, () =>
      llm.invoke(messages),
    );
    const rawContent =
      typeof response.content === "string" ? response.content : "";

    try {
      return {
        response: parseStructuredResponseStrict(rawContent, persona.schema),
        content: "",
      };
    } catch {
      emitPersonaWarning(
        persona,
        "LLM_JSON_REPAIR",
        "模型返回格式异常，正在尝试修复 JSON",
        options,
      );
      try {
        const repaired = await repairStructuredJson(
          llm,
          rawContent,
          persona.schema,
          jsonTemplate,
        );
        return { response: repaired, content: "" };
      } catch {
        emitPersonaWarning(
          persona,
          "LLM_JSON_FALLBACK",
          "JSON 修复失败，已使用结构化兜底结果",
          options,
        );
        return createPersonaFallback(persona, options);
      }
    }
  }

  const messages = [
    new SystemMessage(
      `${persona.systemPrompt}

${ANTI_INJECTION_INSTRUCTION}`,
    ),
    userMessage,
  ];
  const response = await invokeWithRetry(persona, options, () =>
    llm.invoke(messages),
  );
  const content = typeof response.content === "string" ? response.content : "";

  if (!options?.silent) {
    if (streaming) {
      pushEvent({ type: "token_end" });
    } else if (persona.outputMode === "text" && content) {
      pushEvent({ type: "token", content });
      pushEvent({ type: "token_end" });
    }
  }

  return { response, content };
}

/** 统一执行 persona：创建 LLM → 配置流式/结构化 → invoke，并处理 retry/repair/fallback */
export async function executePersona(
  persona: PersonaDefinition,
  userMessage: any,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  if (isMockEnabled()) {
    return mockExecutePersona(persona, options);
  }

  if (!options?.silent) {
    pushEvent({ type: "status", content: persona.name });
  }

  const providerIds = resolveProviderAttempts(options);
  let lastError: any;

  for (const providerId of providerIds) {
    try {
      setCallType(persona.streaming ? "text" : "structured");
      return await invokePersonaOnce(
        persona,
        userMessage,
        options,
        providerId,
        persona.streaming,
      );
    } catch (error) {
      lastError = error;
      const kind = classifyLlmError(error);
      emitPersonaWarning(
        persona,
        "LLM_PROVIDER_FALLBACK",
        `当前模型供应商调用失败${providerId ? ` (${providerId})` : ""}，正在尝试备用方案`,
        options,
      );

      if (kind !== "auth" && providerIds.length <= 1) break;
    }
  }

  if (persona.outputMode === "text" && persona.streaming) {
    try {
      emitPersonaWarning(
        persona,
        "LLM_NON_STREAM_FALLBACK",
        "流式生成失败，正在切换为普通生成",
        options,
      );
      setCallType("structured");
      return await invokePersonaOnce(
        persona,
        userMessage,
        options,
        providerIds[0],
        false,
      );
    } catch (error) {
      lastError = error;
    }
  }

  emitPersonaWarning(
    persona,
    "LLM_BUSINESS_FALLBACK",
    `模型调用仍然失败，已使用业务兜底结果: ${sanitizeErrorMessage(String(lastError?.message || lastError || "unknown error")).slice(0, 120)}`,
    options,
  );
  return createPersonaFallback(persona, options);
}
