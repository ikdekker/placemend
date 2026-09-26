import { API_BASE_URL } from './apiSync';

/**
 * Send a client-side error to the server log (api/data/client-errors.log) so problems that only
 * happen on a user's device can be diagnosed. Never throws.
 */
export function reportClientError(context: string, err: unknown, state?: Record<string, unknown>): void {
  try {
    const e = err as { message?: string; stack?: string; name?: string } | undefined;
    fetch(`${API_BASE_URL}/log.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        context,
        message: e?.message ? `${e.name || 'Error'}: ${e.message}` : String(err),
        stack: e?.stack || '',
        state: { url: location.pathname, ...state },
      }),
    }).catch(() => {});
  } catch {
    // Reporting must never break the app
  }
}

export function installGlobalErrorReporting(): void {
  window.addEventListener('error', (ev) => reportClientError('window.error', ev.error || ev.message));
  window.addEventListener('unhandledrejection', (ev) => reportClientError('unhandledrejection', ev.reason));
}
