import React, { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useFollow } from '../contexts/FollowContext';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';
import type { Namespace, NamespaceStats } from '../types';

type ViewTab = 'followed' | 'all';
const PAGE_SIZE = 20;

export default function BoardList() {
  const [searchParams] = useSearchParams();
  const initialTab: ViewTab = searchParams.get('view') === 'all' ? 'all' : 'followed';

  const { followedBoards, followedIds: ctxFollowedIds, refetchFollowed: ctxRefetch } = useFollow();
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<ViewTab>(initialTab);

  // All boards pagination state
  const [allBoards, setAllBoards] = useState<Namespace[]>([]);
  const [allTotal, setAllTotal] = useState(0);
  const [allPage, setAllPage] = useState(1);
  const [allLoading, setAllLoading] = useState(false);
  const [allError, setAllError] = useState<string | null>(null);

  // Followed boards pagination (client-side since followedBoards is from context)
  const [followedPage, setFollowedPage] = useState(1);

  const [statsMap, setStatsMap] = useState<Record<string, NamespaceStats>>({});

  // Sync followed IDs from context
  useEffect(() => {
    setFollowedIds(ctxFollowedIds);
  }, [ctxFollowedIds]);

  // Auto-switch to "all" if no followed boards
  useEffect(() => {
    if (ctxFollowedIds.size === 0 && initialTab !== 'all') {
      setTab('all');
    }
  }, [ctxFollowedIds, initialTab]);

  // Fetch all boards page
  useEffect(() => {
    if (tab !== 'all') return;
    setAllLoading(true);
    setAllError(null);
    namespaceApi.list(allPage, PAGE_SIZE)
      .then(res => {
        setAllBoards(res.items);
        setAllTotal(res.total);
      })
      .catch(e => setAllError(e instanceof Error ? e.message : String(e)))
      .finally(() => setAllLoading(false));
  }, [tab, allPage]);

  // Fetch stats for visible boards
  useEffect(() => {
    const visible = tab === 'all' ? allBoards : pagedFollowed();
    if (!visible.length) return;
    Promise.all(visible.map(b => namespaceApi.stats(b.id).catch(() => null)))
      .then(results => {
        const map: Record<string, NamespaceStats> = {};
        results.forEach((s, i) => { if (s) map[visible[i].id] = s; });
        setStatsMap(prev => ({ ...prev, ...map }));
      });
  }, [tab, allBoards, followedBoards, followedPage, allPage]); // eslint-disable-line react-hooks/exhaustive-deps

  function pagedFollowed(): Namespace[] {
    if (!followedBoards) return [];
    const start = (followedPage - 1) * PAGE_SIZE;
    return followedBoards.slice(start, start + PAGE_SIZE);
  }

  const handleToggleFollow = useCallback(async (boardId: string) => {
    const isFollowed = followedIds.has(boardId);
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
      ctxRefetch();
    } catch {
      setFollowedIds(prev => {
        const next = new Set(prev);
        if (isFollowed) { next.add(boardId); } else { next.delete(boardId); }
        return next;
      });
    }
  }, [followedIds, ctxRefetch]);

  // Determine display data based on tab
  const isFollowedTab = tab === 'followed';
  const displayBoards = isFollowedTab ? pagedFollowed() : allBoards;
  const displayTotal = isFollowedTab ? (followedBoards?.length ?? 0) : allTotal;
  const currentPage = isFollowedTab ? followedPage : allPage;
  const totalPages = Math.ceil(displayTotal / PAGE_SIZE);
  const isLoading = isFollowedTab ? !followedBoards : allLoading;

  function handlePageChange(p: number) {
    if (isFollowedTab) { setFollowedPage(p); } else { setAllPage(p); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (isLoading && currentPage === 1) return <Loading />;
  if (!isFollowedTab && allError) return <ErrorMsg message={allError} onRetry={() => setAllPage(1)} />;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 className="page-title" style={{ marginBottom: 0 }}>板块</h1>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button
            className={`tab ${tab === 'followed' ? 'tab--active' : ''}`}
            onClick={() => { setTab('followed'); setFollowedPage(1); }}
          >
            我关注的
          </button>
          <button
            className={`tab ${tab === 'all' ? 'tab--active' : ''}`}
            onClick={() => { setTab('all'); setAllPage(1); }}
          >
            全部板块
          </button>
        </div>
      </div>

      {displayBoards.length === 0 && isFollowedTab ? (
        <EmptyState
          icon="⭐"
          message="还没有关注任何板块"
          action={<button className="btn-secondary" onClick={() => setTab('all')}>浏览全部板块</button>}
        />
      ) : (
        <>
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

          {totalPages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 24 }}>
              <button
                className="btn-secondary btn-sm"
                disabled={currentPage <= 1}
                onClick={() => handlePageChange(currentPage - 1)}
              >
                上一页
              </button>
              <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>
                {currentPage} / {totalPages}
              </span>
              <button
                className="btn-secondary btn-sm"
                disabled={currentPage >= totalPages}
                onClick={() => handlePageChange(currentPage + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
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
