// API configuration
// For local development, set VITE_API_BASE_URL in .env.local
// For CI/CD builds, it's injected by build-with-api-config.sh

export const API_CONFIG = {
  baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/',
  endpoints: {
    query: 'query'
  }
} as const;

export default API_CONFIG;
