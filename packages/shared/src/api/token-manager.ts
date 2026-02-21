type RefreshFn = () => Promise<string | null>;
type LogoutFn = () => Promise<void>;

let refreshFn: RefreshFn | null = null;
let logoutFn: LogoutFn | null = null;
let isRefreshing = false;
let refreshPromise: Promise<string | null> | null = null;

export const tokenManager = {
  setHandlers(refresh: RefreshFn, logout: LogoutFn) {
    refreshFn = refresh;
    logoutFn = logout;
  },

  clearHandlers() {
    refreshFn = null;
    logoutFn = null;
  },

  /** Attempt to refresh the access token. Deduplicates concurrent calls. */
  async refreshToken(): Promise<string | null> {
    if (!refreshFn) return null;

    // If a refresh is already in flight, wait for it
    if (isRefreshing && refreshPromise) {
      return refreshPromise;
    }

    isRefreshing = true;
    refreshPromise = refreshFn()
      .catch(() => null)
      .finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });

    return refreshPromise;
  },

  async logout(): Promise<void> {
    await logoutFn?.();
  },
};
