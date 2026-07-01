// ========== 1. 类型定义 ==========
export interface LoginInput {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
}

// ========== 2. authApi 命名空间对象 ==========
import { api } from './http';

export const authApi = {
  login: (data: LoginInput) =>
    api.post<LoginResult>('/auth/login', data),
};

// ========== 3. 默认导出 ==========
export default authApi;
