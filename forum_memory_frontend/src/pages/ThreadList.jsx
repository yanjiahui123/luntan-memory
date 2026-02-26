import React, { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { threadApi, namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, StatusBadge, Badge, TimeAgo } from '../components/UI';

const STATUSES = [
  { value: '', label: '全部' },
  { value: 'OPEN', label: '进行中' },
  { value: 'RESOLVED', label: '已解决' },
  { value: 'TIMEOUT_CLOSED', label: '已超时' },
];

export default function ThreadList() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const { data: board } = useAsync(() => namespaceApi.get(boardId), [boardId]);
  const { data: threads, loading, error, refetch } = useAsync(
    () => threadApi.list({ namespace_id: boardId, status: status || undefined, page }),
    [boardId, status, page]
  );

  return (
    <div>
      <div className="breadcrumb">
        <Link to="/boards">板块</Link> <span>›</span> <span>{board?.display_name || '加载中...'}</span>
      </div>

      <div className="page-header">
        <h1 className="page-title">{board?.display_name || '帖子列表'}</h1>
        <button className="btn-primary" onClick={() => navigate(`/boards/${boardId}/new`)}>+ 发帖</button>
      </div>

      {/* Filter bar */}
      <div className="filter-bar">
        {STATUSES.map(s => (
          <button key={s.value} className={`filter-pill ${status === s.value ? 'filter-pill--active' : ''}`} onClick={() => { setStatus(s.value); setPage(1); }}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Thread list */}
      {loading ? <Loading /> : error ? <ErrorMsg message={error} onRetry={refetch} /> :
        !threads?.length ? <EmptyState icon="💬" message="还没有帖子" /> :
        <div className="card" style={{ padding: '0 16px' }}>
          {threads.map(t => <ThreadItem key={t.id} thread={t} />)}
        </div>
      }
    </div>
  );
}

function ThreadItem({ thread }) {
  return (
    <div className="thread-item">
      <div style={{ flex: 1 }}>
        <Link to={`/threads/${thread.id}`} className="thread-item__title" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          {thread.title}
        </Link>
        <div className="thread-item__meta">
          <StatusBadge status={thread.status} />
          {thread.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
        </div>
      </div>
      <div className="thread-item__right">
        <div>{thread.comment_count} 回复</div>
        <TimeAgo date={thread.created_at} />
      </div>
    </div>
  );
}
