import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';
import type { Namespace, NamespaceStats } from '../types';

export default function BoardList() {
  const { data: boards, loading, error, refetch } = useAsync(() => namespaceApi.list());
  const [statsMap, setStatsMap] = useState<Record<string, NamespaceStats>>({});

  const activeBoards = (boards || []).filter(b => b.is_active);

  // Batch fetch stats for all active boards
  useEffect(() => {
    if (!activeBoards.length) return;
    Promise.all(activeBoards.map(b => namespaceApi.stats(b.id).catch(() => null)))
      .then(results => {
        const map: Record<string, NamespaceStats> = {};
        results.forEach((s, i) => { if (s) map[activeBoards[i].id] = s; });
        setStatsMap(map);
      });
  }, [boards]);  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!activeBoards.length) return <EmptyState icon="📂" message="还没有板块" />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>全部板块</h1>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {activeBoards.map(b => <BoardCard key={b.id} board={b} stats={statsMap[b.id]} />)}
      </div>
    </div>
  );
}

function AccessBadge({ mode }: { mode?: string }) {
  if (mode === 'PRIVATE') {
    return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 600, marginLeft: 6 }}>私密</span>;
  }
  if (mode === 'RESTRICTED') {
    return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fefce8', color: '#ca8a04', fontWeight: 600, marginLeft: 6 }}>限制</span>;
  }
  return null;
}

function BoardCard({ board, stats }: { board: Namespace; stats?: NamespaceStats }) {
  return (
    <Link to={`/boards/${board.id}/threads`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s', cursor: 'pointer' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>
          {board.display_name || board.name}
          <AccessBadge mode={board.access_mode} />
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.5, marginBottom: 12, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', flex: 1 }}>
          {board.description || '\u00A0'}
        </p>
        {stats ? (
          <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-ter)' }}>
            <span>💬 {stats.thread_count ?? stats.total_threads ?? 0} 帖子</span>
            <span>🧠 {stats.memory_count ?? stats.total_memories ?? 0} 记忆</span>
            {stats.ai_resolve_rate != null && (
              <span>🤖 {(stats.ai_resolve_rate * 100).toFixed(0)}% AI 解决</span>
            )}
          </div>
        ) : (
          <div style={{ fontSize: 12, color: 'var(--text-ter)' }}>加载统计中...</div>
        )}
      </div>
    </Link>
  );
}
