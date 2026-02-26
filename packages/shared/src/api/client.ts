import { tokenManager } from './token-manager';

let baseUrl = '';
let clientType: 'web' | 'mobile' | undefined;

/**
 * Initialize the API client with a base URL and optional client type.
 * Must be called once at app startup before making any API calls.
 * @param config.clientType - 'web' or 'mobile'. Sent as X-Client header so the
 *   backend can tailor responses (e.g. omit refreshToken from JSON for web).
 */
export function initApiClient(config: { baseUrl: string; clientType?: 'web' | 'mobile' }) {
  baseUrl = config.baseUrl;
  clientType = config.clientType;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
  _isRetry = false
): Promise<T> {
  if (!baseUrl) {
    throw new Error('@tbdff/shared: apiClient not initialized. Call initApiClient() first.');
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (clientType) {
    headers['X-Client'] = clientType;
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });

  // Safely parse the response body — avoid crashing on 204, HTML proxy errors, etc.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let json: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 204 && contentType.includes('application/json')) {
    try {
      json = await response.json();
    } catch {
      json = null;
    }
  }

  if (!response.ok) {
    // On 401, try to refresh the token and retry once
    if (response.status === 401 && token && !_isRetry) {
      const newToken = await tokenManager.refreshToken();
      if (newToken) {
        return request<T>(method, path, body, newToken, true);
      }
      // Refresh failed — force logout
      await tokenManager.logout();
    }

    const errorMessage = json?.error?.message || `Request failed with status ${response.status}`;
    const errorCode = json?.error?.code;
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  return json as T;
}

export const apiClient = {
  get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body?: unknown, token?: string) => request<T>('POST', path, body, token),
  put: <T>(path: string, body?: unknown, token?: string) => request<T>('PUT', path, body, token),
  patch: <T>(path: string, body?: unknown, token?: string) => request<T>('PATCH', path, body, token),
  delete: <T>(path: string, token?: string) => request<T>('DELETE', path, undefined, token),
};
