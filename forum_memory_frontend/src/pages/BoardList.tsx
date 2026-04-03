import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { namespaceApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';
import type { Namespace, NamespaceStats } from '../types';

type ViewTab = 'followed' | 'all';

export default function BoardList() {
  const { data: boards, loading, error, refetch } = useAsync(() => namespaceApi.list());
  const { data: followedBoards, refetch: refetchFollowed } = useAsync(() => userApi.followedBoards());
  const [statsMap, setStatsMap] = useState<Record<string, NamespaceStats>>({});
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<ViewTab>('followed');

  const activeBoards = (boards || []).filter(b => b.is_active);

  // Build followed set
  useEffect(() => {
    if (followedBoards) {
      setFollowedIds(new Set(followedBoards.map(b => b.id)));
    }
  }, [followedBoards]);

  // Auto-switch to "all" if no followed boards
  useEffect(() => {
    if (followedBoards && followedBoards.length === 0) {
      setTab('all');
    }
  }, [followedBoards]);

  // Batch fetch stats
  useEffect(() => {
    if (!activeBoards.length) return;
    Promise.all(activeBoards.map(b => namespaceApi.stats(b.id).catch(() => null)))
      .then(results => {
        const map: Record<string, NamespaceStats> = {};
        results.forEach((s, i) => { if (s) map[activeBoards[i].id] = s; });
        setStatsMap(map);
      });
  }, [boards]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggleFollow = useCallback(async (boardId: string) => {
    const isFollowed = followedIds.has(boardId);
    // Optimistic update
    setFollowedIds(prev => {
      const next = new Set(prev);
      if (isFollowed) { next.delete(boardId); } else { next.add(boardId); }
      return next;
    });
    try {
      if (isFollowed) {
        await namespaceApi.unfollow(boardId);
      } else {
        await namespaceApi.follow(boardId);
      }
      refetchFollowed();
    } catch {
      // Revert on failure
      setFollowedIds(prev => {
        const next = new Set(prev);
        if (isFollowed) { next.add(boardId); } else { next.delete(boardId); }
        return next;
      });
    }
  }, [followedIds, refetchFollowed]);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!activeBoards.length) return <EmptyState icon="📂" message="还没有板块" />;

  const displayBoards = tab === 'followed'
    ? activeBoards.filter(b => followedIds.has(b.id))
    : activeBoards;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>板块</h1>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            className={`tab ${tab === 'followed' ? 'tab--active' : ''}`}
            onClick={() => setTab('followed')}
          >
            我关注的
          </button>
          <button
            className={`tab ${tab === 'all' ? 'tab--active' : ''}`}
            onClick={() => setTab('all')}
          >
            全部板块
          </button>
        </div>
      </div>

      {displayBoards.length === 0 && tab === 'followed' ? (
        <EmptyState
          icon="⭐"
          message="还没有关注任何板块"
          action={<button className="btn-secondary" onClick={() => setTab('all')}>浏览全部板块</button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {displayBoards.map(b => (
            <BoardCard
              key={b.id}
              board={b}
              stats={statsMap[b.id]}
              followed={followedIds.has(b.id)}
              onToggleFollow={handleToggleFollow}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AccessBadge({ mode }: { mode?: string }) {
  const m = (mode || '').toLowerCase();
  if (m === 'private') {
    return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fef2f2', color: '#dc2626', fontWeight: 600, marginLeft: 6 }}>私密</span>;
  }
  if (m === 'restricted') {
    return <span style={{ fontSize: 11, padding: '1px 6px', borderRadius: 4, background: '#fefce8', color: '#ca8a04', fontWeight: 600, marginLeft: 6 }}>限制</span>;
  }
  return null;
}

function BoardCard({ board, stats, followed, onToggleFollow }: {
  board: Namespace;
  stats?: NamespaceStats;
  followed: boolean;
  onToggleFollow: (id: string) => void;
}) {
  return (
    <div className="card" style={{ padding: 20, height: '100%', display: 'flex', flexDirection: 'column', transition: 'box-shadow 0.15s', position: 'relative' }}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleFollow(board.id); }}
        title={followed ? '取消关注' : '关注'}
        style={{
          position: 'absolute', top: 12, right: 12,
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: 18, padding: 4, lineHeight: 1,
          color: followed ? '#f59e0b' : 'var(--text-ter)',
          transition: 'color 0.15s',
        }}
      >
        {followed ? '★' : '☆'}
      </button>
      <Link to={`/boards/${board.id}/threads`} style={{ textDecoration: 'none', color: 'inherit', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text)', paddingRight: 28 }}>
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
      </Link>
    </div>
  );
}
