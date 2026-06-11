import { SystemMessage } from "@langchain/core/messages";
import { z } from "zod";
import {
  createLLM,
  getEnabledChatProviderIds,
  setCallType,
  pushEvent,
} from "../llm";
import type { PersonaDefinition } from "./persona.interface";

export interface PersonaResult {
  response: any;
  content: string;
}

type LlmFailureKind =
  | "timeout"
  | "rate_limit"
  | "network"
  | "auth"
  | "server"
  | "invalid_json"
  | "schema_parse"
  | "unknown";

interface PersonaExecuteOptions {
  silent?: boolean; // 是否静默执行。为 true 时，不会向 SSE 推送这些事件：
  providerId?: string; // 指定本次优先使用哪个 LLM provider。
  maxRetries?: number;
  fallbackProviderIds?: string[]; //备用 provider 列表。当 providerId 失败时，会依次尝试这些备用 provider。
}

const RETRYABLE_FAILURES: LlmFailureKind[] = [
  "timeout",
  "rate_limit",
  "network",
  "server",
  "unknown",
];

/** 从 Zod schema 生成 JSON 格式说明（供 prompt 使用） */
function zodToJsonTemplate(schema: z.ZodTypeAny): string {
  const inner = unwrapDefault(schema);

  if (inner instanceof z.ZodObject) {
    const shape = (inner as any)._def.shape() as Record<string, z.ZodTypeAny>;
    const fields = Object.entries(shape)
      .map(([key, val]) => {
        const optional =
          val instanceof z.ZodDefault || val instanceof z.ZodOptional;
        const fieldSchema = optional ? unwrapDefault(val) : val;
        const typeDesc = describeType(fieldSchema);
        return `  "${key}": ${typeDesc}${optional ? " // optional" : ""}`;
      })
      .join(",\n");
    return `{\n${fields}\n}`;
  }

  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner.element);
    return `[${elem}, ...]`;
  }

  return describeType(inner);
}

function unwrapDefault(s: z.ZodTypeAny): z.ZodTypeAny {
  if (s instanceof z.ZodDefault) return s._def.innerType;
  if (s instanceof z.ZodOptional) return s._def.innerType;
  return s;
}

function describeType(s: z.ZodTypeAny): string {
  const inner = unwrapDefault(s);
  if (inner instanceof z.ZodString) return "string";
  if (inner instanceof z.ZodNumber) return "number";
  if (inner instanceof z.ZodBoolean) return "boolean";
  if (inner instanceof z.ZodEnum)
    return (inner as z.ZodEnum<any>).options
      .map((o: string) => `"${o}"`)
      .join(" | ");
  if (inner instanceof z.ZodArray) {
    const elem = describeType(inner.element);
    return `[${elem}, ...]`;
  }
  if (inner instanceof z.ZodObject) return zodToJsonTemplate(inner);
  return "string";
}

function classifyLlmError(error: any): LlmFailureKind {
  const message = String(error?.message || error || "").toLowerCase();
  const status = Number(
    error?.status || error?.response?.status || error?.code || 0,
  );

  if (
    status === 401 ||
    status === 403 ||
    message.includes("unauthorized") ||
    message.includes("forbidden")
  )
    return "auth";
  if (
    status === 429 ||
    message.includes("rate limit") ||
    message.includes("too many requests")
  )
    return "rate_limit";
  if (status >= 500) return "server";
  if (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("aborted")
  )
    return "timeout";
  if (
    message.includes("fetch failed") ||
    message.includes("econnreset") ||
    message.includes("enotfound") ||
    message.includes("socket")
  )
    return "network";
  if (message.includes("json")) return "invalid_json";
  if (message.includes("zod") || message.includes("validation"))
    return "schema_parse";

  return "unknown";
}

