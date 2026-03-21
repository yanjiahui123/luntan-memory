import React, { useState, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { threadApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, EmptyState, ErrorMsg, Badge, StatusBadge, TimeAgo } from '../components/UI';
import type { Thread } from '../types';

const PAGE_SIZE = 10;
const CONTENT_TRUNCATE = 150;

/** Highlight query keywords in text.
 *  split(regex-with-capture-group) produces [nonMatch, match, nonMatch, match, ...],
 *  so odd-indexed parts are always the captured keyword — no need for regex.test(). */
function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const keywords = query.trim().split(/\s+/).filter(Boolean);
  const pattern = keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  if (!pattern) return <>{text}</>;
  const regex = new RegExp(`(${pattern})`, 'gi');
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} style={{ background: 'var(--amber-light, #fff3cd)', padding: '0 1px', borderRadius: 2 }}>{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

export default function SearchResults() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const [page, setPage] = useState(1);

  // Reset page to 1 when query changes
  useEffect(() => { setPage(1); }, [query]);

  const { data: result, loading, error } = useAsync(
    () => query.trim()
      ? threadApi.list({ q: query, page, size: PAGE_SIZE })
      : Promise.resolve(null),
    [query, page],
  );

  const threads = result?.items || [];
  const total = result?.total || 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>搜索结果</h1>
      <p style={{ color: 'var(--text-sec)', marginBottom: 20, fontSize: 14 }}>
        关键词: <strong>"{query}"</strong>
        {total > 0 && <span style={{ marginLeft: 8 }}>共 {total} 条结果</span>}
      </p>

      {!query.trim() && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>
            请输入关键词搜索帖子，可以按帖子标题、内容、技术标签或环境进行搜索。
          </p>
        </div>
      )}

      {query.trim() && loading && <Loading />}
      {query.trim() && error && <ErrorMsg message={`搜索失败: ${error}`} />}

      {query.trim() && !loading && !error && (
        <>
          {!threads.length ? (
            <EmptyState icon="🔍" message="没有找到相关帖子" />
          ) : (
            <>
              {threads.map(thread => (
                <ThreadHit key={thread.id} thread={thread} query={query} />
              ))}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
                  <button
                    className="btn-secondary btn-sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    上一页
                  </button>
                  <span style={{ lineHeight: '30px', fontSize: 13, color: 'var(--text-sec)' }}>
                    {page} / {totalPages}
                  </span>
                  <button
                    className="btn-secondary btn-sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    下一页
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ThreadHit({ thread, query }: { thread: Thread; query: string }) {
  const previewText = useMemo(() => {
    const text = thread.content || '';
    if (text.length <= CONTENT_TRUNCATE) return text;
    // Try to center the preview around the first keyword match
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase().trim().split(/\s+/)[0] || '';
    const idx = lowerQuery ? lowerText.indexOf(lowerQuery) : -1;
    if (idx === -1) return text.slice(0, CONTENT_TRUNCATE) + '...';
    const start = Math.max(0, idx - 60);
    const end = Math.min(text.length, start + CONTENT_TRUNCATE);
    const prefix = start > 0 ? '...' : '';
    const suffix = end < text.length ? '...' : '';
    return prefix + text.slice(start, end) + suffix;
  }, [thread.content, query]);

  return (
    <Link
      to={`/threads/${thread.id}`}
      style={{ textDecoration: 'none', color: 'inherit', display: 'block', marginBottom: 10 }}
    >
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <StatusBadge status={thread.status} />
          {thread.tags?.map(t => (
            <Badge key={t} type="gray">
              <HighlightText text={t} query={query} />
            </Badge>
          ))}
          {thread.environment && (
            <Badge type="gray">
              🌍 <HighlightText text={thread.environment} query={query} />
            </Badge>
          )}
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6, color: 'var(--text)' }}>
          <HighlightText text={thread.title} query={query} />
        </div>
        {previewText && (
          <div style={{ fontSize: 13, color: 'var(--text-sec)', lineHeight: 1.6, marginBottom: 6 }}>
            <HighlightText text={previewText} query={query} />
          </div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-ter)', display: 'flex', gap: 12, alignItems: 'center' }}>
          {thread.author_display_name && <span>👤 {thread.author_display_name}</span>}
          <span>💬 {thread.comment_count}</span>
          <TimeAgo date={thread.created_at} />
        </div>
      </div>
    </Link>
  );
}
