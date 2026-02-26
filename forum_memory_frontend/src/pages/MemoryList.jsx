import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, AuthorityBadge, LifecycleBadge, Badge, QualityDot, TimeAgo } from '../components/UI';

export default function MemoryList() {
  const [filters, setFilters] = useState({ authority: '', status: '', pending_confirm: '', page: 1 });

  const { data: memories, loading, error, refetch } = useAsync(
    () => memoryApi.list({ ...cleanFilters(filters), size: 20 }),
    [filters]
  );

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val, page: 1 }));
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">记忆管理</h1>
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
