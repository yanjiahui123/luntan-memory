import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { memoryApi, namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, AuthorityBadge, LifecycleBadge, Badge, QualityDot, TimeAgo, KnowledgeTypeBadge, KNOWLEDGE_TYPE_LABELS } from '../components/UI';

const KNOWLEDGE_TYPES = Object.entries(KNOWLEDGE_TYPE_LABELS);

export default function MemoryList() {
  const [filters, setFilters] = useState({
    namespace_id: '', authority: '', status: '', pending_confirm: '',
    knowledge_type: '', tags: '', page: 1,
  });
  const [namespaces, setNamespaces] = useState([]);
  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    namespaceApi.list().then(setNamespaces).catch(() => {});
  }, []);

  useEffect(() => {
    memoryApi.tags(filters.namespace_id || undefined).then(setAllTags).catch(() => {});
  }, [filters.namespace_id]);

  const { data: memories, loading, error, refetch } = useAsync(
    () => memoryApi.list({ ...cleanFilters(filters), size: 20 }),
    [filters]
  );

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val, page: 1 }));
  }

  function toggleTag(tag) {
    setFilters(f => {
      const current = f.tags ? f.tags.split(',').map(t => t.trim()).filter(Boolean) : [];
      const idx = current.indexOf(tag);
      if (idx >= 0) {
        current.splice(idx, 1);
      } else {
        current.push(tag);
      }
      return { ...f, tags: current.join(','), page: 1 };
    });
  }

  const selectedTags = filters.tags ? filters.tags.split(',').map(t => t.trim()).filter(Boolean) : [];

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">记忆管理</h1>
      </div>

      {/* Top filter bar */}
      <div className="card" style={{ padding: '12px 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>板块</label>
          <select
            value={filters.namespace_id}
            onChange={e => setFilter('namespace_id', e.target.value)}
            style={{ width: 'auto', minWidth: 140, padding: '5px 10px', fontSize: 13 }}
          >
            <option value="">全部板块</option>
            {namespaces.map(ns => (
              <option key={ns.id} value={ns.id}>{ns.name}</option>
            ))}
          </select>

          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 4px' }} />

          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>知识类型</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              className={`filter-pill ${!filters.knowledge_type ? 'filter-pill--active' : ''}`}
              onClick={() => setFilter('knowledge_type', '')}
              style={{ padding: '3px 10px', fontSize: 12 }}
            >
              全部
            </button>
            {KNOWLEDGE_TYPES.map(([key, label]) => (
              <button
                key={key}
                className={`filter-pill ${filters.knowledge_type === key ? 'filter-pill--active' : ''}`}
                onClick={() => setFilter('knowledge_type', filters.knowledge_type === key ? '' : key)}
                style={{ padding: '3px 10px', fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {allTags.length > 0 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', whiteSpace: 'nowrap' }}>标签</label>
            {allTags.map(tag => (
              <button
                key={tag}
                className={`filter-pill ${selectedTags.includes(tag) ? 'filter-pill--active' : ''}`}
                onClick={() => toggleTag(tag)}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                {tag}
              </button>
            ))}
            {selectedTags.length > 0 && (
              <button
                className="btn-sm btn-secondary"
                onClick={() => setFilter('tags', '')}
                style={{ fontSize: 11, padding: '2px 8px' }}
              >
                清除标签
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        {/* Sidebar filters */}
        <div style={{ width: 180, flexShrink: 0 }}>
          <div className="card" style={{ padding: 14 }}>
            <FilterGroup label="权威等级" value={filters.authority} onChange={v => setFilter('authority', v)}
              options={[['', '全部'], ['LOCKED', '🔒 LOCKED'], ['NORMAL', '🤖 NORMAL']]} />
            <FilterGroup label="生命周期" value={filters.status} onChange={v => setFilter('status', v)}
              options={[['', '全部'], ['ACTIVE', 'ACTIVE'], ['COLD', 'COLD'], ['ARCHIVED', 'ARCHIVED']]} />
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="checkbox" checked={filters.pending_confirm === 'true'} onChange={e => setFilter('pending_confirm', e.target.checked ? 'true' : '')} />
                仅待确认
              </label>
            </div>
          </div>
        </div>

        {/* Memory list */}
        <div style={{ flex: 1 }}>
          {loading ? <Loading /> : error ? <ErrorMsg message={error} onRetry={refetch} /> :
            !memories?.length ? <EmptyState icon="🧠" message="没有匹配的记忆" /> :
            <div className="card" style={{ padding: '0 16px' }}>
              {memories.map(m => <MemoryRow key={m.id} memory={m} />)}
            </div>
          }
        </div>
      </div>
    </div>
  );
}

function FilterGroup({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6 }}>{label}</div>
      {options.map(([val, text]) => (
        <div key={val} onClick={() => onChange(val)}
          style={{ padding: '4px 0', fontSize: 13, cursor: 'pointer', color: value === val ? 'var(--accent)' : 'var(--text)', fontWeight: value === val ? 600 : 400 }}>
          {value === val ? '●' : '○'} {text}
        </div>
      ))}
    </div>
  );
}

function MemoryRow({ memory }) {
  return (
    <div className="memory-row">
      <div style={{ flex: 1 }}>
        <Link to={`/admin/memories/${memory.id}`} style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 13, lineHeight: 1.6, display: 'block', marginBottom: 6 }}>
          {memory.content.length > 150 ? memory.content.slice(0, 150) + '...' : memory.content}
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <AuthorityBadge authority={memory.authority} />
          <LifecycleBadge status={memory.status} />
          {memory.knowledge_type && <KnowledgeTypeBadge type={memory.knowledge_type} />}
          {memory.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
          {memory.pending_human_confirm && <Badge type="amber">⏳ 待确认</Badge>}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap', minWidth: 60 }}>
        <QualityDot score={memory.quality_score} />
        <div style={{ color: 'var(--text-ter)', marginTop: 2 }}>质量分</div>
      </div>
    </div>
  );
}

function cleanFilters(f) {
  const out = {};
  Object.entries(f).forEach(([k, v]) => { if (v) out[k] = v; });
  return out;
}
