// ========== 1. 类型定义 ==========
export interface LlmProviderDto {
  id: string;
  baseUrl: string;
  maskedApiKey: string;
  model: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  supportsEmbedding: boolean;
  temperature?: number;
  enabled: boolean;
  builtin: boolean;
  defaultChatProvider: boolean;
  defaultEmbeddingProvider: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LlmProviderCreateInput {
  id: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  supportsEmbedding?: boolean;
  temperature?: number;
  enabled?: boolean;
}

export type LlmProviderUpdateInput = Partial<LlmProviderCreateInput>;

export interface DefaultProviderInput {
  defaultProvider: string;
}

export interface DefaultEmbeddingProviderInput {
  defaultEmbeddingProvider: string;
}

// ========== 2. llmProviderApi 命名空间对象 ==========
import { api } from './http';

export const llmProviderApi = {
  list: () => api.get<LlmProviderDto[]>('/llm-providers'),
  create: (data: LlmProviderCreateInput) =>
    api.post<LlmProviderDto>('/llm-providers', data),
  update: (id: string, data: LlmProviderUpdateInput) =>
    api.put<LlmProviderDto>(`/llm-providers/${id}`, data),
  delete: (id: string) => api.delete(`/llm-providers/${id}`),
  test: (id: string) => api.post<{ success: boolean; message?: string }>(`/llm-providers/${id}/test`),
  getDefault: () => api.get<{ defaultChatProviderId: string; defaultEmbeddingProviderId?: string }>('/llm-providers/default'),
  updateDefault: (defaultProvider: string) =>
    api.put('/llm-providers/default', { defaultProvider }),
  updateDefaultEmbedding: (defaultEmbeddingProvider: string) =>
    api.put('/llm-providers/default-embedding', { defaultEmbeddingProvider }),
  reload: () => api.post('/llm-providers/reload'),
};

// ========== 3. 默认导出 ==========
export default llmProviderApi;
