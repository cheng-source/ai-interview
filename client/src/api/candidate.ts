// ========== 1. 类型定义 ==========
export interface CandidateDto {
  id: string;
  name: string;
  email: string;
  phone: string;
  resumeUrl?: string;
  resumeText?: string;
  resumeParsed?: any;
  positionId: string;
  status: string;
  position?: { id: string; title: string; department: string };
  interviews?: InterviewBriefDto[];
}

export interface InterviewBriefDto {
  id: string;
  interviewType: string;
  status: string;
}

export interface CandidateCreateInput {
  name: string;
  email: string;
  phone: string;
  positionId: string;
}

export type CandidateUpdateInput = Partial<CandidateCreateInput>;

export interface ResumeParseResult {
  text: string;
  fileName: string;
}

// ========== 2. candidateApi 命名空间对象 ==========
import { api } from './client';

export const candidateApi = {
  list: () => api.get<CandidateDto[]>('/candidates'),
  get: (id: string) => api.get<CandidateDto>(`/candidates/${id}`),
  create: (data: CandidateCreateInput) => api.post<CandidateDto>('/candidates', data),
  update: (id: string, data: CandidateUpdateInput) => api.put<CandidateDto>(`/candidates/${id}`, data),
  delete: (id: string) => api.delete(`/candidates/${id}`),
  batchDelete: (ids: string[]) => api.post<{ count: number }>('/candidates/batch-delete', { ids }),
  uploadResume: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post<ResumeParseResult>(`/candidates/${id}/resume`, form);
  },
};

// ========== 3. 默认导出 ==========
export default candidateApi;
