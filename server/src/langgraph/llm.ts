import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AsyncLocalStorage } from "node:async_hooks";
import { Observable, ReplaySubject } from "rxjs";

type CallType = "text" | "structured" | "none";

export interface RuntimeProviderConfig {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string | null;
  embeddingDimensions?: number | null;
  supportsEmbedding?: boolean;
  temperature?: number | null;
  enabled?: boolean;
}

export interface RuntimeProviderSnapshot {
  defaultChatProviderId: string;
  defaultEmbeddingProviderId?: string | null;
  providers: RuntimeProviderConfig[];
}

interface ResolvedChatProviderConfig {
  model: string;
  apiKey: string | undefined;
  baseURL: string;
  temperature?: number;
}

let runtimeProviderSnapshot: RuntimeProviderSnapshot | null = null;

// ---- request-scoped stream context for streaming tokens & events ----
export class InterviewStreamContext implements AsyncIterable<any> {
  private subject = new ReplaySubject<any>(10000);
  private callType: CallType = "none";

  get events$(): Observable<any> {
    return this.subject.asObservable();
  }

  setCallType(type: CallType) {
    this.callType = type;
  }

  getCallType(): CallType {
    return this.callType;
  }

  push(item: any) {
    if (!this.subject.closed) this.subject.next(item);
  }

  done() {
    if (!this.subject.closed) this.subject.complete();
  }

