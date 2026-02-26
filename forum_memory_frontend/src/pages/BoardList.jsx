import React from 'react';
import { Link } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';

export default function BoardList() {
  const { data: boards, loading, error, refetch } = useAsync(() => namespaceApi.list());

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!boards?.length) return <EmptyState icon="📂" message="还没有板块，去创建一个吧" />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">全部板块</h1>
      </div>
      <div className="board-grid">
        {boards.map(b => <BoardCard key={b.id} board={b} />)}
      </div>
    </div>
  );
}

function BoardCard({ board }) {
  return (
    <Link to={`/boards/${board.id}/threads`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ padding: 20, cursor: 'pointer' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{board.display_name}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 12 }}>{board.description || board.name}</p>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-ter)' }}>
          <span>📋 {board.name}</span>
          <span style={{ color: board.is_active ? 'var(--green)' : 'var(--red)' }}>
            {board.is_active ? '● 活跃' : '○ 已关闭'}
          </span>
        </div>
      </div>
    </Link>
  );
}
