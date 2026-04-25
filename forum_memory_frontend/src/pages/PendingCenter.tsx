import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { memoryApi, adminApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUrlState } from '../hooks/useUrlState';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, EmptyState, Badge, AuthorityBadge, QualityDot, Pagination, PendingReasonBadge } from '../components/UI';
import type { Memory, QualityAlert, MemoryRelation } from '../types';
import type { MemoryListParams } from '../api/client';

const PAGE_SIZE = 10;

// Tab 结构按 pending_reason 互斥分类，避免多 tab 重复展示同一条记忆。
// - all:               pending_confirm=True 总览
// - timeout:           pending_reason = TIMEOUT
// - low_quality:       pending_reason = LOW_QUALITY
// - quality_alert:     pending_reason ∈ {WRONG_FEEDBACK, ADMIN_DELETE}（admin /quality-alerts 接口默认返回集）
// - locked_arbitration: AUDN 产出的 LOCKED 关联关系对（CONTRADICTS / SUPPLEMENTS / SUPERSEDES）成对展示并裁决
//   注意：原 "AUDN 审批" tab 与 "矛盾对" tab 已合并为本 tab，以 RelationPair 形式统一处理。
const TABS = [
  { key: 'all', label: '全部待处理' },
  { key: 'timeout', label: '超时待审' },
  { key: 'low_quality', label: '低质量待审' },
  { key: 'quality_alert', label: '质量告警' },
  { key: 'locked_arbitration', label: 'LOCKED 关联裁决' },
] as const;

type TabKey = typeof TABS[number]['key'];

