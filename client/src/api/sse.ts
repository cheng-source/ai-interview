import { getBaseURL } from "./http";

export interface SSERequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token?: string;
}

export interface SSERequestResult {
  response: Promise<Response>;
  abort: () => void;
}

export interface SSEHandlers {
  onStatus?: (content: string) => void;
  onToken?: (content: string) => string | null;
  onTokenEnd?: () => void;
  onEvaluation?: (data: any) => void;
  onMessage?: (content: string, stage?: string) => void;
  onStage?: (stage: string) => void;
  onDone?: (report: any) => void;
  onWarning?: (message: string, data?: any) => void;
  onError?: (message: string) => void;
  onEvent?: (data: any) => void;
}

export function createSSERequest(
  path: string,
  options: SSERequestOptions = {},
): SSERequestResult {
  const { method = "POST", body, token } = options;
  const controller = new AbortController();
  const url = `${getBaseURL()}${path}`;

  const headers: Record<string, string> = {};
  if (body != null) headers["Content-Type"] = "application/json";
  if (token) headers["X-Interview-Token"] = token;

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

export async function readSSEStream(
  response: Response,
  handlers: SSEHandlers,
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let streamingMsgId: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = JSON.parse(line.slice(6));
      handlers.onEvent?.(data);

      switch (data.type) {
        case "status":
          handlers.onStatus?.(data.content);
          break;
        case "token": {
          const msgId = handlers.onToken?.(data.content);
          if (msgId) streamingMsgId = msgId;
          break;
        }
        case "token_end":
          handlers.onTokenEnd?.();
          streamingMsgId = null;
          break;
        case "evaluation":
          handlers.onEvaluation?.(data);
          break;
        case "message":
          handlers.onMessage?.(data.content, data.stage);
          break;
        case "stage":
          handlers.onStage?.(data.stage);
          break;
        case "done":
          handlers.onDone?.(data.report);
          break;
        case "llm_warning":
          handlers.onWarning?.(data.message, data);
          break;
        case "error":
          handlers.onError?.(data.message);
          break;
      }
    }
  }

  if (streamingMsgId) handlers.onTokenEnd?.();
}
