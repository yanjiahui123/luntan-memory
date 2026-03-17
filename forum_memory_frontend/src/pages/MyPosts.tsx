import React from 'react';
import { Link } from 'react-router-dom';
import { threadApi } from '../api/client';
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

export default function MyPosts() {
  const { currentUser } = useUser();
  const [status, setStatus] = useUrlState('status', '', ['page']) as [string, (v: string) => void];
  const [page, setPage] = useUrlState('page', 1);

  const { data, loading, error, refetch } = useAsync(
    () => currentUser
      ? threadApi.list({ author_id: currentUser.id, status: status || undefined, page, size: PAGE_SIZE })
      : Promise.resolve({ items: [], total: 0 }),
    [currentUser?.id, status, page],
  );

  const threads = data?.items;
  const totalCount = data?.total || 0;

  if (!currentUser) {
    return <EmptyState icon="👤" message="请先登录以查看您的帖子" />;
  }

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">我的帖子</h1>
        <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>共 {totalCount} 篇</span>
      </div>

      <div className="filter-bar">
        {STATUSES.map(s => (
          <button
            key={s.value}
            className={`filter-pill ${status === s.value ? 'filter-pill--active' : ''}`}
            onClick={() => setStatus(s.value as string)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {(() => {
        if (loading) return <Loading />;
        if (error) return <ErrorMsg message={error} onRetry={refetch} />;
        if (!threads?.length) return <EmptyState icon="📝" message="您还没有发过帖子" />;
        return (
          <div className="card" style={{ padding: '0 16px' }}>
            {threads.map(t => <MyPostItem key={t.id} thread={t} />)}
          </div>
        );
      })()}

      <Pagination page={page} total={totalCount} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function MyPostItem({ thread }: { thread: Thread }) {
  const hasUpdate = thread.updated_at && thread.updated_at !== thread.created_at;

  return (
    <div className="thread-item">
      <div style={{ flex: 1 }}>
        <Link
          to={`/threads/${thread.id}`}
          className="thread-item__title"
          style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
        >
          {thread.title}
        </Link>
        <div className="thread-item__meta">
          <StatusBadge status={thread.status} />
          <PriorityBadge priority={thread.priority} />
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