  [Symbol.asyncIterator](): AsyncIterator<any> {
    const subject = this.subject;
    const items: any[] = [];
    let waiter: ((v: IteratorResult<any>) => void) | null = null;
    let completed = false;
    let error: unknown = null;

    const subscription = subject.subscribe({
      next(item) {
        if (waiter) {
          waiter({ value: item, done: false });
          waiter = null;
        } else {
          items.push(item);
        }
      },
      error(err) {
        error = err;
        if (waiter) {
          const pending = waiter;
          waiter = null;
          Promise.reject(err).catch(() => pending({ value: undefined, done: true }));
        }
      },
      complete() {
        completed = true;
        if (waiter) {
          waiter({ value: undefined, done: true });
          waiter = null;
        }
      },
    });

    return {
      next(): Promise<IteratorResult<any>> {
        if (items.length > 0) {
          return Promise.resolve({ value: items.shift()!, done: false });
        }
        if (error) {
          return Promise.reject(error);
        }
        if (completed) {
          subscription.unsubscribe();
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((resolve) => {
          waiter = resolve;
        });
      },
      return(): Promise<IteratorResult<any>> {
        subscription.unsubscribe();
        return Promise.resolve({ value: undefined, done: true });
      },
    };
  }
}

const streamContextStorage = new AsyncLocalStorage<InterviewStreamContext>();

export function runWithStreamingContext<T>(
  context: InterviewStreamContext,
  fn: () => T,
): T {
  return streamContextStorage.run(context, fn);
}

function getStreamingContext(): InterviewStreamContext | undefined {
  return streamContextStorage.getStore();
}

export function createStreamingContext(): InterviewStreamContext {
  return new InterviewStreamContext();
}

export function clearStreamingContext() {
  getStreamingContext()?.setCallType("none");
}

export function setCallType(type: "text" | "structured") {
  getStreamingContext()?.setCallType(type);
}

export function pushEvent(event: any) {
  getStreamingContext()?.push(event);
}

export function setRuntimeProviderSnapshot(snapshot: RuntimeProviderSnapshot) {
  runtimeProviderSnapshot = {
    defaultChatProviderId: snapshot.defaultChatProviderId,
    defaultEmbeddingProviderId: snapshot.defaultEmbeddingProviderId,
    providers: snapshot.providers.map((provider) => ({ ...provider })),
  };
  cachedEmbeddings = null;
  clearLLMCache();
}

export function clearRuntimeProviderSnapshot() {
  runtimeProviderSnapshot = null;
  cachedEmbeddings = null;
  clearLLMCache();
}

export function clearRuntimeProviderSnapshotForTest() {
  clearRuntimeProviderSnapshot();
}

function findRuntimeProvider(providerId?: string | null): RuntimeProviderConfig | null {
  if (!runtimeProviderSnapshot) return null;

  const id = providerId || runtimeProviderSnapshot.defaultChatProviderId;
  const exact = runtimeProviderSnapshot.providers.find((provider) => provider.id === id);
  if (exact) return exact;

  return runtimeProviderSnapshot.providers.find(
    (provider) => provider.id === runtimeProviderSnapshot?.defaultChatProviderId,
  ) || null;
}

export function getEnabledChatProviderIds(): string[] {
  if (!runtimeProviderSnapshot) return [];
  return runtimeProviderSnapshot.providers
    .filter((provider) => provider.enabled !== false && !!provider.apiKey && !!provider.model)
    .map((provider) => provider.id);
}

function normalizeOpenAIBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return "https://api.openai.com/v1";
  if (/\/v\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function resolveChatProviderConfig(providerId?: string | null): ResolvedChatProviderConfig {
  const provider = findRuntimeProvider(providerId);
  if (provider) {
    if (provider.enabled === false) {
      throw new Error(`LLM provider ${provider.id} is disabled`);
    }
    return {
      model: provider.model,
      apiKey: provider.apiKey,
      baseURL: normalizeOpenAIBaseUrl(provider.baseUrl),
      temperature: provider.temperature ?? undefined,
    };
  }

  return {
    model: process.env.LLM_MODEL || "deepseek-v4-pro",
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: normalizeOpenAIBaseUrl(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"),
    temperature: undefined,
  };
}

// ---- LangChain callback handler ----
class StreamingHandler extends BaseCallbackHandler {
  name = "streaming_handler";

  handleLLMNewToken(token: string) {
    const context = getStreamingContext();
    if (context && token && context.getCallType() === "text") {
      context.push({ type: "token", content: token });
    }
  }
}

// ---- LLM 实例缓存（按模型+温度+流式模式复用 ChatOpenAI 实例）----
const llmCache = new Map<string, ChatOpenAI>();
const sharedStreamingHandler = new StreamingHandler();

export function createLLM(
  options: { temperature?: number; streaming?: boolean; providerId?: string } = {},
) {
  const provider = resolveChatProviderConfig(options.providerId);
  const temperature = options.temperature ?? provider.temperature ?? 0.5;
  const streaming = options.streaming ?? false;
  const cacheKey = `${provider.model}::${temperature}::${streaming}`;

  const cached = llmCache.get(cacheKey);
  if (cached) return cached;

  const opts: any = {
    model: provider.model,
    temperature,
    apiKey: provider.apiKey,
    configuration: {
      baseURL: provider.baseURL,
    },
  };
  if (streaming) {
    opts.streaming = true;
    opts.callbacks = [sharedStreamingHandler]; // AsyncLocalStorage 天然隔离，单例即可
  }
  const llm = new ChatOpenAI(opts);
  // 覆盖 modelName 为 tiktoken 已知的模型，避免 "Unknown model" 警告
  // model 保持不变用于 API 请求，modelName 仅用于 token 估算
  llm.modelName = "gpt-4";
  llmCache.set(cacheKey, llm);
  return llm;
}

/** 清空 LLM 实例缓存（provider 配置变更时调用） */
export function clearLLMCache() {
  llmCache.clear();
}

// ---- Embedding factory ----
let cachedEmbeddings: OpenAIEmbeddings | null = null;

export function createEmbeddings(): OpenAIEmbeddings {
  if (!cachedEmbeddings) {
    const provider = runtimeProviderSnapshot?.providers.find(
      (item) =>
        item.id === runtimeProviderSnapshot?.defaultEmbeddingProviderId &&
        item.supportsEmbedding &&
        !!item.embeddingModel &&
        item.enabled !== false,
    );
    const opts: any = {
      modelName: provider?.embeddingModel || process.env.EMBEDDING_MODEL || "text-embedding-v3",
      openAIApiKey: provider?.apiKey || process.env.EMBEDDING_API_KEY,
      configuration: {
        baseURL: provider?.baseUrl || process.env.EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    };
    const dims = provider?.embeddingDimensions || parseInt(process.env.EMBEDDING_DIMENSIONS || "", 10);
    if (!isNaN(dims)) {
      opts.dimensions = dims;
    }
    cachedEmbeddings = new OpenAIEmbeddings(opts);
  }
  return cachedEmbeddings;
}

// ---- Reranker (DashScope gte-rerank) ----
export async function rerank(
  query: string,
  documents: string[],
  topN = 3,
): Promise<{ content: string; score: number }[]> {
  if (!documents.length) return [];
  const res = await fetch(
    "https://dashscope.aliyuncs.com/api/v1/services/rerank/text-rerank/text-rerank",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.RERANK_MODEL || "gte-rerank-v2",
        input: { query, documents },
        parameters: { top_n: topN },
      }),
    },
  );
  if (!res.ok) {
    console.error("Rerank API error:", res.status, await res.text());
    return documents.slice(0, topN).map((content) => ({ content, score: 0 }));
  }
  const data = (await res.json()) as {
    output: { results: Array<{ index: number; relevance_score: number }> };
  };
  return (data.output?.results || []).map((r) => ({
    content: documents[r.index],
    score: r.relevance_score,
  }));
}

// ---- 简历解析共享 Promise，防止后台+同步跑两次 LLM ----
const resumeParseMap = new Map<string, Promise<any>>();

export function getOrStartResumeParse(
  threadId: string,
  fn: () => Promise<any>,
): Promise<any> {
  const existing = resumeParseMap.get(threadId);
  if (existing) return existing;
  const promise = fn().then((result) => {
    // 完成后用 resolved promise 替换，后续调用者直接拿缓存，不会发起新 LLM 调用
    resumeParseMap.set(threadId, Promise.resolve(result));
    return result;
  });
  resumeParseMap.set(threadId, promise);
  return promise;
}