function emitWarning(
  persona: PersonaDefinition,
  code: string,
  message: string,
  options: PersonaExecuteOptions | undefined,
  attempt?: number,
) {
  if (options?.silent) return;
  pushEvent({
    type: "llm_warning",
    code,
    message,
    personaId: persona.id,
    attempt,
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeWithRetry<T>(
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

      emitWarning(
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

/** 从 LLM 文本响应中严格提取并校验 JSON */
function parseStructuredResponseStrict(raw: string, schema: z.ZodSchema): any {
  const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = codeBlock ? codeBlock[1] : raw;
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("No JSON object found in structured LLM response");
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    return schema.parse(parsed);
  } catch (error: any) {
    const kind = error instanceof z.ZodError ? "schema_parse" : "invalid_json";
    throw new Error(`${kind}: ${error?.message || String(error)}`);
  }
}

async function repairStructuredJson(
  llm: any,
  raw: string,
  schema: z.ZodSchema,
  jsonTemplate: string,
): Promise<any> {
  const repairPrompt = `下面是一个模型返回内容，它本应是 JSON，但格式可能有问题。\n请只返回修复后的纯 JSON，不要解释，不要 markdown。\n\n目标格式：\n${jsonTemplate}\n\n原始内容：\n${raw}`;
  const response = await llm.invoke([new SystemMessage(repairPrompt)]);
  const content = typeof response.content === "string" ? response.content : "";
  return parseStructuredResponseStrict(content, schema);
}

function createSchemaFallback(schema: z.ZodSchema): any {
  const result = schema.safeParse({});
  if (result.success) return result.data;
  throw new Error("Structured response fallback failed schema validation");
}

function createTextFallback(persona: PersonaDefinition): string {
  if (persona.id.includes("followup")) {
    return "请你再展开说明一下关键细节：当时的背景是什么、你具体做了什么、结果如何？ [time] 180";
  }

  if (persona.id.includes("behavioral")) {
    return "请分享一个和岗位要求相关的具体经历，说明背景、你的行动、最终结果和复盘。 [time] 240";
  }

  if (persona.id.includes("candidate")) {
    return "这个问题我先简要回答：我们会结合岗位要求、你的项目经历和现场回答综合评估。你也可以继续问下一个关心的问题。";
  }

  return "**技术面试题**（技术基础 | 难度: ★★★）\n请结合你最近的一个项目，说明其中一个核心技术难点、你的解决方案、关键取舍以及最终效果。\n[time] 240";
}

function createPersonaFallback(
  persona: PersonaDefinition,
  options?: PersonaExecuteOptions,
): PersonaResult {
  if (persona.outputMode === "structured" && persona.schema) {
    return { response: createSchemaFallback(persona.schema), content: "" };
  }

  const content = createTextFallback(persona);
  if (!options?.silent) {
    pushEvent({ type: "token", content });
    pushEvent({ type: "token_end" });
  }
  return { response: null, content };
}

function resolveProviderAttempts(
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
    const jsonPrompt = `${persona.systemPrompt}\n\n只输出纯 JSON，不要用 markdown 代码块包裹。格式如下：\n${jsonTemplate}`;
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
    } catch (parseError) {
      emitWarning(
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
      } catch (repairError) {
        emitWarning(
          persona,
          "LLM_JSON_FALLBACK",
          "JSON 修复失败，已使用结构化兜底结果",
          options,
        );
        return createPersonaFallback(persona, options);
      }
    }
  }

  const messages = [new SystemMessage(persona.systemPrompt), userMessage];
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

// ---- LLM Mock（LLM_MOCK=true 时跳过真实 API 调用）----
// 用于压测系统基础设施（LangGraph + SSE + Redis + DB），不消耗 API 额度

function isMockEnabled(): boolean {
  return process.env.LLM_MOCK === "true";
}

function generateFakeValue(key: string, schema: z.ZodTypeAny): any {
  const inner = schema instanceof z.ZodDefault || schema instanceof z.ZodOptional
    ? (schema as any)._def.innerType || schema
    : schema;

  if (inner instanceof z.ZodString) return `mock_${key}_${Date.now()}`;
  if (inner instanceof z.ZodNumber) return Math.floor(Math.random() * 100);
  if (inner instanceof z.ZodBoolean) return true;
  if (inner instanceof z.ZodArray) return [];
  if (inner instanceof z.ZodEnum) return (inner as any)._def.values?.[0] || "mock";
  if (inner instanceof z.ZodObject) {
    const shape = (inner as any)._def.shape();
    if (typeof shape === "function") {
      const obj: Record<string, any> = {};
      for (const k of Object.keys(shape())) obj[k] = generateFakeValue(k, shape()[k]);
      return obj;
    }
  }
  return "mock";
}

function generateFakeStructuredOutput(persona: PersonaDefinition): any {
  if (!persona.schema) return { mock: true };
  const unwrapped = persona.schema instanceof z.ZodDefault
    ? (persona.schema as any)._def.innerType
    : persona.schema;
  if (unwrapped instanceof z.ZodObject) {
    const shape = (unwrapped as any)._def.shape();
    const obj: Record<string, any> = {};
    if (typeof shape === "function") {
      for (const key of Object.keys(shape())) {
        try { obj[key] = generateFakeValue(key, shape()[key]); }
        catch { obj[key] = "mock"; }
      }
    }
    return obj;
  }
  return { mock: true };
}

const FAKE_TOKENS = ["好的", "，", "让我", "来", "分析", "一下", "。", "根据", "你的", "简历", "，"];

async function mockExecutePersona(
  persona: PersonaDefinition,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  const silent = options?.silent || false;

  if (persona.outputMode === "structured") {
    // 结构化输出：模拟 100-300ms 延迟后返回假数据
    if (!silent) pushEvent({ type: "status", content: persona.name + " (mock)" });
    await new Promise(r => setTimeout(r, 100 + Math.random() * 200));
    const fakeResponse = generateFakeStructuredOutput(persona);
    const fakeContent = JSON.stringify(fakeResponse);
    if (!silent) {
      pushEvent({ type: "token", content: fakeContent });
      pushEvent({ type: "token_end" });
    }
    return { response: fakeResponse, content: fakeContent };
  }

  // 流式文本输出（如 icebreaker / tech_select 出题）
  // 逐个推送假 token，模拟真实流式体验
  if (!silent) pushEvent({ type: "status", content: persona.name + " (mock)" });

  const tokens = [...FAKE_TOKENS];
  let content = "";

  for (const token of tokens) {
    await new Promise(r => setTimeout(r, 30 + Math.random() * 50)); // 30-80ms / token
    content += token;
    if (!silent) pushEvent({ type: "token", content: token });
  }

  if (!silent) pushEvent({ type: "token_end" });

  return { response: null, content };
}

/** 统一执行 persona：创建 LLM → 配置流式/结构化 → invoke，并处理 retry/repair/fallback */
export async function executePersona(
  persona: PersonaDefinition,
  userMessage: any,
  options?: PersonaExecuteOptions,
): Promise<PersonaResult> {
  // LLM Mock 模式：跳过真实 API 调用，用假数据替代
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
      emitWarning(
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
      emitWarning(
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

  emitWarning(
    persona,
    "LLM_BUSINESS_FALLBACK",
    `模型调用仍然失败，已使用业务兜底结果: ${String(lastError?.message || lastError || "unknown error").slice(0, 120)}`,
    options,
  );
  return createPersonaFallback(persona, options);
}
