// ── Domain models ──────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'board_admin' | 'user';

export interface User {
  id: string;
  employee_id: string;
  username?: string;
  display_name: string;
  email?: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface NamespaceConfig {
  enable_memory_search?: boolean;
  enable_rag_search?: boolean;
  kb_sn_list?: string[];
  dictionary?: Record<string, string>;
  [key: string]: unknown;
}

export interface Namespace {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
  es_index_name: string | null;
  is_active: boolean;
  access_mode?: string;
  config?: NamespaceConfig;
  dictionary?: Record<string, string>;
  thread_count?: number;
  open_thread_count?: number;
  created_at: string;
}

export interface NamespaceStats {
  namespace_id: string;
  thread_count: number;
  memory_count: number;
  open_thread_count: number;
  open_threads?: number;
  resolved_thread_count: number;
  resolved_threads?: number;
  ai_resolve_rate?: number;
  pending_count?: number;
  total_memories?: number;
  locked_memories?: number;
  total_threads?: number;
}

export interface AggregateStats {
  total_threads: number;
  total_memories: number;
  total_namespaces: number;
  open_threads: number;
  ai_resolve_rate?: number;
  resolved_threads?: number;
  pending_count?: number;
  locked_memories?: number;
}

export type ThreadStatus = 'OPEN' | 'RESOLVED' | 'TIMEOUT_CLOSED' | 'DELETED';

export interface Thread {
  id: string;
  namespace_id: string;
  title: string;
  content: string;
  status: ThreadStatus;
  author_id: string;
  author_name?: string;
  author_display_name?: string;
  comment_count: number;
  view_count?: number;
  tags?: string[];
  priority?: string;
  resolved_type?: string;
  environment?: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  best_answer_id: string | null;
}

export interface RagChunk {
  text: string;
  metadata?: {
    source?: string;
    extended_metadata?: {
      title?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

export interface Comment {
  id: string;
  thread_id: string;
  content: string;
  author_id: string;
  author_name?: string;
  author_display_name?: string;
  author_role?: string;
  is_ai: boolean;
  is_best_answer?: boolean;
  upvote_count: number;
  cited_memory_ids: string[];
  rag_context?: string | RagChunk[] | null;
  reply_to_comment_id?: string | null;
  reply_to_author_display_name?: string | null;
  reply_to_content_preview?: string | null;
  created_at: string;
}

export interface AppNotification {
  id: string;
  notification_type: 'comment_on_thread' | 'reply_to_comment';
  actor_display_name: string | null;
  thread_id: string;
  thread_title: string | null;
  comment_id: string | null;
  is_read: boolean;
  created_at: string;
}

export type MemoryLifecycle = 'ACTIVE' | 'COLD' | 'ARCHIVED' | 'DELETED';
export type MemoryAuthority = 'LOCKED' | 'NORMAL';
export type KnowledgeType = 'how_to' | 'troubleshoot' | 'best_practice' | 'gotcha' | 'faq';

export interface Memory {
  id: string;
  namespace_id: string;
  title?: string;
  content: string;
  tags?: string[] | null;
  knowledge_type: KnowledgeType | null;
  authority: MemoryAuthority;
  /** The API may return lifecycle status as either `lifecycle_status` or `status` */
  lifecycle_status?: MemoryLifecycle;
  status?: MemoryLifecycle;
  quality_score: number;
  source_thread_id?: string | null;
  source_id?: string | null;
  source_type?: string;
  source_role?: string;
  resolved_type?: string;
  environment?: string;
  pending_human_confirm: boolean;
  wrong_count: number;
  retrieve_count: number;
  cite_count: number;
  resolved_citation_count: number;
  useful_count?: number;
  not_useful_count?: number;
  outdated_count?: number;
  indexed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type RelationType = 'SUPPLEMENTS' | 'CONTRADICTS' | 'SUPERSEDES' | 'CAUSED_BY';

export interface RelatedMemoryHint {
  relation_type: RelationType;
  label: string;
  memory_id: string;
  content_preview: string;
  confidence?: number;
  authority?: string;
}

export interface MemoryRelation {
  id: string;
  source_memory_id: string;
  target_memory_id: string;
  relation_type: RelationType;
  confidence: number;
  origin: string;
  created_at: string;
}

export interface MemorySearchHit {
  memory: Memory;
  score: number;
  env_match?: boolean;
  env_warning?: string;
  related?: RelatedMemoryHint[];
}

export interface MemorySearchResponse {
  hits: MemorySearchHit[];
  query_expanded?: string;
  total_recalled?: number;
}

export type FeedbackType = 'useful' | 'wrong' | 'outdated';

export interface Feedback {
  id: string;
  memory_id: string;
  user_id: string;
  feedback_type: FeedbackType;
  created_at: string;
}

export interface FeedbackSummary {
  useful: number;
  wrong: number;
  outdated: number;
  total: number;
  user_feedback: FeedbackType | null;
  useful_ratio?: number;
}

export interface Moderator {
  id: string;
  employee_id: string;
  display_name: string;
}

export interface DictionaryEntry {
  slang: string;
  canonical: string;
}

// ── Operation log ──────────────────────────────────────────────────────────

export interface OperationLog {
  id: string;
  memory_id: string;
  operation: string;
  operator_id: string | null;
  operator_type: string;
  reason: string | null;
  before_snapshot: Record<string, unknown> | null;
  after_snapshot: Record<string, unknown> | null;
  created_at: string;
}

// ── API response shapes ────────────────────────────────────────────────────

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface AuthLoginResponse {
  access_token: string;
  token_type: string;
  employee_id: string;
}

export interface UploadResponse {
  url: string;
  filename: string;
}

export interface ImportResult {
  total?: number;
  imported: number;
  skipped: number;
  failed?: number;
  errors: string[];
  resolved?: number;
  extracted?: number;
  extract_failed?: number;
  [key: string]: number | string[] | undefined;
}

// ── Import job (async) ────────────────────────────────────────────────────

export type ImportJobStatus = 'pending' | 'running' | 'done' | 'error';

export interface ImportJob {
  job_id: string;
  status: ImportJobStatus;
  total_files: number;
  created_at: string;
}

export interface ImportJobDetail extends ImportJob {
  result: ImportResult | null;
  error: string | null;
  finished_at: string | null;
}

export interface QualityAlert {
  id: string;
  content: string;
  authority: MemoryAuthority;
  quality_score: number;
  wrong_count: number;
  outdated_count?: number;
  useful_count?: number;
  cite_count?: number;
  resolved_citation_count?: number;
  tags?: string[];
}
