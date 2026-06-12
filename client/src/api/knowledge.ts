// ========== 1. 类型定义 ==========
export interface CompanyDocDto {
  id: string;
  title: string;
  content: string;
  category: string;
  uploadedAt: string;
}

export interface CompanyDocCreateInput {
  title: string;
  content: string;
  category: string;
}

// ========== 2. knowledgeApi 命名空间对象 ==========
import { api } from './client';

export const knowledgeApi = {
  list: () => api.get<CompanyDocDto[]>('/knowledge'),
  search: (q: string) => api.get<CompanyDocDto[]>('/knowledge/search', { params: { q } }),
  upload: (data: CompanyDocCreateInput) =>
    api.post<CompanyDocDto>('/knowledge', data),
  uploadFile: (title: string, category: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    form.append('title', title);
    form.append('category', category);
    return api.post<CompanyDocDto>('/knowledge/upload-file', form);
  },
  delete: (id: string) => api.delete(`/knowledge/${id}`),
};

// ========== 3. 默认导出 ==========
export default knowledgeApi;
