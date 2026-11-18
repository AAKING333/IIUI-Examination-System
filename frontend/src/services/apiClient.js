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
      if (Array.isArray(errorJson.detail)) {
        errorDetail = errorJson.detail
          .map((item) => {
            const loc = item.loc && item.loc.length ? `${item.loc[item.loc.length - 1]}: ` : '';
            return `${loc}${item.msg || JSON.stringify(item)}`;
          })
          .join('\n');
      } else {
        errorDetail = errorJson.detail || errorJson.message || errorDetail;
      }
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

export function extractErrorMessage(errData, fallback = 'Operation failed.') {
  if (!errData) return fallback;
  if (typeof errData === 'string') return errData;
  if (Array.isArray(errData.detail)) {
    return errData.detail
      .map((item) => {
        const loc = item.loc && item.loc.length > 1 ? `${item.loc[item.loc.length - 1]}: ` : '';
        return `${loc}${item.msg || JSON.stringify(item)}`;
      })
      .join(' | ');
  }
  if (typeof errData.detail === 'string') return errData.detail;
  if (errData.message) return errData.message;
  return fallback;
}

export function formatApiError(err) {
  if (!err) return 'An unexpected error occurred.';
  if (typeof err === 'string') return err;
  return extractErrorMessage(err, err.message || 'An unexpected error occurred.');
}
