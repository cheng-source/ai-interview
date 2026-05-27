import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
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
};

export const interviewsApi = {
  create: (data: { candidateId: string; positionId: string }) =>
    api.post('/interviews', data),
  start: (id: string, resumeText: string) =>
    api.post(`/interviews/${id}/start`, { resumeText }),
  getState: (id: string) => api.get(`/interviews/${id}/state`),
  sendMessage: (id: string, message: string) =>
    api.post(`/interviews/${id}/message`, { message }),
  getStreamUrl: (id: string) => `http://localhost:3000/api/interviews/${id}/stream`,
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
  delete: (id: string) => api.delete(`/knowledge/${id}`),
};

export const reportsApi = {
  list: () => api.get('/reports'),
  get: (interviewId: string) => api.get(`/reports/${interviewId}`),
};
