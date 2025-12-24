import axios, { AxiosInstance } from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor to add auth token
    this.client.interceptors.request.use(
      (config) => {
        if (typeof window !== 'undefined') {
          const token = localStorage.getItem('token');
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => {
        return response;
      },
      (error) => {
        // Only log in development and only errors (not debug info)
        if (process.env.NODE_ENV === 'development' && error.response?.status >= 500) {
          console.error('[API ERROR]:', error.response?.status, error.config?.url);
        }
        if (error.response?.status === 401) {
          // Unauthorized - clear user and redirect to login
          // Don't redirect if we're already on the login page or if it's a login attempt failure
          const isLoginPage = typeof window !== 'undefined' && window.location.pathname === '/login';
          const isLoginRequest = error.config?.url?.includes('/auth/login');

          if (typeof window !== 'undefined' && !isLoginPage && !isLoginRequest) {
            localStorage.removeItem('user');
            localStorage.removeItem('token');
            window.location.href = '/login';
          }
        }
        return Promise.reject(error);
      }
    );
  }

  getInstance(): AxiosInstance {
    return this.client;
  }
}

export const apiClient = new ApiClient().getInstance();

export default apiClient;
