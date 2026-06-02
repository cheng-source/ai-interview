import { ChatOpenAI } from "@langchain/openai";
import { OpenAIEmbeddings } from "@langchain/openai";
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";

// ---- async queue for streaming tokens & events ----
class TokenQueue {
  private items: any[] = [];
  private waiter: ((v: IteratorResult<any>) => void) | null = null;
  private closed = false;

  push(item: any) {
    if (this.waiter) {
      this.waiter({ value: item, done: false });
      this.waiter = null;
    } else {
      this.items.push(item);
    }
  }

  done() {
    this.closed = true;
    if (this.waiter) {
      this.waiter({ value: undefined, done: true });
      this.waiter = null;
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<any> {
    const self = this;
    return {
      next(): Promise<IteratorResult<any>> {
        if (self.items.length > 0) {
          return Promise.resolve({ value: self.items.shift()!, done: false });
        }
        if (self.closed) {
          return Promise.resolve({ value: undefined, done: true });
        }
        return new Promise((r) => { self.waiter = r; });
      },
    };
  }
}

// ---- per-request streaming context ----
let currentQueue: TokenQueue | null = null;
let currentCallType: 'text' | 'structured' | 'none' = 'none';

export function createStreamingContext(): TokenQueue {
  const queue = new TokenQueue();
  currentQueue = queue;
  return queue;
}

export function clearStreamingContext() {
  currentQueue = null;
  currentCallType = 'none';
}

export function setCallType(type: 'text' | 'structured') {
  currentCallType = type;
}

export function pushEvent(event: any) {
  if (currentQueue) {
    currentQueue.push(event);
  }
}

// ---- LangChain callback handler ----
class StreamingHandler extends BaseCallbackHandler {
  name = "streaming_handler";

  handleLLMNewToken(token: string) {
    if (currentQueue && token && currentCallType === 'text') {
      currentQueue.push({ type: "token", content: token });
    }
  }
}

// ---- LLM factory ----
export function createLLM(options: { temperature?: number; streaming?: boolean } = {}) {
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
  return new ChatOpenAI(opts);
}

// ---- Embedding factory ----
let cachedEmbeddings: OpenAIEmbeddings | null = null;

export function createEmbeddings(): OpenAIEmbeddings {
  if (!cachedEmbeddings) {
    const opts: any = {
      modelName: process.env.EMBEDDING_MODEL || 'text-embedding-v3',
      openAIApiKey: process.env.EMBEDDING_API_KEY,
      configuration: {
        baseURL: process.env.EMBEDDING_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      },
    };
    const dims = parseInt(process.env.EMBEDDING_DIMENSIONS || '', 10);
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
    `${process.env.EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1"}/../../services/reranker/text-reranking/text-reranking`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.EMBEDDING_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.RERANK_MODEL || "gte-rerank",
        query,
        documents,
        top_n: topN,
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
