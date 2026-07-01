// ========== 1. 类型定义 ==========
export interface ReportDto {
  id: string;
  interviewId: string;
  candidateId: string;
  status: string;
  report?: any;
  candidate?: { id: string; name: string; email: string };
  position?: { id: string; title: string; department: string };
}

// ========== 2. reportApi 命名空间对象 ==========
import { api } from './http';

export const reportApi = {
  list: () => api.get<ReportDto[]>('/reports'),
  get: (interviewId: string) => api.get<ReportDto>(`/reports/${interviewId}`),
};

// ========== 3. 默认导出 ==========
export default reportApi;
