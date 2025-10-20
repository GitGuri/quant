// src/lib/api.ts
const API_BASE_URL = 'https://quantnow-sa1e.onrender.com'

function getActiveCompanyId() {
  const uid = localStorage.getItem('currentUserId') || localStorage.getItem('user_id') || '';
  return (
    localStorage.getItem(`activeCompanyId:${uid}`) ||
    localStorage.getItem('activeCompanyId') ||
    localStorage.getItem('companyId') ||
    ''
  );
}

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem('token') || '';
  const companyId = getActiveCompanyId();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (companyId) headers.set('X-Company-Id', companyId); // 👈 critical

  return fetch(`${API_BASE_URL}${path}`, { ...opts, headers });
}
