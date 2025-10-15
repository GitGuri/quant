// Auto-inject Authorization + X-Company-Id on YOUR API calls.
// Safe: it only targets your API origin or relative "/api" paths.

const API_BASE_URL =
  (import.meta as any)?.env?.VITE_API_BASE_URL ?? 'https://quantnow-sa1e.onrender.com';

(function patchFetch() {
  // Avoid double-patching in hot reload
  if ((window as any).__fetch_patched__) return;
  (window as any).__fetch_patched__ = true;

  const originalFetch = window.fetch.bind(window);
  const apiOrigin = new URL(API_BASE_URL, window.location.origin).origin;

  function shouldAttach(input: RequestInfo): boolean {
    try {
      if (input instanceof Request) {
        const u = new URL(input.url, window.location.origin);
        return u.pathname.startsWith('/api') || u.origin === apiOrigin;
      }
      if (typeof input === 'string') {
        // Treat relative "/api/..." as your backend
        if (input.startsWith('/api')) return true;
        const u = new URL(input, window.location.origin);
        return u.origin === apiOrigin;
      }
    } catch {}
    return false;
  }

  // Read active company with USER-SCOPED storage first, then fall back to legacy keys
  function getScopedCompanyId(): string {
    const uid =
      localStorage.getItem('currentUserId') ||
      localStorage.getItem('user_id') ||
      '';
    const scoped = uid ? localStorage.getItem(`activeCompanyId:${uid}`) : null;
    return (
      scoped ||
      localStorage.getItem('activeCompanyId') || // legacy
      localStorage.getItem('companyId') ||       // legacy
      ''
    );
  }

  window.fetch = (input: RequestInfo, init: RequestInit = {}) => {
    // Opt-out per request: pass header "X-No-Auth: 1"
    const existing = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const skip = existing.get('X-No-Auth') === '1';

    if (!skip && shouldAttach(input)) {
      const headers = new Headers(existing);
      const token = localStorage.getItem('token');
      const companyId = getScopedCompanyId();

      if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
      if (companyId && !headers.has('X-Company-Id')) headers.set('X-Company-Id', companyId);
      headers.delete('X-No-Auth'); // clean up if present

      if (input instanceof Request) {
        // Rebuild the Request with merged headers
        input = new Request(input, { headers });
        init = { ...init, headers: (input as Request).headers };
      } else {
        init = { ...init, headers };
      }
    }

    return originalFetch(input as any, init);
  };
})();
