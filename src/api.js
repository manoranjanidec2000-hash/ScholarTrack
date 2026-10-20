const API_BASE = import.meta.env.VITE_API_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

export const api = {
  dashboard: () => request('/dashboard'),
  scholarships: (params = {}) => request(`/scholarships?${new URLSearchParams(params)}`),
  scholarshipFilters: () => request('/scholarships/filters'),
  scholarship: (id) => request(`/scholarships/${id}`),
  alerts: () => request('/alerts'),
  adminStatus: () => request('/admin/status'),
  refresh: () => request('/admin/refresh', { method: 'POST' }),
  addSource: (body) => request('/admin/sources', { method: 'POST', body: JSON.stringify(body) }),
  retrySource: (id) => request(`/admin/retry/${id}`, { method: 'POST' })
};