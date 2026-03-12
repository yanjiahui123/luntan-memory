import React from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { threadApi, namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUrlState } from '../hooks/useUrlState';
import { useUser } from '../contexts/UserContext';
import { Loading, ErrorMsg, EmptyState, StatusBadge, Badge, TimeAgo, Pagination, PriorityBadge } from '../components/UI';
import type { Thread, ThreadStatus } from '../types';

const PAGE_SIZE = 20;

const STATUSES: { value: ThreadStatus | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'OPEN', label: '进行中' },
  { value: 'RESOLVED', label: '已解决' },
  { value: 'TIMEOUT_CLOSED', label: '已超时' },
];

export default function ThreadList() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useUrlState('status', '') as [string, (v: string) => void];
  const [page, setPage] = useUrlState('page', 1);

  const { data: board } = useAsync(() => namespaceApi.get(boardId!), [boardId]);
  const { data, loading, error, refetch } = useAsync(
    () => threadApi.list({ namespace_id: boardId, status: status || undefined, page, size: PAGE_SIZE }),
    [boardId, status, page]
  );
  const threads = data?.items;
  const totalCount = data?.total || 0;
  const { isSuperAdmin, isBoardAdmin, myNamespaces } = useUser();
  const canManageBoard = isSuperAdmin || (isBoardAdmin && myNamespaces?.some(ns => ns.id === boardId));

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span> <span>{board?.display_name || '加载中...'}</span>
      </div>

      <div className="page-header">
        <h1 className="page-title">{board?.display_name || '帖子列表'}</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          {canManageBoard && (
            <button
              className="btn-secondary"
              onClick={() => navigate(`/admin/boards/${boardId}`)}
              title="进入板块管理后台"
            >
              ⚙️ 管理此板块
            </button>
          )}
          <button className="btn-primary" onClick={() => navigate(`/boards/${boardId}/new`)}>+ 发帖</button>
        </div>
      </div>

      <div className="filter-bar">
        {STATUSES.map(s => (
          <button key={s.value} className={`filter-pill ${status === s.value ? 'filter-pill--active' : ''}`} onClick={() => { setStatus(s.value as string); setPage(1); }}>
            {s.label}
          </button>
        ))}
      </div>

      {(() => {
        if (loading) return <Loading />;
        if (error) return <ErrorMsg message={error} onRetry={refetch} />;
        if (!threads?.length) return <EmptyState icon="💬" message="还没有帖子" />;
        return (
          <div className="card" style={{ padding: '0 16px' }}>
            {threads.map(t => <ThreadItem key={t.id} thread={t} />)}
          </div>
        );
      })()}

      <Pagination page={page} total={totalCount} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function ThreadItem({ thread }: { thread: Thread }) {
  const hasUpdate = thread.updated_at && thread.updated_at !== thread.created_at;
  return (
    <div className="thread-item">
      <div style={{ flex: 1 }}>
        <Link to={`/threads/${thread.id}`} className="thread-item__title" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          {thread.title}
        </Link>
        <div className="thread-item__meta">
          <StatusBadge status={thread.status} />
          <PriorityBadge priority={thread.priority} />
          {thread.author_display_name && <span style={{ color: 'var(--text-ter)' }}>👤 {thread.author_display_name}</span>}
          {thread.environment && <Badge type="gray">🌍 {thread.environment}</Badge>}
          {thread.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
        </div>
      </div>
      <div className="thread-item__right">
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--text-ter)' }}>👁 {thread.view_count ?? 0}</span>
          <span>{thread.comment_count} 回复</span>
        </div>
        <TimeAgo date={thread.created_at} />
        {hasUpdate && (
          <div style={{ fontSize: 11, color: 'var(--text-ter)' }}>更新: <TimeAgo date={thread.updated_at} /></div>
        )}
      </div>
    </div>
  );
}
