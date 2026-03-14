import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { memoryApi, adminApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUrlState } from '../hooks/useUrlState';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, EmptyState, Badge, AuthorityBadge, QualityDot, Pagination } from '../components/UI';
import type { Memory, QualityAlert, MemoryRelation } from '../types';
import type { MemoryListParams } from '../api/client';

const PAGE_SIZE = 20;

const TABS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '超时待确认' },
  { key: 'low_quality', label: '低质量' },
  { key: 'quality_alert', label: '质量告警' },
  { key: 'contradictions', label: '矛盾对' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function PendingCenter() {
  const { boardId } = useParams<{ boardId?: string }>();
  const [tab, setTab] = useUrlState('tab', 'all') as [string, (v: string) => void];

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

      <TabContent tab={tab} boardId={boardId} />
    </div>
  );
}

function TabContent({ tab, boardId }: { tab: string; boardId?: string }) {
  if (tab === 'quality_alert') return <QualityAlertTab boardId={boardId} />;
  if (tab === 'contradictions') return <ContradictionsTab boardId={boardId} />;
  return <MemoryTab tab={tab} boardId={boardId} />;
}

function MemoryTab({ tab, boardId }: { tab: Exclude<TabKey, 'quality_alert'>; boardId?: string }) {
  const { addToast } = useToast();
  const [page, setPage] = useUrlState('page', 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const nsFilter = boardId ? { namespace_id: boardId } : {};
  const base = { ...nsFilter, page, size: PAGE_SIZE };
  const params: MemoryListParams = tab === 'low_quality'
    ? { ...base, lifecycle_status: 'ACTIVE' }
    : { ...base, pending_human_confirm: true };

  const { data, loading, error, refetch } = useAsync(() => memoryApi.list(params), [tab, boardId, page]);
  const items = data?.items;
  const totalCount = data?.total || 0;

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!items) return;
    const allIds = items.map(m => m.id);
    const allSelected = allIds.every(id => selected.has(id));
    if (allSelected) {
      setSelected(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelected(prev => {
        const next = new Set(prev);
        allIds.forEach(id => next.add(id));
        return next;
      });
    }
  }

  async function handlePromote(id: string) {
    await memoryApi.changeAuthority(id, { authority: 'LOCKED' });
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    refetch();
  }

  async function handleDiscard(id: string) {
    await memoryApi.delete(id);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
    refetch();
  }

  async function handleBatchPromote() {
    if (selected.size === 0) return;
    setBatchLoading(true);
    try {
      const ids = [...selected];
      await Promise.allSettled(ids.map(id => memoryApi.changeAuthority(id, { authority: 'LOCKED' })));
      addToast('success', `已批量确认 ${ids.length} 条记忆`);
      setSelected(new Set());
      refetch();
    } catch {
      addToast('error', '批量确认失败');
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleBatchDiscard() {
    if (selected.size === 0) return;
    setBatchLoading(true);
    try {
      const ids = [...selected];
      await Promise.allSettled(ids.map(id => memoryApi.delete(id)));
      addToast('success', `已批量丢弃 ${ids.length} 条记忆`);
      setSelected(new Set());
      refetch();
    } catch {
      addToast('error', '批量丢弃失败');
    } finally {
      setBatchLoading(false);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!items?.length) return <EmptyState icon="✅" message="没有待处理事项，一切正常！" />;

  const allSelected = items.every(m => selected.has(m.id));
  const someSelected = items.some(m => selected.has(m.id));

  return (
    <>
      {/* Batch action bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, padding: '8px 12px', background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
          <input
            type="checkbox"
            checked={allSelected}
            ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
            onChange={toggleSelectAll}
          />
          全选
        </label>

        {selected.size > 0 && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>已选 {selected.size} 项</span>
            <button className="btn-success btn-sm" onClick={handleBatchPromote} disabled={batchLoading}>
              {batchLoading ? '处理中...' : `批量确认入库 (${selected.size})`}
            </button>
            <button className="btn-danger btn-sm" onClick={handleBatchDiscard} disabled={batchLoading}>
              {batchLoading ? '处理中...' : `批量丢弃 (${selected.size})`}
            </button>
          </>
        )}
      </div>

      {items.map(m => (
        <PendingItem
          key={m.id}
          memory={m}
          checked={selected.has(m.id)}
          onToggle={() => toggleSelect(m.id)}
          onPromote={() => handlePromote(m.id)}
          onDiscard={() => handleDiscard(m.id)}
        />
      ))}

      <Pagination page={page} total={totalCount} size={PAGE_SIZE} onChange={setPage} />
    </>
  );
}

function QualityAlertTab({ boardId }: { boardId?: string }) {
  const [page, setPage] = useUrlState('page', 1);
  const params = boardId
    ? { namespace_id: boardId, page, size: PAGE_SIZE }
    : { page, size: PAGE_SIZE };
  const { data, loading, error, refetch } = useAsync(
    () => adminApi.qualityAlerts(params),
    [boardId, page],
  );

  async function handleDismiss(id: string) {
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
      <Pagination page={page} total={data.total} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function QualityAlertItem({ memory, onDismiss }: { memory: QualityAlert; onDismiss: () => void }) {
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
        {memory.outdated_count !== undefined && <span>过时反馈: {memory.outdated_count}</span>}
        {memory.useful_count !== undefined && <span>有用: {memory.useful_count}</span>}
        {memory.cite_count !== undefined && memory.resolved_citation_count !== undefined && (
          <span>引用: {memory.cite_count} 次 / 解决: {memory.resolved_citation_count} 次</span>
        )}
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

function ContradictionsTab({ boardId }: { boardId?: string }) {
  const [page, setPage] = useUrlState('page', 1);
  const params = boardId
    ? { namespace_id: boardId, page, size: PAGE_SIZE }
    : { page, size: PAGE_SIZE };
  const { data, loading, error, refetch } = useAsync(
    () => adminApi.contradictions(params),
    [boardId, page],
  );

  // Batch-fetch memory contents for all relations
  const relItems = data?.items || [];
  const memoryIds = [...new Set(relItems.flatMap(r => [r.source_memory_id, r.target_memory_id]))];
  const { data: memories } = useAsync(
    () => memoryIds.length ? memoryApi.batchGet(memoryIds) : Promise.resolve([]),
    [JSON.stringify(memoryIds)],
  );
  const memMap = new Map((memories || []).map(m => [m.id, m]));

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!relItems.length) return <EmptyState icon="✅" message="暂无矛盾记忆对" />;

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-sec)' }}>
        共 {data?.total || 0} 对矛盾记忆需要人工裁决。
      </div>
      {relItems.map(rel => (
        <ContradictionPair key={rel.id} relation={rel} memMap={memMap} />
      ))}
      <Pagination page={page} total={data?.total || 0} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function ContradictionPair({ relation, memMap }: { relation: MemoryRelation; memMap: Map<string, Memory> }) {
  const source = memMap.get(relation.source_memory_id);
  const target = memMap.get(relation.target_memory_id);

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderLeft: '3px solid var(--red, #e53e3e)' }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <Badge type="red">矛盾</Badge>
        <span style={{ fontSize: 12, color: 'var(--text-ter)' }}>
          置信度 {relation.confidence.toFixed(2)} · 来源: {relation.origin}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
        <div style={{ fontSize: 13, lineHeight: 1.7, padding: 10, background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-ter)', marginBottom: 4 }}>记忆 A (新)</div>
          {source ? source.content : <span style={{ color: 'var(--text-ter)' }}>加载中...</span>}
          {source && (
            <div style={{ marginTop: 6 }}>
              <Link to={`/admin/memories/${source.id}`} style={{ fontSize: 12 }}>查看详情 →</Link>
            </div>
          )}
        </div>
        <div style={{ fontSize: 20, color: 'var(--red, #e53e3e)', alignSelf: 'center' }}>⇔</div>
        <div style={{ fontSize: 13, lineHeight: 1.7, padding: 10, background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-ter)', marginBottom: 4 }}>记忆 B (已有)</div>
          {target ? target.content : <span style={{ color: 'var(--text-ter)' }}>加载中...</span>}
          {target && (
            <div style={{ marginTop: 6 }}>
              <Link to={`/admin/memories/${target.id}`} style={{ fontSize: 12 }}>查看详情 →</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PendingItem({ memory, checked, onToggle, onPromote, onDiscard }: {
  memory: Memory;
  checked: boolean;
  onToggle: () => void;
  onPromote: () => void;
  onDiscard: () => void;
}) {
  const isPending = memory.pending_human_confirm;
  const isLowQuality = memory.quality_score < 0.3;
  let borderColor = 'var(--accent)';
  if (isPending) borderColor = 'var(--amber)';
  else if (isLowQuality) borderColor = 'var(--red)';

  return (
    <div className="card pending-item" style={{ borderLeftColor: borderColor }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          style={{ marginTop: 3, flexShrink: 0, cursor: 'pointer' }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {isPending && <Badge type="amber">⏳ 超时待确认</Badge>}
            {isLowQuality && <Badge type="red">⚠️ 低质量</Badge>}
            <AuthorityBadge authority={memory.authority} />
            {memory.tags?.map((t: string) => <Badge key={t} type="gray">{t}</Badge>)}
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
      </div>
    </div>
  );
}
