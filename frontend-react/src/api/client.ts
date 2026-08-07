import axios from 'axios';
import toast from 'react-hot-toast';
import i18next from 'i18next';

const API_BASE_URL = import.meta.env.VITE_API_URL || "https://europe-west1-nutria-issue.cloudfunctions.net/nutria_api";

/**
 * Pre-configured Axios HTTP client instance.
 * Automatically injects authentication tokens into request headers and 
 * handles global response errors, such as session expirations (401 Unauthorized).
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL,
});

// Request interceptor to inject the JWT authorization token if available in local storage
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('nutria_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor to handle API response errors globally
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Check if the response status is 401 (Unauthorized), indicating an expired or invalid session
    if (error.response && error.response.status === 401) {
      // Clear session identifiers from local storage
      localStorage.removeItem('nutria_token');
      localStorage.removeItem('nutria_user');
      
      // Display a localized toast warning about the expired session
      toast.error(
        i18next.t('auth.session_expired', 'Your session has expired, please log in again.'), 
        { id: 'session-expired' }
      );
      
      // Redirect the application context to the login page if not already there

      if (window.location.pathname !== '/login') {
        const targetUrl = window.location.pathname + window.location.search;
        localStorage.setItem('nutria_redirect_target', targetUrl);
        
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default apiClient;