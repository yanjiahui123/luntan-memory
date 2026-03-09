import React from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUrlState } from '../hooks/useUrlState';
import { Loading, ErrorMsg, EmptyState, Badge, Pagination } from '../components/UI';
import type { OperationLog } from '../types';

const PAGE_SIZE = 30;

const OPERATION_LABELS: Record<string, string> = {
  CREATE: '创建',
  UPDATE: '更新',
  DELETE: '删除',
  RESTORE: '恢复',
  AUTHORITY_CHANGE: '权威变更',
  LIFECYCLE_TRANSITION: '生命周期变更',
  QUALITY_FLAG: '质量标记',
};

const OPERATION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  RESTORE: 'green',
  AUTHORITY_CHANGE: 'amber',
  LIFECYCLE_TRANSITION: 'gray',
  QUALITY_FLAG: 'amber',
};

export default function AuditLog() {
  const [page, setPage] = useUrlState('page', 1);
  const [operation, setOperation] = useUrlState('operation', '');
  const [memoryId, setMemoryId] = useUrlState('memory_id', '');

  const { data, loading, error, refetch } = useAsync(
    () => adminApi.auditLogs({
      operation: operation || undefined,
      memory_id: memoryId || undefined,
      page,
      size: PAGE_SIZE,
    }),
    [operation, memoryId, page],
  );

  const logs = data?.items;
  const totalCount = data?.total || 0;

  const operationOptions = ['', 'CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'AUTHORITY_CHANGE', 'LIFECYCLE_TRANSITION', 'QUALITY_FLAG'];

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">审计日志</h1>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap', gap: 8 }}>
        {operationOptions.map(op => (
          <button
            key={op}
            className={`filter-pill ${operation === op ? 'filter-pill--active' : ''}`}
            onClick={() => { setOperation(op); setPage(1); }}
          >
            {op ? (OPERATION_LABELS[op] || op) : '全部'}
          </button>
        ))}

        {memoryId && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 8px', borderRadius: 99,
            background: 'var(--accent-light)', border: '1px solid var(--accent)',
            fontSize: 12, color: 'var(--accent)', fontWeight: 500,
          }}>
            记忆: {memoryId.slice(0, 8)}...
            <button
              onClick={() => { setMemoryId(''); setPage(1); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--accent)', fontSize: 13 }}
            >
              ×
            </button>
          </span>
        )}
      </div>

      {loading ? <Loading /> :
        error ? <ErrorMsg message={error} onRetry={refetch} /> :
        !logs?.length ? <EmptyState icon="📋" message="没有审计日志" /> :
        <div className="card" style={{ padding: '0 16px' }}>
          {logs.map(log => <AuditLogRow key={log.id} log={log} onFilterMemory={(id) => { setMemoryId(id); setPage(1); }} />)}
        </div>
      }

      <Pagination page={page} total={totalCount} size={PAGE_SIZE} onChange={setPage} />
    </div>
  );
}

function AuditLogRow({ log, onFilterMemory }: { log: OperationLog; onFilterMemory: (id: string) => void }) {
  const opLabel = OPERATION_LABELS[log.operation] || log.operation;
  const opColor = OPERATION_COLORS[log.operation] || 'gray';
  const time = new Date(log.created_at).toLocaleString('zh-CN');

  return (
    <div style={{
      padding: '12px 0',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
          <Badge type={opColor as 'green' | 'blue' | 'red' | 'amber' | 'gray'}>{opLabel}</Badge>
          <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>
            {log.operator_type === 'system' ? '🤖 系统' : `👤 ${log.operator_id?.slice(0, 8) ?? '未知'}...`}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>{time}</span>
        </div>

        <div style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-sec)' }}>记忆:</span>
          <Link
            to={`/admin/memories/${log.memory_id}`}
            style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}
          >
            {log.memory_id.slice(0, 12)}...
          </Link>
          <button
            onClick={() => onFilterMemory(log.memory_id)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-ter)', padding: 0, textDecoration: 'underline' }}
            title="筛选此记忆的所有操作"
          >
            筛选
          </button>
        </div>

        {log.reason && (
          <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 4 }}>
            原因: {log.reason}
          </div>
        )}

        {(log.before_snapshot || log.after_snapshot) && (
          <SnapshotDiff before={log.before_snapshot} after={log.after_snapshot} />
        )}
      </div>
    </div>
  );
}

function SnapshotDiff({ before, after }: { before: Record<string, unknown> | null; after: Record<string, unknown> | null }) {
  if (!before && !after) return null;

  const allKeys = new Set([
    ...Object.keys(before || {}),
    ...Object.keys(after || {}),
  ]);

  const changedKeys = [...allKeys].filter(k => {
    const bv = before?.[k];
    const av = after?.[k];
    return JSON.stringify(bv) !== JSON.stringify(av);
  });

  if (changedKeys.length === 0) return null;

  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ fontSize: 11, color: 'var(--text-ter)', cursor: 'pointer' }}>
        变更详情 ({changedKeys.length} 个字段)
      </summary>
      <div style={{
        marginTop: 4, padding: 8,
        background: 'var(--surface-alt)', borderRadius: 'var(--radius)',
        fontSize: 11, lineHeight: 1.8, fontFamily: 'monospace',
      }}>
        {changedKeys.map(k => (
          <div key={k}>
            <span style={{ color: 'var(--text-sec)' }}>{k}:</span>{' '}
            <span style={{ color: 'var(--red)', textDecoration: 'line-through' }}>{formatVal(before?.[k])}</span>
            {' → '}
            <span style={{ color: 'var(--green)' }}>{formatVal(after?.[k])}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

function formatVal(v: unknown): string {
  if (v === null || v === undefined) return '(空)';
  if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  return JSON.stringify(v);
}
