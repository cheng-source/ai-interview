// ========== 1. 类型定义 ==========
export interface InterviewDto {
  id: string;
  candidateId: string;
  positionId: string;
  threadId: string;
  status: string;
  interviewType: string;
  accessTokenHash?: string;
  accessTokenExpiresAt?: string;
  createdAt: string;
  candidate?: { id: string; name: string; email: string };
  position?: { id: string; title: string; department: string };
}

export interface InterviewCreateInput {
  candidateId: string;
  positionId: string;
  interviewType: string;
}

export interface AccessTokenResult {
  interviewId: string;
  accessToken: string;
  accessTokenExpiresAt: string;
}

export interface InterviewState {
  state: any;
  status: string;
  startedAt: string | null;
  resumeText: string;
  candidate: { name: string } | null;
  position: { title: string; department: string } | null;
  interviewType: string;
  hasActiveStream: boolean;
}

// ========== 2. interviewApi 命名空间对象 ==========
import { api, createSSERequest, type SSERequestResult } from './client';

export const interviewApi = {
  // ---- REST（走 axios） ----
  list: () => api.get<InterviewDto[]>('/interviews'),
  create: (data: InterviewCreateInput) =>
    api.post<InterviewDto>('/interviews', data),
  rotateAccessToken: (id: string) =>
    api.post<AccessTokenResult>(`/interviews/${id}/access-token`),
  uploadResume: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<{ text: string }>('/interviews/upload-resume', form);
  },
  getState: (id: string, token?: string) =>
    api.get<InterviewState>(`/interviews/${id}/state`, {
      headers: token ? { 'X-Interview-Token': token } : undefined,
    }),

  // ---- SSE 流式（走 fetch + ReadableStream） ----
  startStream: (id: string, resumeText: string, token?: string): SSERequestResult =>
    createSSERequest(`/interviews/${id}/start`, {
      method: 'POST',
      body: { resumeText },
      token,
    }),

  sendMessage: (id: string, message: string, clientMessageId: string, token?: string): SSERequestResult =>
    createSSERequest(`/interviews/${id}/message`, {
      method: 'POST',
      body: { message, clientMessageId },
      token,
    }),

  resumeStream: (id: string, token?: string): SSERequestResult =>
    createSSERequest(`/interviews/${id}/stream`, {
      method: 'GET',
      token,
    }),
};

// ========== 3. 默认导出 ==========
export default interviewApi;
