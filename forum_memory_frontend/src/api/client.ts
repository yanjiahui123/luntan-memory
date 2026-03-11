import type {
  User, Namespace, NamespaceStats, AggregateStats,
  Thread, ThreadStatus, Comment,
  Memory, MemoryAuthority, KnowledgeType,
  Feedback, FeedbackSummary, FeedbackType,
  Moderator, DictionaryEntry,
  PaginatedResult, AuthLoginResponse, UploadResponse, ImportResult, QualityAlert,
  MemorySearchResponse, ImportJob, ImportJobDetail,
} from '../types';

const BASE = '/api/v1';

/**
 * 获取当前工号。
 * 优先从 localStorage 读取，没有则默认 '00000000'（超级管理员）。
 */
function getEmployeeId(): string {
  return localStorage.getItem('employeeId') || '00000000';
}

/** 设置当前工号 */
export function setEmployeeId(id: string): void {
  localStorage.setItem('employeeId', id);
}

/** JWT token management */
export function getToken(): string {
  return localStorage.getItem('jwt_token') || '';
}

export function setToken(token: string): void {
  localStorage.setItem('jwt_token', token);
}

export function clearToken(): void {
  localStorage.removeItem('jwt_token');
}

/** Build auth headers: prefer JWT Bearer token, fallback to X-Employee-Id */
function authHeaders(): Record<string, string> {
  const token = getToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return { 'X-Employee-Id': getEmployeeId() };
}

/** Handle 401 responses: clear stale token and redirect to login */
function handleUnauthorized(): void {
  clearToken();
  // Avoid redirect loops: only redirect if not already on login-related page
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/boards';
  }
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

async function request<T>(url: string, options: RequestOptions = {}): Promise<T> {
  const { headers: extraHeaders, signal: callerSignal, ...restOptions } = options;
  const signal = callerSignal ?? AbortSignal.timeout(30_000);
  const res = await fetch(`${BASE}${url}`, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...extraHeaders,
    },
    ...restOptions,
  });
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || 'Request failed');
  }
  if (res.status === 204) return null as T;
  return res.json() as Promise<T>;
}

/** Like request(), but also reads X-Total-Count header for paginated lists. */
async function requestPaginated<T>(url: string, options: RequestOptions = {}): Promise<PaginatedResult<T>> {
  const { headers: extraHeaders, signal: callerSignal, ...restOptions } = options;
  const signal = callerSignal ?? AbortSignal.timeout(30_000);
  const res = await fetch(`${BASE}${url}`, {
    signal,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...extraHeaders,
    },
    ...restOptions,
  });
  if (!res.ok) {
    if (res.status === 401) {
      handleUnauthorized();
    }
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error((err as { detail?: string }).detail || 'Request failed');
  }
  const items = await res.json() as T[];
  const total = parseInt(res.headers.get('X-Total-Count') || '0', 10);
  return { items, total };
}

