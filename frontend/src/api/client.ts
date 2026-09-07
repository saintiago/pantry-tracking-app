import { API_URL } from '../config';
import { getCurrentSession } from '../auth/cognitoClient/cognitoClient';

interface RequestOptions extends RequestInit {
  timeoutMs?: number;
  responseType?: 'json' | 'empty';
  useServerMessage?: boolean;
}

/** Shared authenticated transport. Mutations are never automatically retried. */
export async function apiRequest<T>(
  path: string,
  fallbackMessage: string,
  options: RequestOptions = {},
): Promise<T> {
  const session = await getCurrentSession();
  if (!session) throw new Error('Not authenticated');
  const { timeoutMs, responseType = 'json', useServerMessage = true, ...init } = options;
  const controller = timeoutMs ? new AbortController() : undefined;
  const abort = () => controller?.abort(init.signal?.reason);
  if (init.signal?.aborted) abort();
  else init.signal?.addEventListener('abort', abort, { once: true });
  const timeout = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.tokens.idToken}`,
      },
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const message =
        useServerMessage && body && typeof body === 'object' && 'message' in body
          ? body.message
          : undefined;
      throw new Error(typeof message === 'string' && message ? message : fallbackMessage);
    }
    if (responseType === 'empty' || response.status === 204) return undefined as T;
    // Await the body before releasing the timeout/cancellation listeners.
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener('abort', abort);
  }
}
