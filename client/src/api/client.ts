import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || 'http://localhost:3000/api',
  timeout: 30000,
});

export const positionsApi = {
  list: () => api.get('/positions'),
  get: (id: string) => api.get(`/positions/${id}`),
  create: (data: any) => api.post('/positions', data),
  update: (id: string, data: any) => api.put(`/positions/${id}`, data),
  delete: (id: string) => api.delete(`/positions/${id}`),
};

export const candidatesApi = {
  list: () => api.get('/candidates'),
  get: (id: string) => api.get(`/candidates/${id}`),
  create: (data: any) => api.post('/candidates', data),
  update: (id: string, data: any) => api.put(`/candidates/${id}`, data),
  delete: (id: string) => api.delete(`/candidates/${id}`),
  uploadResume: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ text: string; fileName: string }>(`/candidates/${id}/resume`, form);
  },
};

export const interviewsApi = {
  list: () => api.get('/interviews'),
  create: (data: { candidateId: string; positionId: string; interviewType: string }) =>
    api.post('/interviews', data),
  start: (id: string, resumeText: string) =>
    api.post(`/interviews/${id}/start`, { resumeText }),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ text: string }>('/interviews/upload-resume', form);
  },
  getState: (id: string) => api.get(`/interviews/${id}/state`),
  sendMessage: (id: string, message: string) =>
    api.post(`/interviews/${id}/message`, { message }),
  getStreamUrl: (id: string) => `${import.meta.env.VITE_API_BASE || 'http://localhost:3000/api'}/interviews/${id}/stream`,
};

export function createSSEConnection(url: string, onMessage: (data: any) => void): EventSource {
  const eventSource = new EventSource(url);
  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage({ type: 'raw', content: event.data });
    }
  };
  eventSource.onerror = () => {
    console.error('SSE connection error, auto-reconnecting...');
  };
  return eventSource;
}

export const knowledgeApi = {
  list: () => api.get('/knowledge'),
  search: (q: string) => api.get('/knowledge/search', { params: { q } }),
  upload: (data: { title: string; content: string; category: string }) =>
    api.post('/knowledge', data),
  uploadFile: (title: string, category: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('category', category);
    return api.post('/knowledge/upload-file', form);
  },
  delete: (id: string) => api.delete(`/knowledge/${id}`),
};

export const llmProvidersApi = {
  list: () => api.get('/llm-providers'),
  create: (data: any) => api.post('/llm-providers', data),
  update: (id: string, data: any) => api.put(`/llm-providers/${id}`, data),
  delete: (id: string) => api.delete(`/llm-providers/${id}`),
  test: (id: string) => api.post(`/llm-providers/${id}/test`),
  getDefault: () => api.get('/llm-providers/default'),
  updateDefault: (defaultProvider: string) =>
    api.put('/llm-providers/default', { defaultProvider }),
  updateDefaultEmbedding: (defaultEmbeddingProvider: string) =>
    api.put('/llm-providers/default-embedding', { defaultEmbeddingProvider }),
  reload: () => api.post('/llm-providers/reload'),
};

export const reportsApi = {
  list: () => api.get('/reports'),
  get: (interviewId: string) => api.get(`/reports/${interviewId}`),
};