export default function PendingCenter() {
  const { boardId } = useParams<{ boardId?: string }>();
  const [tab, setTab] = useUrlState('tab', 'all', ['page']) as [string, (v: string) => void];

  return (
    <div>
      <div style={{ position: 'sticky', top: 'var(--topbar-h)', zIndex: 10, background: 'var(--bg)', paddingBottom: 4 }}>
        <h1 className="page-title" style={{ marginBottom: 12 }}>待处理中心</h1>
        <div className="tabs">
          {TABS.map(t => (
            <button key={t.key} className={`tab ${tab === t.key ? 'tab--active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <TabContent tab={tab} boardId={boardId} />
    </div>
  );
}

type MemoryTabKey = Exclude<TabKey, 'quality_alert' | 'locked_arbitration'>;

function TabContent({ tab, boardId }: { tab: string; boardId?: string }) {
  if (tab === 'quality_alert') return <QualityAlertTab boardId={boardId} />;
  if (tab === 'locked_arbitration') return <ContradictionsTab boardId={boardId} />;
  return <MemoryTab tab={tab as MemoryTabKey} boardId={boardId} />;
}

// 把 tab key 映射到 /memories 的过滤参数（互斥分类）。
function buildTabFilter(tab: MemoryTabKey): Partial<MemoryListParams> {
  if (tab === 'all') return { pending_confirm: true };
  if (tab === 'timeout') return { pending_reason: 'TIMEOUT' };
  if (tab === 'low_quality') return { pending_reason: 'LOW_QUALITY' };
  return { pending_confirm: true };
}

function MemoryTab({ tab, boardId }: { tab: MemoryTabKey; boardId?: string }) {
  const { addToast } = useToast();
  const [page, setPage] = useUrlState('page', 1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  const nsFilter = boardId ? { namespace_id: boardId } : {};
  const base = { ...nsFilter, page, size: PAGE_SIZE };

  const tabFilter = buildTabFilter(tab);
  const params: MemoryListParams = { ...base, ...tabFilter };

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
  const { boardId } = useParams<{ boardId?: string }>();
  const detailPath = boardId ? `/admin/boards/${boardId}/memories/${memory.id}` : `/admin/memories/${memory.id}`;
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
        <Link to={detailPath}>
          <button className="btn-secondary btn-sm">查看详情</button>
        </Link>
      </div>
    </div>
  );
}

// 关系类型 → UI 元数据（标签、颜色、symbol、可执行操作集）
type RelationActionKey = 'keep_source' | 'keep_target' | 'keep_both';
interface RelationActionMeta {
  key: RelationActionKey;
  label: string;
  className: string;
}
interface RelationTypeMeta {
  badge: string;
  badgeType: 'red' | 'amber' | 'gray';
  symbol: string;
  borderColor: string;
  description: string;
  actions: RelationActionMeta[];
}

const RELATION_TYPE_META: Record<string, RelationTypeMeta> = {
  CONTRADICTS: {
    badge: '矛盾',
    badgeType: 'red',
    symbol: '⇔',
    borderColor: 'var(--red, #e53e3e)',
    description: '新事实与 LOCKED 记忆冲突，需选择采纳哪一方。',
    actions: [
      { key: 'keep_source', label: '采纳 A (新)', className: 'btn-success btn-sm' },
      { key: 'keep_target', label: '采纳 B (已有)', className: 'btn-primary btn-sm' },
      { key: 'keep_both', label: '保留两者', className: 'btn-secondary btn-sm' },
    ],
  },
  SUPPLEMENTS: {
    badge: '补充',
    badgeType: 'amber',
    symbol: '＋',
    borderColor: 'var(--amber, #d97706)',
    description: '新事实补充已有 LOCKED 记忆，确认是否接受补充。',
    actions: [
      { key: 'keep_both', label: '✓ 接受补充', className: 'btn-success btn-sm' },
      { key: 'keep_target', label: '丢弃 A (新)', className: 'btn-danger btn-sm' },
    ],
  },
  SUPERSEDES: {
    badge: '取代',
    badgeType: 'red',
    symbol: '⇒',
    borderColor: 'var(--red, #e53e3e)',
    description: '新事实拟取代已有 LOCKED 记忆，需人工确认。',
    actions: [
      { key: 'keep_source', label: '采纳替代 (A 取代 B)', className: 'btn-success btn-sm' },
      { key: 'keep_target', label: '拒绝替代 (保留 B)', className: 'btn-primary btn-sm' },
      { key: 'keep_both', label: '保留两者', className: 'btn-secondary btn-sm' },
    ],
  },
};

function getRelationMeta(relationType: string): RelationTypeMeta {
  return RELATION_TYPE_META[relationType] || RELATION_TYPE_META.CONTRADICTS;
}

function ContradictionsTab({ boardId }: { boardId?: string }) {
  const { addToast } = useToast();
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

  async function handleResolve(relationId: string, action: string, reason: string) {
    try {
      await adminApi.resolveContradiction(relationId, { action, reason });
      addToast('success', '已裁决');
      refetch();
    } catch (err) {
      const msg = err instanceof Error ? err.message : '裁决失败';
      addToast('error', msg);
    }
  }

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;
  if (!relItems.length) return <EmptyState icon="✅" message="暂无 LOCKED 关联待裁决" />;

  return (
    <div>
      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--text-sec)' }}>
        共 {data?.total || 0} 对 LOCKED 关联记忆需要人工裁决（含矛盾 / 补充 / 取代）。
      </div>
      {relItems.map(rel => (
        <ContradictionPair key={rel.id} relation={rel} memMap={memMap} onResolve={handleResolve} />
      ))}
      <Pagination page={page} total={data?.total || 0} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function ContradictionPair({
  relation, memMap, onResolve,
}: {
  relation: MemoryRelation;
  memMap: Map<string, Memory>;
  onResolve: (relationId: string, action: string, reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [resolving, setResolving] = useState(false);
  const source = memMap.get(relation.source_memory_id);
  const target = memMap.get(relation.target_memory_id);
  const meta = getRelationMeta(relation.relation_type);

  async function handleAction(action: string) {
    setResolving(true);
    try {
      await onResolve(relation.id, action, reason);
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 14, marginBottom: 10, borderLeft: `3px solid ${meta.borderColor}` }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge type={meta.badgeType}>{meta.badge}</Badge>
        <span style={{ fontSize: 12, color: 'var(--text-ter)' }}>
          {meta.description} · 置信度 {relation.confidence.toFixed(2)} · 来源: {relation.origin}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, alignItems: 'start' }}>
        <MemorySide label="记忆 A (新)" memory={source} />
        <div style={{ fontSize: 20, color: meta.borderColor, alignSelf: 'center' }}>{meta.symbol}</div>
        <MemorySide label="记忆 B (已有)" memory={target} />
      </div>
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border, #e2e8f0)' }}>
        <input
          type="text"
          placeholder="裁决理由（可选）"
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={resolving}
          style={{ width: '100%', marginBottom: 8, padding: '6px 10px', fontSize: 13, border: '1px solid var(--border, #e2e8f0)', borderRadius: 'var(--radius, 4px)' }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {meta.actions.map(act => (
            <button
              key={act.key}
              className={act.className}
              disabled={resolving}
              onClick={() => handleAction(act.key)}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MemorySide({ label, memory }: { label: string; memory: Memory | undefined }) {
  const { boardId } = useParams<{ boardId?: string }>();
  const memoryBase = boardId ? `/admin/boards/${boardId}/memories` : '/admin/memories';
  const detailPath = memory ? `${memoryBase}/${memory.id}` : '#';
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, padding: 10, background: 'var(--surface)', borderRadius: 'var(--radius)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-ter)', marginBottom: 4 }}>{label}</div>
      {memory ? memory.content : <span style={{ color: 'var(--text-ter)' }}>加载中...</span>}
      {memory && (
        <div style={{ marginTop: 6 }}>
          <Link to={detailPath} style={{ fontSize: 12 }}>查看详情 →</Link>
        </div>
      )}
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
  const { boardId } = useParams<{ boardId?: string }>();
  const detailPath = boardId ? `/admin/boards/${boardId}/memories/${memory.id}` : `/admin/memories/${memory.id}`;
  const isPending = memory.pending_human_confirm;
  const isLowQualityScore = memory.quality_score < 0.3;
  let borderColor = 'var(--accent)';
  if (isPending) borderColor = 'var(--amber)';
  else if (isLowQualityScore) borderColor = 'var(--red)';

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
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <PendingReasonBadge reason={memory.pending_reason} />
            {isLowQualityScore && !memory.pending_reason && <Badge type="red">⚠️ 低分</Badge>}
            <AuthorityBadge authority={memory.authority} />
            {memory.tags?.map((t: string) => <Badge key={t} type="gray">{t}</Badge>)}
          </div>

          <div style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 6 }}>{memory.content}</div>

          <div style={{ fontSize: 12, color: 'var(--text-ter)', marginBottom: 8 }}>
            质量分: <QualityDot score={memory.quality_score} /> · 来源: {memory.resolved_type} · {memory.source_role}
          </div>

          <div className="pending-item__actions">
            {memory.authority !== 'LOCKED' && (
              <button className="btn-success btn-sm" onClick={onPromote}>✓ 确认入库 (晋升 LOCKED)</button>
            )}
            <button className="btn-danger btn-sm" onClick={onDiscard}>丢弃</button>
            <Link to={detailPath}>
              <button className="btn-secondary btn-sm">查看详情</button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
