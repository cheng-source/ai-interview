import { getRuntimeChatProvider, resolveChatProviderConfig, setCallType } from "../llm";
import { sanitizeErrorMessage } from "../prompt-security";
import { classifyLlmError } from "../personas/llm-errors";
import { createPersonaFallback } from "../personas/persona-fallback";
import { emitPersonaWarning } from "../personas/persona-warning";
import { resolveProviderAttempts } from "../personas/provider-attempts";
import type { PersonaDefinition } from "../personas/persona.interface";
import type {
  PersonaExecuteOptions,
  PersonaResult,
} from "../personas/persona-types";
import { OpenAICompatibleAdapter } from "./openai-compatible-adapter";
import type { ModelAdapter, ModelProviderProtocol } from "./model-types";

const openAICompatibleAdapter = new OpenAICompatibleAdapter();

const adapters: Record<ModelProviderProtocol, ModelAdapter> = {
  "openai-compatible": openAICompatibleAdapter,
};

function resolveAdapter(providerId: string | undefined): ModelAdapter {
  const provider = getRuntimeChatProvider(providerId);
  const protocol = provider?.protocol || "openai-compatible";
  return adapters[protocol] || openAICompatibleAdapter;
}

function getProviderLogContext(providerId: string | undefined, persona: PersonaDefinition) {
  try {
    const provider = resolveChatProviderConfig(providerId);
    return {
      providerId: providerId || "default",
      model: provider.model,
      baseURL: provider.baseURL,
      protocol: provider.protocol,
      outputMode: persona.outputMode,
    };
  } catch {
    return {
      providerId: providerId || "default",
      outputMode: persona.outputMode,
    };
  }
}

export async function invokePersonaModel(
  persona: PersonaDefinition,
  userMessage: any,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  const providerIds = resolveProviderAttempts(options);
  let lastError: any;

  for (const providerId of providerIds) {
    const adapter = resolveAdapter(providerId);
    const providerContext = getProviderLogContext(providerId, persona);
    console.info("[LLM] invoking", {
      personaId: persona.id,
      personaName: persona.name,
      streaming: persona.streaming,
      ...providerContext,
    });
    try {
      setCallType(persona.streaming ? "text" : "structured");
      if (persona.outputMode === "structured" && persona.schema) {
        return await adapter.invokeStructured({
          persona,
          userMessage,
          options,
          providerId,
          streaming: false,
          schema: persona.schema,
        });
      }

      return await adapter.invokeText({
        persona,
        userMessage,
        options,
        providerId,
        streaming: persona.streaming,
      });
    } catch (error) {
      lastError = error;
      const kind = classifyLlmError(error);
      console.warn("[LLM] provider invocation failed", {
        personaId: persona.id,
        personaName: persona.name,
        failureKind: kind,
        error: sanitizeErrorMessage(String((error as any)?.message || error)),
        ...providerContext,
      });
      emitPersonaWarning(
        persona,
        "LLM_PROVIDER_FALLBACK",
        `当前模型调用失败: ${providerContext.providerId}/${providerContext.model || "unknown"}，正在尝试备用方案`,
        options,
        undefined,
        {
          ...providerContext,
          failureKind: kind,
        },
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
        undefined,
        getProviderLogContext(providerIds[0], persona),
      );
      setCallType("structured");
      return await resolveAdapter(providerIds[0]).invokeText({
        persona,
        userMessage,
        options,
        providerId: providerIds[0],
        streaming: false,
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (persona.outputMode === "structured") {
    emitPersonaWarning(
      persona,
      "LLM_JSON_FALLBACK",
      "JSON 修复失败，已使用结构化兜底结果",
      options,
      undefined,
      getProviderLogContext(providerIds[0], persona),
    );
    return createPersonaFallback(persona, options);
  }

  emitPersonaWarning(
    persona,
    "LLM_BUSINESS_FALLBACK",
    `模型调用仍然失败，已使用业务兜底结果: ${sanitizeErrorMessage(String(lastError?.message || lastError || "unknown error")).slice(0, 120)}`,
    options,
    undefined,
    getProviderLogContext(providerIds[0], persona),
  );
  return createPersonaFallback(persona, options);
}
