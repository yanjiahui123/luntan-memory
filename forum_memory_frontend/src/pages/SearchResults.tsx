import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { Loading, EmptyState, AuthorityBadge, Badge, KnowledgeTypeBadge } from '../components/UI';
import type { MemorySearchHit } from '../types';

export default function SearchResults() {
  const [params] = useSearchParams();
  const query = params.get('q') || '';
  const nsId = params.get('ns') || '';
  const { isAdmin } = useUser();

  const { data: searchResult, loading } = useAsync(
    () => nsId ? memoryApi.search({ query, namespace_id: nsId, top_k: 10 }) : Promise.resolve(null),
    [query, nsId]
  );

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 4 }}>搜索结果</h1>
      <p style={{ color: 'var(--text-sec)', marginBottom: 20, fontSize: 14 }}>
        关键词: <strong>"{query}"</strong>
      </p>

      {!nsId && (
        <div className="card" style={{ padding: 20 }}>
          <p style={{ color: 'var(--text-sec)', fontSize: 14 }}>
            💡 提示：记忆搜索需要指定板块。请先进入一个板块，在板块内搜索可获得知识直达结果。
          </p>
          <p style={{ color: 'var(--text-sec)', fontSize: 14, marginTop: 8 }}>
            你也可以浏览 <Link to="/boards">所有板块</Link> 找到相关板块。
          </p>
        </div>
      )}

      {nsId && loading && <Loading />}

      {nsId && searchResult && (
        <div className="search-layout">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>
              🔍 知识匹配 <span style={{ fontWeight: 400, color: 'var(--text-ter)' }}>{searchResult.hits?.length || 0} 条</span>
            </h3>
            {!searchResult.hits?.length ? (
              <EmptyState icon="🔍" message="没有找到相关知识" />
            ) : (
              searchResult.hits.map((hit, i) => <SearchHit key={i} hit={hit} isAdmin={isAdmin} />)
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

function SearchHit({ hit, isAdmin }: { hit: MemorySearchHit; isAdmin: boolean }) {
  const m = hit.memory;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${m.authority === 'LOCKED' ? 'var(--green)' : 'var(--accent)'}` }}>
      <div style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>{m.content}</div>
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
      {isAdmin && (
        <div style={{ marginTop: 8 }}>
          <Link to={`/admin/memories/${m.id}`} style={{ fontSize: 12 }}>查看完整记忆 →</Link>
        </div>
      )}
    </div>
  );
}
