import type {
  User, Namespace, NamespaceStats, AggregateStats,
  Thread, ThreadStatus, Comment, AppNotification,
  Memory, MemoryAuthority, KnowledgeType,
  Feedback, FeedbackSummary, FeedbackType,
  Moderator, DictionaryEntry,
  PaginatedResult, AuthLoginResponse, UploadResponse, ImportResult, QualityAlert,
  MemorySearchResponse, ImportJob, ImportJobDetail, MemoryRelation,
  NamespaceMember, NamespaceInvite, UserSearchResult, DeptOption,
} from '../types';

const BASE = import.meta.env.VITE_APP_API_BASE_URL;

/**
 * Build auth headers.
 * JWT Bearer token (if available), otherwise empty — SSO cookies are
 * sent automatically by the browser via credentials: 'include'.
 */
function authHeaders(): Record<string, string> {
  return {};
}

export const w3loginProd: () => void = () => {
  const redirectUrl = encodeURIComponent(window.location.href);
  window.location.href = `https://login.yjh.com/login1/?redirect=${redirectUrl}`;
};

/** Handle 401 responses: clear stale token and redirect */
function handleUnauthorized(): void {
  // Avoid redirect loops: only redirect if not already on login-related page
  w3loginProd();
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
    credentials: 'include',
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
    credentials: 'include',
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
const post = <T>(url: string, body?: unknown, signal?: AbortSignal) =>
  request<T>(url, { method: 'POST', body: JSON.stringify(body), ...(signal ? { signal } : {}) });
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
  followedBoards: () => get<Namespace[]>('/users/me/followed-boards'),
  list: () => get<User[]>('/users'),
  create: (data: Partial<User>) => post<User>('/users', data),
  update: (id: string, data: Partial<User>) => put<User>(`/users/${id}`, data),
  search: (q: string) => get<UserSearchResult[]>(`/users/search?q=${encodeURIComponent(q)}`),
  departments: () => get<DeptOption[]>('/users/departments'),
};

// ── Namespaces ───────────────────────────────
export const namespaceApi = {
  list: (page = 1, size = 20) => requestPaginated<Namespace>(`/namespaces?page=${page}&size=${size}`),
  get: (id: string) => get<Namespace>(`/namespaces/${id}`),
  follow: (id: string) => post<{ followed: boolean }>(`/namespaces/${id}/follow`),
  unfollow: (id: string) => del<{ followed: boolean }>(`/namespaces/${id}/follow`),
  checkFollow: (id: string) => get<{ followed: boolean }>(`/namespaces/${id}/follow`),
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
  sort?: string;
  page?: number;
  size?: number;
  tags?: string;
  environment?: string;
}

export const threadApi = {
  list: (params: ThreadListParams = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    if (params.status) q.set('status', params.status);
    if (params.author_id) q.set('author_id', params.author_id);
    if (params.priority) q.set('priority', params.priority);
    if (params.q) q.set('q', params.q);
    if (params.sort) q.set('sort', params.sort);
    q.set('page', String(params.page ?? 1));
    q.set('size', String(params.size ?? 20));
    return requestPaginated<Thread>(`/threads?${q}`);
  },
  get: (id: string) => get<Thread>(`/threads/${id}`),
  create: (data: { namespace_id: string; title: string; content: string }) => post<Thread>('/threads', data),
  delete: (id: string) => del<null>(`/threads/${id}`),
  resolve: (id: string, bestAnswerId: string | null) => post<Thread>(`/threads/${id}/resolve`, { best_answer_id: bestAnswerId }),
  close: (id: string) => post<Thread>(`/threads/${id}/close`),
  adoptAnswer: (id: string, bestAnswerId: string) => post<Thread>(`/threads/${id}/adopt-answer`, { best_answer_id: bestAnswerId }),
  reopen: (id: string) => post<Thread>(`/threads/${id}/reopen`),
  timeoutClose: (id: string) => post<Thread>(`/threads/${id}/timeout-close`),
  comments: (id: string) => get<Comment[]>(`/threads/${id}/comments`),
  addComment: (id: string, content: string, replyToCommentId?: string) =>
    post<Comment>(`/threads/${id}/comments`, {
      thread_id: id, content,
      reply_to_comment_id: replyToCommentId ?? null,
    }),
  upvoteComment: (threadId: string, commentId: string) => post<Comment>(`/threads/${threadId}/comments/${commentId}/upvote`),
  deleteComment: (threadId: string, commentId: string) => del<null>(`/threads/${threadId}/comments/${commentId}`),
  aiAnswer: (threadId: string) => post<null>(`/threads/${threadId}/ai-answer`),
  recordView: (threadId: string) => post<null>(`/threads/${threadId}/view`),
};

// ── Memories ─────────────────────────────────
export interface MemoryListParams {
  namespace_id?: string;
  status?: string;
  knowledge_type?: KnowledgeType;
  tags?: string;
  pending_confirm?: boolean;
  pending_review?: boolean;
  pending_reason?: string; // 单值或逗号分隔多值（如 "AUDN_CONFLICT,AUDN_SUPPLEMENT_LOCKED"）
  quality_score_max?: number;
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
  mine: (memoryId: string) => get<{ feedback_type: FeedbackType | null }>(`/memories/${memoryId}/feedback/mine`),
  summary: (memoryId: string) => get<FeedbackSummary>(`/memories/${memoryId}/feedback/summary`),
};