const get = <T>(url: string) => request<T>(url);
const post = <T>(url: string, body?: unknown) => request<T>(url, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(url: string, body?: unknown) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(url: string) => request<T>(url, { method: 'DELETE' });

// ── Auth ─────────────────────────────────────
export const authApi = {
  login: (employeeId: string) => post<AuthLoginResponse>('/auth/login', { employee_id: employeeId }),
};

// ── Users ────────────────────────────────────
export const userApi = {
  me: () => get<User>('/users/me'),
  myNamespaces: () => get<Namespace[]>('/users/me/managed-namespaces'),
  list: () => get<User[]>('/users'),
  create: (data: Partial<User>) => post<User>('/users', data),
  deactivate: (id: string) => del<null>(`/users/${id}`),
};

// ── Namespaces ───────────────────────────────
export const namespaceApi = {
  list: () => get<Namespace[]>('/namespaces'),
  get: (id: string) => get<Namespace>(`/namespaces/${id}`),
  create: (data: Partial<Namespace>) => post<Namespace>('/namespaces', data),
  update: (id: string, data: Partial<Namespace>) => put<Namespace>(`/namespaces/${id}`, data),
  delete: (id: string) => del<null>(`/namespaces/${id}`),
  stats: (id: string) => get<NamespaceStats>(`/namespaces/${id}/stats`),
  aggregateStats: () => get<AggregateStats>('/namespaces/stats/aggregate'),
  updateDict: (id: string, entries: DictionaryEntry[]) => put<null>(`/namespaces/${id}/dictionary`, { entries }),
  listModerators: (id: string) => get<Moderator[]>(`/namespaces/${id}/moderators`),
  addModerator: (id: string, employeeId: string, displayName?: string) =>
    post<Moderator>(`/namespaces/${id}/moderators`, { employee_id: employeeId, ...(displayName ? { display_name: displayName } : {}) }),
  removeModerator: (id: string, userId: string) => del<null>(`/namespaces/${id}/moderators/${userId}`),
};

// ── Threads ──────────────────────────────────
export interface ThreadListParams {
  namespace_id?: string;
  status?: ThreadStatus;
  author_id?: string;
  priority?: string;
  q?: string;
  page?: number;
  size?: number;
}

export const threadApi = {
  list: (params: ThreadListParams = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    if (params.status) q.set('status', params.status);
    if (params.author_id) q.set('author_id', params.author_id);
    if (params.priority) q.set('priority', params.priority);
    if (params.q) q.set('q', params.q);
    q.set('page', String(params.page ?? 1));
    q.set('size', String(params.size ?? 20));
    return requestPaginated<Thread>(`/threads?${q}`);
  },
  get: (id: string) => get<Thread>(`/threads/${id}`),
  create: (data: { namespace_id: string; title: string; content: string }) => post<Thread>('/threads', data),
  delete: (id: string) => del<null>(`/threads/${id}`),
  resolve: (id: string, bestAnswerId: string | null) => post<Thread>(`/threads/${id}/resolve`, { best_answer_id: bestAnswerId }),
  timeoutClose: (id: string) => post<Thread>(`/threads/${id}/timeout-close`),
  comments: (id: string) => get<Comment[]>(`/threads/${id}/comments`),
  addComment: (id: string, content: string) => post<Comment>(`/threads/${id}/comments`, { thread_id: id, content }),
  upvoteComment: (threadId: string, commentId: string) => post<Comment>(`/threads/${threadId}/comments/${commentId}/upvote`),
  deleteComment: (threadId: string, commentId: string) => del<null>(`/threads/${threadId}/comments/${commentId}`),
  aiAnswer: (threadId: string) => post<null>(`/threads/${threadId}/ai-answer`),
};

// ── Memories ─────────────────────────────────
export interface MemoryListParams {
  namespace_id?: string;
  lifecycle_status?: string;
  knowledge_type?: KnowledgeType;
  tags?: string;
  pending_human_confirm?: boolean;
  q?: string;
  page?: number;
  size?: number;
}

export const memoryApi = {
  list: (params: MemoryListParams = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
    return requestPaginated<Memory>(`/memories?${q}`);
  },
  get: (id: string) => get<Memory>(`/memories/${id}`),
  create: (data: Partial<Memory>) => post<Memory>('/memories', data),
  update: (id: string, data: Partial<Memory>) => put<Memory>(`/memories/${id}`, data),
  delete: (id: string) => del<null>(`/memories/${id}`),
  restore: (id: string) => put<Memory>(`/memories/${id}/restore`),
  changeAuthority: (id: string, data: { authority: MemoryAuthority }) => put<Memory>(`/memories/${id}/authority`, data),
  search: (data: { query: string; namespace_id?: string; top_k?: number }) => post<MemorySearchResponse>('/memories/search', data),
  extract: (threadId: string) => post<null>(`/memories/extract/${threadId}`),
  batchGet: (ids: string[]) => post<Memory[]>('/memories/batch', { ids }),
  tags: (namespaceId?: string) => {
    const q = new URLSearchParams();
    if (namespaceId) q.set('namespace_id', namespaceId);
    return get<string[]>(`/memories/tags?${q}`);
  },
};

// ── Feedback ─────────────────────────────────
export const feedbackApi = {
  submit: (memoryId: string, data: { feedback_type: FeedbackType }) => post<Feedback>(`/memories/${memoryId}/feedback`, data),
  withdraw: (memoryId: string, data: { feedback_type: FeedbackType }) =>
    request<null>(`/memories/${memoryId}/feedback`, { method: 'DELETE', body: JSON.stringify(data) }),
  list: (memoryId: string) => get<Feedback[]>(`/memories/${memoryId}/feedback`),
  summary: (memoryId: string) => get<FeedbackSummary>(`/memories/${memoryId}/feedback/summary`),
};

// ── Admin ─────────────────────────────────────
export interface AdminListParams {
  namespace_id?: string;
  page?: number;
  size?: number;
}

export interface ImportOptions {
  workers?: number;
  skipExtraction?: boolean;
  dryRun?: boolean;
}

export const adminApi = {
  qualityAlerts: (params: AdminListParams = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    q.set('page', String(params.page ?? 1));
    q.set('size', String(params.size ?? 50));
    return get<PaginatedResult<QualityAlert>>(`/admin/quality-alerts?${q}`);
  },
  dismissAlert: (memoryId: string) => post<null>(`/admin/quality-alerts/${memoryId}/dismiss`),
  auditLogs: (params: { memory_id?: string; operation?: string; page?: number; size?: number } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
    return requestPaginated<import('../types').OperationLog>(`/admin/audit-logs?${q}`);
  },
  /**
   * 通过文件上传批量导入历史帖子（异步，立即返回 job_id）。
   * 用 importJobStatus(job_id) 轮询进度。
   */
  importTopicsUpload: (namespaceId: string, files: File[], opts: ImportOptions = {}): Promise<ImportJob> => {
    const form = new FormData();
    form.append('namespace_id', namespaceId);
    form.append('workers', String(opts.workers ?? 4));
    form.append('skip_extraction', String(opts.skipExtraction ?? false));
    form.append('dry_run', String(opts.dryRun ?? false));
    files.forEach(f => form.append('files', f));
    return fetch(`${BASE}/admin/import-topics/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(120_000),  // 仅等待文件上传 + 校验（2分钟）
    }).then(async res => {
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error((err as { detail?: string }).detail || 'Import failed');
      }
      return res.json() as Promise<ImportJob>;
    });
  },

  /** 查询异步导入任务状态 */
  importJobStatus: (jobId: string): Promise<ImportJobDetail> =>
    get<ImportJobDetail>(`/admin/import-jobs/${jobId}`),
};

// ── Uploads ──────────────────────────────────
export const uploadApi = {
  upload: (file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/uploads`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(60_000),  // 60 秒，单文件上传
    }).then(res => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<UploadResponse>;
    });
  },
};
