import axios from 'axios';
import toast from 'react-hot-toast';
import i18next from 'i18next';

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api";

/** Pre-configured Axios client instance for API requests with JWT insertion and session expiration handling. */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutria_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('nutria_token');
      localStorage.removeItem('nutria_user');
      
      toast.error(
        i18next.t('auth.session_expired', 'Your session has expired, please log in again.'), 
        { id: 'session-expired' }
      );
      
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;