// ── Relations ─────────────────────────────────
export const relationApi = {
  list: (memoryId: string) => get<MemoryRelation[]>(`/memories/${memoryId}/relations`),
  create: (memoryId: string, data: { target_memory_id: string; relation_type: string; confidence?: number }) =>
    post<MemoryRelation>(`/memories/${memoryId}/relations`, data),
  delete: (relationId: string) => del<null>(`/memories/relations/${relationId}`),
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
  contradictions: (params: AdminListParams = {}) => {
    const q = new URLSearchParams();
    if (params.namespace_id) q.set('namespace_id', params.namespace_id);
    q.set('page', String(params.page ?? 1));
    q.set('size', String(params.size ?? 20));
    return get<PaginatedResult<MemoryRelation>>(`/admin/contradictions?${q}`);
  },
  resolveContradiction: (relationId: string, data: { action: string; reason?: string }) =>
    post<{ resolved: boolean; action: string; detail: string }>(
      `/admin/contradictions/${relationId}/resolve`, data,
    ),
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
      credentials: 'include',
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

// ── Notifications ────────────────────────────
export const notificationApi = {
  unreadCount: () => get<{ unread_count: number }>('/notifications/unread-count'),
  list: (params: { page?: number; size?: number; unread_only?: boolean } = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') q.set(k, String(v)); });
    return requestPaginated<AppNotification>(`/notifications?${q}`);
  },
  markRead: (notifId: string) => post<null>(`/notifications/${notifId}/read`),
  markAllRead: () => post<null>('/notifications/read-all'),
};

// ── Members ─────────────────────────────────
export const memberApi = {
  list: (nsId: string, role?: string) => {
    const q = new URLSearchParams();
    if (role) q.set('role', role);
    return get<NamespaceMember[]>(`/namespaces/${nsId}/members?${q}`);
  },
  add: (nsId: string, employeeId: string, role = 'member') =>
    post<NamespaceMember>(`/namespaces/${nsId}/members`, { employee_id: employeeId, role }),
  batchAdd: (nsId: string, employeeIds: string[], role = 'member') =>
    post<{ added: number; skipped: number; errors: string[] }>(`/namespaces/${nsId}/members/batch`, { employee_ids: employeeIds, role }),
  batchAddByDept: (nsId: string, deptCode: string, role = 'member') =>
    post<{ added: number; skipped: number; errors: string[]; total_in_dept: number }>(
      `/namespaces/${nsId}/members/batch-by-dept`,
      { dept_code: deptCode, role },
      AbortSignal.timeout(120_000),
    ),
  updateRole: (nsId: string, userId: string, role: string) =>
    put<{ user_id: string; role: string }>(`/namespaces/${nsId}/members/${userId}/role`, { role }),
  remove: (nsId: string, userId: string) => del<null>(`/namespaces/${nsId}/members/${userId}`),
  batchRemove: (nsId: string, userIds: string[]) =>
    post<{ removed: number; errors: string[] }>(`/namespaces/${nsId}/members/batch-delete`, { user_ids: userIds }),
};

// ── Invites ─────────────────────────────────
export const inviteApi = {
  create: (nsId: string, data: { role?: string; max_uses?: number | null; expires_hours?: number | null }) =>
    post<NamespaceInvite>(`/namespaces/${nsId}/invites`, data),
  list: (nsId: string) => get<NamespaceInvite[]>(`/namespaces/${nsId}/invites`),
  revoke: (nsId: string, inviteId: string) => del<null>(`/namespaces/${nsId}/invites/${inviteId}`),
  getInfo: (code: string) => get<{ namespace_id: string; namespace_display_name: string; role: string; expires_at: string | null }>(`/invites/${code}`),
  join: (code: string) => post<{ namespace_id: string; namespace_display_name: string; role: string }>(`/invites/${code}/join`),
};

// ── Share Links ────────────────────────────────
export const shareLinkApi = {
  create: (data: { name: string; namespace_ids: string[] }) =>
    post<import('../types').BoardShareLink>('/share-links', data),
  list: () => get<import('../types').BoardShareLink[]>('/share-links'),
  revoke: (linkId: string) => del<null>(`/share-links/${linkId}`),
  getInfo: (code: string) =>
    get<import('../types').BoardShareLinkInfo>(`/share-links/code/${code}`),
  join: (code: string) =>
    post<{ joined: import('../types').BoardShareLinkNamespaceInfo[]; count: number }>(`/share-links/code/${code}/join`),
};

// ── Uploads ──────────────────────────────────
export const uploadApi = {
  upload: (file: File): Promise<UploadResponse> => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/uploads`, {
      method: 'POST',
      credentials: 'include',
      headers: authHeaders(),
      body: form,
      signal: AbortSignal.timeout(60_000),  // 60 秒，单文件上传
    }).then(res => {
      if (!res.ok) throw new Error('Upload failed');
      return res.json() as Promise<UploadResponse>;
    });
  },
};
