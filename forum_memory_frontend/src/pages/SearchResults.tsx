import React, { useState, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { Loading, EmptyState, ErrorMsg, AuthorityBadge, Badge, KnowledgeTypeBadge } from '../components/UI';
import type { MemorySearchHit, RelatedMemoryHint } from '../types';

const PAGE_SIZE = 10;
const CONTENT_TRUNCATE = 200;

/** Highlight query keywords in text */
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
        regex.test(part) ? (
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
  const nsId = params.get('ns') || '';
  const { isAdmin } = useUser();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: searchResult, loading, error } = useAsync(
    () => nsId ? memoryApi.search({ query, namespace_id: nsId, top_k: 50 }) : Promise.resolve(null),
    [query, nsId]
  );

  const visibleHits = useMemo(
    () => searchResult?.hits?.slice(0, visibleCount) || [],
    [searchResult, visibleCount],
  );
  const totalHits = searchResult?.hits?.length || 0;
  const hasMore = visibleCount < totalHits;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>搜索结果</h1>
      <p style={{ color: 'var(--text-sec)', marginBottom: 20, fontSize: 14 }}>
        关键词: <strong>"{query}"</strong>
      </p>

      {!nsId && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>
            提示：记忆搜索需要指定板块。请先进入一个板块，在板块内搜索可获得知识直达结果。
          </p>
          <p style={{ color: 'var(--text-sec)', fontSize: 14, marginTop: 8 }}>
            你也可以浏览 <Link to="/boards">所有板块</Link> 找到相关板块。
          </p>
        </div>
      )}

      {nsId && loading && <Loading />}
      {nsId && error && <ErrorMsg message={`搜索失败: ${error}`} />}

      {nsId && !loading && !error && searchResult && (
        <div className="search-layout">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              知识匹配 <span style={{ fontWeight: 400, color: 'var(--text-ter)' }}>{totalHits} 条</span>
            </h3>
            {!totalHits ? (
              <EmptyState icon="🔍" message="没有找到相关知识" />
            ) : (
              <>
                {visibleHits.map((hit, i) => (
                  <SearchHit key={i} hit={hit} query={query} isAdmin={isAdmin} />
                ))}
                {hasMore && (
                  <div style={{ textAlign: 'center', marginTop: 12 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                    >
                      加载更多 ({totalHits - visibleCount} 条剩余)
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: 'var(--text-sec)' }}>
              搜索信息
            </h3>
            <div className="card" style={{ padding: 14, fontSize: 13, color: 'var(--text-sec)' }}>
              <div>扩展查询: {searchResult.query_expanded || query}</div>
              <div style={{ marginTop: 4 }}>召回总数: {searchResult.total_recalled || 0}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SearchHit({ hit, query, isAdmin }: { hit: MemorySearchHit; query: string; isAdmin: boolean }) {
  const m = hit.memory;
  const [expanded, setExpanded] = useState(false);
  const needsTruncation = m.content.length > CONTENT_TRUNCATE;
  const displayContent = (!needsTruncation || expanded) ? m.content : m.content.slice(0, CONTENT_TRUNCATE) + '...';

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${m.authority === 'LOCKED' ? 'var(--green)' : 'var(--accent)'}` }}>
      <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
        <HighlightText text={displayContent} query={query} />
        {needsTruncation && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4 }}
          >
            {expanded ? '收起' : '展开全文'}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <AuthorityBadge authority={m.authority} />
        {m.knowledge_type && <KnowledgeTypeBadge type={m.knowledge_type} />}
        {m.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
        <span style={{ fontSize: 12, color: 'var(--text-ter)', marginLeft: 'auto' }}>
          相关度 {hit.score.toFixed(2)}
        </span>
      </div>
      {!hit.env_match && hit.env_warning && (
        <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 6 }}>{hit.env_warning}</div>
      )}
      {hit.related && hit.related.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
          {hit.related.map((rel, ri) => (
            <RelationHint key={ri} relation={rel} />
          ))}
        </div>
      )}
      {isAdmin && (
        <div style={{ marginTop: 8 }}>
          <Link to={`/admin/memories/${m.id}`} style={{ fontSize: 12 }}>查看完整记忆 →</Link>
        </div>
      )}
    </div>
  );
}


const RELATION_COLORS: Record<string, string> = {
  SUPPLEMENTS: 'var(--accent)',
  CONTRADICTS: 'var(--red, #e53e3e)',
  SUPERSEDES: 'var(--amber, #d69e2e)',
  CAUSED_BY: 'var(--text-sec)',
};

function RelationHint({ relation }: { relation: RelatedMemoryHint }) {
  const color = RELATION_COLORS[relation.relation_type] || 'var(--text-sec)';
  return (
    <div style={{ fontSize: 12, color, marginBottom: 4, paddingLeft: 12 }}>
      <span style={{ fontWeight: 600 }}>↳ {relation.label}:</span>{' '}
      <span style={{ color: 'var(--text-sec)' }}>{relation.content_preview}</span>
    </div>
  );
}
