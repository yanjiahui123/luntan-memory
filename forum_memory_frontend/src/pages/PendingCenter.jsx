import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { memoryApi, adminApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, Badge, AuthorityBadge, QualityDot } from '../components/UI';

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '超时待确认' },
  { key: 'low_quality', label: '低质量' },
  { key: 'quality_alert', label: '质量告警' },
];

export default function PendingCenter() {
  const { boardId } = useParams();
  const [tab, setTab] = useState('all');

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>待处理中心</h1>

      <div className="tabs">
        {TABS.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'quality_alert'
        ? <QualityAlertTab boardId={boardId} />
        : <MemoryTab tab={tab} boardId={boardId} />
      }
    </div>
  );
}

function MemoryTab({ tab, boardId }) {
  const nsFilter = boardId ? { namespace_id: boardId } : {};
  const params = tab === 'pending' ? { ...nsFilter, pending_confirm: true, page: 1, size: 50 }
    : tab === 'low_quality' ? { ...nsFilter, status: 'ACTIVE', page: 1, size: 50 }
    : { ...nsFilter, pending_confirm: true, page: 1, size: 50 };

  const { data: items, loading, error, refetch } = useAsync(() => memoryApi.list(params), [tab, boardId]);

  async function handlePromote(id) {
    await memoryApi.changeAuthority(id, { authority: 'LOCKED', reason: '管理员从待处理中心确认' });
    refetch();
  }

  async function handleDiscard(id) {
    await memoryApi.delete(id);
    refetch();
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!items?.length) return <EmptyState icon="✅" message="没有待处理事项，一切正常！" />;

  return items.map(m => (
    <PendingItem key={m.id} memory={m} onPromote={() => handlePromote(m.id)} onDiscard={() => handleDiscard(m.id)} />
  ));
}

function QualityAlertTab({ boardId }) {
  const params = boardId ? { namespace_id: boardId } : {};
  const { data, loading, error, refetch } = useAsync(
    () => adminApi.qualityAlerts(params),
    [boardId],
  );

  async function handleDismiss(id) {
    await adminApi.dismissAlert(id);
    refetch();
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!data?.items?.length) return <EmptyState icon="✅" message="暂无质量告警，记忆库状态良好！" />;

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-sec)' }}>
        共 {data.total} 条记忆触发质量告警（错误反馈达阈值），需人工复核。
      </div>
      {data.items.map(m => (
        <QualityAlertItem key={m.id} memory={m} onDismiss={() => handleDismiss(m.id)} />
      ))}
    </div>
  );
}

function QualityAlertItem({ memory, onDismiss }) {
  return (
    <div className="card pending-item" style={{ borderLeftColor: 'var(--red)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge type="red">⚠️ 质量告警</Badge>
        <AuthorityBadge authority={memory.authority} />
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 8 }}>{memory.content}</div>

      <div style={{ fontSize: 12, color: 'var(--text-ter)', marginBottom: 10, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <span>质量分: <QualityDot score={memory.quality_score} /> {memory.quality_score?.toFixed(2)}</span>
        <span style={{ color: 'var(--red)' }}>错误反馈: {memory.wrong_count}</span>
        <span>过时反馈: {memory.outdated_count}</span>
        <span>有用: {memory.useful_count}</span>
        <span>引用: {memory.cite_count} 次 / 解决: {memory.resolved_citation_count} 次</span>
      </div>

      <div className="pending-item__actions">
        <button className="btn-success btn-sm" onClick={onDismiss}>✓ 已复核，消除告警</button>
        <Link to={`/admin/memories/${memory.id}`}>
          <button className="btn-secondary btn-sm">查看详情</button>
        </Link>
      </div>
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
