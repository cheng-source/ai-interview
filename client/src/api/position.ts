// ========== 1. 类型定义 ==========
export interface PositionDto {
  id: string;
  title: string;
  department: string;
  jdText: string;
  techStack: string[];
  level: string;
  createdAt: string;
}

export interface PositionCreateInput {
  title: string;
  department: string;
  jdText: string;
  techStack: string;
  level: string;
}

export type PositionUpdateInput = Partial<PositionCreateInput>;

// ========== 2. positionApi 命名空间对象 ==========
import { api } from './client';

export const positionApi = {
  list: () => api.get<PositionDto[]>('/positions'),
  get: (id: string) => api.get<PositionDto>(`/positions/${id}`),
  create: (data: PositionCreateInput) => api.post<PositionDto>('/positions', data),
  update: (id: string, data: PositionUpdateInput) => api.put<PositionDto>(`/positions/${id}`, data),
  delete: (id: string) => api.delete(`/positions/${id}`),
};

// ========== 3. 默认导出 ==========
export default positionApi;
