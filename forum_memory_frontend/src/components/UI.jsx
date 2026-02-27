import React from 'react';

export function Badge({ type = 'gray', children }) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

export function StatusBadge({ status }) {
  const map = {
    OPEN: { type: 'blue', label: '进行中' },
    RESOLVED: { type: 'green', label: '✓ 已解决' },
    TIMEOUT_CLOSED: { type: 'amber', label: '⏰ 超时关闭' },
  };
  const s = map[status] || { type: 'gray', label: status };
  return <Badge type={s.type}>{s.label}</Badge>;
}

export function AuthorityBadge({ authority }) {
  return authority === 'LOCKED'
    ? <Badge type="green">🔒 LOCKED</Badge>
    : <Badge type="blue">🤖 NORMAL</Badge>;
}

export function LifecycleBadge({ status }) {
  const map = { ACTIVE: 'green', COLD: 'amber', ARCHIVED: 'gray', DELETED: 'red' };
  return <Badge type={map[status] || 'gray'}>{status}</Badge>;
}

export function Loading() {
  return <div className="empty-state fade-in"><div className="empty-state__icon">⏳</div>加载中...</div>;
}

export function ErrorMsg({ message, onRetry }) {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state__icon">⚠️</div>
      <p>{message}</p>
      {onRetry && <button className="btn-primary" onClick={onRetry} style={{ marginTop: 12 }}>重试</button>}
    </div>
  );
}

export function EmptyState({ icon = '📭', message = '暂无数据' }) {
  return <div className="empty-state fade-in"><div className="empty-state__icon">{icon}</div>{message}</div>;
}

export function Pagination({ page, total, size = 20, onChange }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      {Array.from({ length: Math.min(pages, 7) }, (_, i) => i + 1).map(p => (
        <button key={p} className={p === page ? 'btn-primary' : 'btn-secondary btn-sm'} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

export function ConfirmModal({ open, title, message, onConfirm, onCancel }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, maxWidth: 400, width: '90%' }}>
        <h3 style={{ marginBottom: 8 }}>{title}</h3>
        <p style={{ color: 'var(--text-sec)', fontSize: 14, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel}>取消</button>
          <button className="btn-primary" onClick={onConfirm}>确认</button>
        </div>
      </div>
    </div>
  );
}

export function TimeAgo({ date }) {
  if (!date) return null;
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return <span>刚刚</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)} 分钟前</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)} 小时前</span>;
  if (diff < 604800) return <span>{Math.floor(diff / 86400)} 天前</span>;
  return <span>{d.toLocaleDateString('zh-CN')}</span>;
}

export function QualityDot({ score }) {
  const color = score > 0.8 ? 'var(--green)' : score > 0.5 ? 'var(--text)' : 'var(--red)';
  return <span style={{ color, fontWeight: 700 }}>{score.toFixed(2)}</span>;
}

export const KNOWLEDGE_TYPE_LABELS = {
  how_to: '操作指南',
  troubleshoot: '故障排查',
  best_practice: '最佳实践',
  gotcha: '常见陷阱',
  faq: '常见问题',
};

export function KnowledgeTypeBadge({ type }) {
  if (!type) return null;
  const label = KNOWLEDGE_TYPE_LABELS[type] || type;
  return <Badge type="gray">{label}</Badge>;
}
