import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AsyncLocalStorage } from "node:async_hooks";
import { Observable, ReplaySubject } from "rxjs";

type CallType = "text" | "structured" | "none";

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

// ---- LLM factory ----
export function createLLM(
  options: { temperature?: number; streaming?: boolean } = {},
) {
  const opts: any = {
    model: process.env.LLM_MODEL || "deepseek-v4-pro",
    temperature: options.temperature ?? 0.5,
    apiKey: process.env.OPENAI_API_KEY,
    configuration: {
      baseURL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    },
  };
  if (options.streaming) {
    opts.streaming = true;
    opts.callbacks = [new StreamingHandler()];
  }
  const llm = new ChatOpenAI(opts);
  // 覆盖 modelName 为 tiktoken 已知的模型，避免 "Unknown model" 警告
  // model 保持不变用于 API 请求，modelName 仅用于 token 估算
  llm.modelName = "gpt-4";
  return llm;
}

// ---- Embedding factory ----
let cachedEmbeddings: OpenAIEmbeddings | null = null;

export function createEmbeddings(): OpenAIEmbeddings {
  if (!cachedEmbeddings) {
    const opts: any = {
      modelName: process.env.EMBEDDING_MODEL || "text-embedding-v3",
      openAIApiKey: process.env.EMBEDDING_API_KEY,
      configuration: {
        baseURL:
          process.env.EMBEDDING_BASE_URL ||
          "https://dashscope.aliyuncs.com/compatible-mode/v1",
      },
    };
    const dims = parseInt(process.env.EMBEDDING_DIMENSIONS || "", 10);
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
