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
  const { headers: extraHeaders, signal: callerSignal, ...restOptions } = options;
  const signal = callerSignal ?? AbortSignal.timeout(30_000);
  const res = await fetch(`${BASE}${url}`, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Employee-Id': getEmployeeId(),
      ...extraHeaders,
    },
    ...restOptions,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Like request(), but also reads X-Total-Count header for paginated lists. */
async function requestPaginated(url, options = {}) {
  const { headers: extraHeaders, signal: callerSignal, ...restOptions } = options;
  const signal = callerSignal ?? AbortSignal.timeout(30_000);
  const res = await fetch(`${BASE}${url}`, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      'X-Employee-Id': getEmployeeId(),
      ...extraHeaders,
    },
    ...restOptions,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  const items = await res.json();
  const total = parseInt(res.headers.get('X-Total-Count') || '0', 10);
  return { items, total };
}

const get = (url) => request(url);
const post = (url, body) => request(url, { method: 'POST', body: JSON.stringify(body) });
const put = (url, body) => request(url, { method: 'PUT', body: JSON.stringify(body) });
const del = (url) => request(url, { method: 'DELETE' });

// ── Users ────────────────────────────────────
export const userApi = {
  me: () => get('/users/me'),
  myNamespaces: () => get('/users/me/managed-namespaces'),
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
  delete: (id) => del(`/namespaces/${id}`),
  stats: (id) => get(`/namespaces/${id}/stats`),
  aggregateStats: () => get('/namespaces/stats/aggregate'),
  updateDict: (id, entries) => put(`/namespaces/${id}/dictionary`, { entries }),
  listModerators: (id) => get(`/namespaces/${id}/moderators`),
  addModerator: (id, employeeId, displayName) => post(`/namespaces/${id}/moderators`, { employee_id: employeeId, ...(displayName ? { display_name: displayName } : {}) }),
  removeModerator: (id, userId) => del(`/namespaces/${id}/moderators/${userId}`),
};

// ── Threads ──────────────────────────────────
export const threadApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    if (params.status) q.set('status', params.status);
    if (params.q) q.set('q', params.q);
    q.set('page', params.page || 1);
    q.set('size', params.size || 20);
    return requestPaginated(`/threads?${q}`);
  },
  get: (id) => get(`/threads/${id}`),
  create: (data) => post('/threads', data),
  delete: (id) => del(`/threads/${id}`),
  resolve: (id, bestAnswerId) => post(`/threads/${id}/resolve`, { best_answer_id: bestAnswerId }),
  timeoutClose: (id) => post(`/threads/${id}/timeout-close`),
  comments: (id) => get(`/threads/${id}/comments`),
  addComment: (id, content) => post(`/threads/${id}/comments`, { thread_id: id, content }),
  upvoteComment: (threadId, commentId) => post(`/threads/${threadId}/comments/${commentId}/upvote`),
  deleteComment: (threadId, commentId) => del(`/threads/${threadId}/comments/${commentId}`),
  aiAnswer: (threadId) => post(`/threads/${threadId}/ai-answer`),
};

// ── Memories ─────────────────────────────────
export const memoryApi = {
  list: (params = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
    return requestPaginated(`/memories?${q}`);
  },
  get: (id) => get(`/memories/${id}`),
  create: (data) => post('/memories', data),
  update: (id, data) => put(`/memories/${id}`, data),
  delete: (id) => del(`/memories/${id}`),
  changeAuthority: (id, data) => put(`/memories/${id}/authority`, data),
  search: (data) => post('/memories/search', data),
  extract: (threadId) => post(`/memories/extract/${threadId}`),
  batchGet: (ids) => post('/memories/batch', { ids }),
  tags: (namespaceId) => {
    const q = new URLSearchParams();
    if (namespaceId) q.set('namespace_id', namespaceId);
    return get(`/memories/tags?${q}`);
  },
};

// ── Feedback ─────────────────────────────────
export const feedbackApi = {
  submit: (memoryId, data) => post(`/memories/${memoryId}/feedback`, data),
  withdraw: (memoryId, data) => request(`/memories/${memoryId}/feedback`, { method: 'DELETE', body: JSON.stringify(data) }),
  list: (memoryId) => get(`/memories/${memoryId}/feedback`),
  summary: (memoryId) => get(`/memories/${memoryId}/feedback/summary`),
};

// ── Admin ─────────────────────────────────────
export const adminApi = {
  qualityAlerts: (params = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    q.set('page', params.page || 1);
    q.set('size', params.size || 50);
    return get(`/admin/quality-alerts?${q}`);
  },
  dismissAlert: (memoryId) => post(`/admin/quality-alerts/${memoryId}/dismiss`),
  /**
   * 通过文件上传批量导入历史帖子。
   * @param {string} namespaceId  - 目标板块 UUID
   * @param {File[]} files        - JSON 文件或 ZIP 压缩包数组
   * @param {object} opts         - { workers, skipExtraction, dryRun }
   */
  importTopicsUpload: (namespaceId, files, opts = {}) => {
    const form = new FormData();
    form.append('namespace_id', namespaceId);
    form.append('workers', String(opts.workers ?? 4));
    form.append('skip_extraction', String(opts.skipExtraction ?? false));
    form.append('dry_run', String(opts.dryRun ?? false));
    files.forEach(f => form.append('files', f));
    return fetch(`${BASE}/admin/import-topics/upload`, {
      method: 'POST',
      headers: { 'X-Employee-Id': getEmployeeId() },
      body: form,
      signal: AbortSignal.timeout(300_000),  // 5 分钟，批量导入文件可能较大
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(err.detail || 'Import failed');
      }
      return res.json();
    });
  },
};

// ── Uploads ──────────────────────────────────
export const uploadApi = {
  upload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/uploads`, {
      method: 'POST',
      headers: { 'X-Employee-Id': getEmployeeId() },
      body: form,
      signal: AbortSignal.timeout(60_000),  // 60 秒，单文件上传
    }).then(res => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json();
    });
  },
};