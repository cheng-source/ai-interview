import axios from "axios";

export function getBaseURL(): string {
  return import.meta.env.VITE_API_BASE || "http://localhost:3100/api";
}

export const api = axios.create({
  baseURL: getBaseURL(),
  timeout: 30000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      window.location.pathname.startsWith("/admin")
    ) {
      localStorage.removeItem("adminToken");
      window.location.href = `/admin/login?redirect=${encodeURIComponent(
        window.location.pathname + window.location.search,
      )}`;
    }
    return Promise.reject(error);
  },
);
