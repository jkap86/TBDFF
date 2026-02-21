import { tokenManager } from './token-manager';

let baseUrl = '';

/**
 * Initialize the API client with a base URL.
 * Must be called once at app startup before making any API calls.
 */
export function initApiClient(config: { baseUrl: string }) {
  baseUrl = config.baseUrl;
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

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await response.json();

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

    const errorMessage = json?.error?.message || 'Something went wrong';
    const errorCode = json?.error?.code;
    throw new ApiError(errorMessage, response.status, errorCode);
  }

  return json as T;
}

export const apiClient = {
  get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
  post: <T>(path: string, body?: unknown, token?: string) => request<T>('POST', path, body, token),
};
