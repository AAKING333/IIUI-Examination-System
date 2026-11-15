/**
 * Centralized API Client with standard error handling and HTTP methods.
 */
const BASE_URL = '/api';

export async function apiClient(endpoint, options = {}) {
  const url = endpoint.startsWith('/') ? `${BASE_URL}${endpoint}` : `${BASE_URL}/${endpoint}`;
  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  };

  const response = await fetch(url, config);

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorJson.message || errorDetail;
    } catch {
      const errorText = await response.text().catch(() => '');
      if (errorText) errorDetail = errorText;
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) return null;

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return response.blob();
}

export const http = {
  get: (url) => apiClient(url, { method: 'GET' }),
  post: (url, body) => apiClient(url, { method: 'POST', body: JSON.stringify(body) }),
  put: (url, body) => apiClient(url, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (url, body) => apiClient(url, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (url) => apiClient(url, { method: 'DELETE' }),
};
