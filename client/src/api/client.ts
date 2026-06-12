import axios from 'axios';

// ========== Axios 实例 ==========
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3100/api',
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && window.location.pathname.startsWith('/admin')) {
      localStorage.removeItem('adminToken');
      window.location.href = `/admin/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    }
    return Promise.reject(error);
  },
);

// ========== 基础 URL ==========
export function getBaseURL(): string {
  return import.meta.env.VITE_API_BASE || 'http://localhost:3100/api';
}

// ========== SSE 流式请求 ==========
export interface SSERequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  token?: string;
}

export interface SSERequestResult {
  response: Promise<Response>;
  abort: () => void;
}

/** 创建一个可取消的 SSE fetch 请求，返回原始 Response（含 ReadableStream body） */
export function createSSERequest(path: string, options: SSERequestOptions = {}): SSERequestResult {
  const { method = 'POST', body, token } = options;
  const controller = new AbortController();
  const url = `${getBaseURL()}${path}`;

  const headers: Record<string, string> = {};
  if (body != null) headers['Content-Type'] = 'application/json';
  if (token) headers['X-Interview-Token'] = token;

  const response = fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  });

  return { response, abort: () => controller.abort() };
}

// ========== SSE 流解析 ==========
export interface SSEHandlers {
  onStatus?: (content: string) => void;
  onToken?: (content: string) => string | null; // 返回 streamingMsgId，首次返回新 id，后续返回 null
  onTokenEnd?: () => void;
  onEvaluation?: (data: any) => void;
  onMessage?: (content: string, stage?: string) => void;
  onStage?: (stage: string) => void;
  onDone?: (report: any) => void;
  onWarning?: (message: string) => void;
  onError?: (message: string) => void;
  onEvent?: (data: any) => void;
}

/** 通用 SSE ReadableStream 解析器 */
export async function readSSEStream(response: Response, handlers: SSEHandlers): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let streamingMsgId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = JSON.parse(line.slice(6));
      handlers.onEvent?.(data);

      switch (data.type) {
        case 'status':
          handlers.onStatus?.(data.content);
          break;

        case 'token': {
          const msgId = handlers.onToken?.(data.content);
          if (msgId) streamingMsgId = msgId;
          break;
        }

        case 'token_end':
          handlers.onTokenEnd?.();
          streamingMsgId = null;
          break;

        case 'evaluation':
          handlers.onEvaluation?.(data);
          break;

        case 'message':
          handlers.onMessage?.(data.content, data.stage);
          break;

        case 'stage':
          handlers.onStage?.(data.stage);
          break;

        case 'done':
          handlers.onDone?.(data.report);
          break;

        case 'llm_warning':
          handlers.onWarning?.(data.message);
          break;

        case 'error':
          handlers.onError?.(data.message);
          break;
      }
    }
  }

  // 如果流结束但 streamingMsgId 未清除，补发 token_end
  if (streamingMsgId) {
    handlers.onTokenEnd?.();
  }
}
