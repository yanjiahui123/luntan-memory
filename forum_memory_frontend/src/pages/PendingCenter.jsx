import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, Badge, AuthorityBadge, QualityDot } from '../components/UI';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '超时待确认' },
  { key: 'low_quality', label: '低质量' },
];

export default function PendingCenter() {
  const [tab, setTab] = useState('all');

  const params = tab === 'pending' ? { pending_confirm: true, page: 1, size: 50 }
    : tab === 'low_quality' ? { status: 'ACTIVE', page: 1, size: 50 }
    : { pending_confirm: true, page: 1, size: 50 };

  const { data: items, loading, error, refetch } = useAsync(() => memoryApi.list(params), [tab]);

  async function handlePromote(id) {
    await memoryApi.changeAuthority(id, { authority: 'LOCKED', reason: '管理员从待处理中心确认' });
    refetch();
  }

  async function handleDiscard(id) {
    await memoryApi.delete(id);
    refetch();
  }

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>待处理中心</h1>

      {/* Tabs */}
      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? <Loading /> : error ? <ErrorMsg message={error} onRetry={refetch} /> :
        !items?.length ? <EmptyState icon="✅" message="没有待处理事项，一切正常！" /> :
        items.map(m => (
          <PendingItem key={m.id} memory={m} onPromote={() => handlePromote(m.id)} onDiscard={() => handleDiscard(m.id)} />
        ))
      }
    </div>
  );
}

function PendingItem({ memory, onPromote, onDiscard }) {
  const isPending = memory.pending_human_confirm;
  const isLowQuality = memory.quality_score < 0.3;
  const borderColor = isPending ? 'var(--amber)' : isLowQuality ? 'var(--red)' : 'var(--accent)';

  return (
    <div className="card pending-item" style={{ borderLeftColor: borderColor }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {isPending && <Badge type="amber">⏳ 超时待确认</Badge>}
        {isLowQuality && <Badge type="red">⚠️ 低质量</Badge>}
        <AuthorityBadge authority={memory.authority} />
        {memory.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}>{memory.content}</div>

      <div style={{ fontSize: 12, color: 'var(--text-ter)', marginBottom: 8 }}>
        质量分: <QualityDot score={memory.quality_score} /> · 来源: {memory.resolved_type} · {memory.source_role}
      </div>

      <div className="pending-item__actions">
        <button className="btn-success btn-sm" onClick={onPromote}>✓ 确认入库 (晋升 LOCKED)</button>
        <button className="btn-danger btn-sm" onClick={onDiscard}>丢弃</button>
        <Link to={`/admin/memories/${memory.id}`}>
          <button className="btn-secondary btn-sm">查看详情</button>
        </Link>
      </div>
    </div>
  );
}
