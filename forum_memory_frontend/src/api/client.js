const BASE = '/api/v1';

/**
 * 获取当前工号。
 * 优先从 localStorage 读取，没有则默认 '00000000'（超级管理员）。
 */
function getEmployeeId() {
  return localStorage.getItem('employeeId') || '00000000';
}

/** 设置当前工号 */
export function setEmployeeId(id) {
  localStorage.setItem('employeeId', id);
}

async function request(url, options = {}) {
  const res = await fetch(`${BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      'X-Employee-Id': getEmployeeId(),
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

const get = (url) => request(url);
const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) });
const put = (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) });
const del = (url) => request(url, { method: 'DELETE' });

// ── Users ────────────────────────────────────
export const userApi = {
  me: () => get('/users/me'),
  list: () => get('/users'),
  create: (data) => post('/users', data),
  deactivate: (id) => del(`/users/${id}`),
};

// ── Namespaces ───────────────────────────────
export const namespaceApi = {
  list: () => get('/namespaces'),
  get: (id) => get(`/namespaces/${id}`),
  create: (data) => post('/namespaces', data),
  update: (id, data) => put(`/namespaces/${id}`, data),
  stats: (id) => get(`/namespaces/${id}/stats`),
  updateDict: (id, entries) => put(`/namespaces/${id}/dictionary`, { entries }),
};

// ── Threads ──────────────────────────────────
export const threadApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    if (params.status) q.set('status', params.status);
    q.set('page', params.page || 1);
    q.set('size', params.size || 20);
    return get(`/threads?${q}`);
  },
  get: (id) => get(`/threads/${id}`),
  create: (data) => post('/threads', data),
  resolve: (id, bestAnswerId) => post(`/threads/${id}/resolve`, { best_answer_id: bestAnswerId }),
  timeoutClose: (id) => post(`/threads/${id}/timeout-close`),
  comments: (id) => get(`/threads/${id}/comments`),
  addComment: (id, content) => post(`/threads/${id}/comments`, { thread_id: id, content }),
};

// ── Memories ─────────────────────────────────
export const memoryApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
    return get(`/memories?${q}`);
  },
  get: (id) => get(`/memories/${id}`),
  create: (data) => post('/memories', data),
  update: (id, data) => put(`/memories/${id}`, data),
  delete: (id) => del(`/memories/${id}`),
  changeAuthority: (id, data) => put(`/memories/${id}/authority`, data),
  search: (data) => post('/memories/search', data),
  extract: (threadId) => post(`/memories/extract/${threadId}`),
};

// ── Feedback ─────────────────────────────────
export const feedbackApi = {
  submit: (memoryId, data) => post(`/memories/${memoryId}/feedback`, data),
  list: (memoryId) => get(`/memories/${memoryId}/feedback`),
  summary: (memoryId) => get(`/memories/${memoryId}/feedback/summary`),
};