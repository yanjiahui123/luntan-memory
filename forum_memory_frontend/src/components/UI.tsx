import React from 'react';
import type { ThreadStatus, MemoryAuthority, MemoryLifecycle, KnowledgeType } from '../types';

// ── Badge ──────────────────────────────────────────────────────────────────

interface BadgeProps {
  type?: string;
  children: React.ReactNode;
}

export function Badge({ type = 'gray', children }: BadgeProps) {
  return <span className={`badge badge-${type}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: ThreadStatus }) {
  const map: Record<ThreadStatus, { type: string; label: string }> = {
    OPEN: { type: 'blue', label: '进行中' },
    RESOLVED: { type: 'green', label: '✓ 已解决' },
    TIMEOUT_CLOSED: { type: 'amber', label: '⏰ 超时关闭' },
    DELETED: { type: 'red', label: '已删除' },
  };
  const s = map[status] ?? { type: 'gray', label: status };
  return <Badge type={s.type}>{s.label}</Badge>;
}

export function AuthorityBadge({ authority }: { authority: MemoryAuthority }) {
  return authority === 'LOCKED'
    ? <Badge type="green">🔒 LOCKED</Badge>
    : <Badge type="blue">🤖 NORMAL</Badge>;
}

export function LifecycleBadge({ status }: { status: MemoryLifecycle }) {
  const map: Record<MemoryLifecycle, string> = { ACTIVE: 'green', COLD: 'amber', ARCHIVED: 'gray', DELETED: 'red' };
  return <Badge type={map[status] ?? 'gray'}>{status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string | null | undefined }) {
  if (!priority) return null;
  const cfg: Record<string, { type: string; label: string }> = {
    P0: { type: 'red', label: 'P0 紧急' },
    P1: { type: 'amber', label: 'P1 高' },
    P2: { type: 'blue', label: 'P2 中' },
    P3: { type: 'gray', label: 'P3 低' },
  };
  const c = cfg[priority] ?? { type: 'gray', label: priority };
  return <Badge type={c.type}>{c.label}</Badge>;
}

export function AccessModeBadge({ mode }: { mode: string | null | undefined }) {
  if (!mode || mode === 'public') return null;
  const cfg: Record<string, { type: string; label: string }> = {
    restricted: { type: 'amber', label: '🔒 受限' },
    private: { type: 'red', label: '🔐 私有' },
  };
  const c = cfg[mode] ?? { type: 'gray', label: mode };
  return <Badge type={c.type}>{c.label}</Badge>;
}

// ── State indicators ───────────────────────────────────────────────────────

export function Loading() {
  return <div className="empty-state fade-in"><div className="empty-state__icon">⏳</div>加载中...</div>;
}

interface ErrorMsgProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorMsg({ message, onRetry }: ErrorMsgProps) {
  return (
    <div className="empty-state fade-in">
      <div className="empty-state__icon">⚠️</div>
      <p>{message}</p>
      {onRetry && <button className="btn-primary" onClick={onRetry} style={{ marginTop: 12 }}>重试</button>}
    </div>
  );
}

interface EmptyStateProps {
  icon?: string;
  message?: string;
}

export function EmptyState({ icon = '📭', message = '暂无数据' }: EmptyStateProps) {
  return <div className="empty-state fade-in"><div className="empty-state__icon">{icon}</div>{message}</div>;
}

// ── Pagination ─────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  total: number;
  size?: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, size = 20, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;

  // Build page list with ellipsis: always show first, last, and current ±2
  const visible = new Set([1, pages]);
  for (let p = Math.max(1, page - 2); p <= Math.min(pages, page + 2); p++) visible.add(p);
  const sorted = [...visible].sort((a, b) => a - b);
  const items: (number | string)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push('...');
    items.push(p);
  });

  return (
    <div className="pagination">
      <button className="btn-secondary btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      {items.map((item, i) =>
        item === '...'
          ? <span key={`e${i}`} style={{ padding: '4px 4px', color: 'var(--text-ter)', fontSize: 13 }}>…</span>
          : <button key={item} className={item === page ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} onClick={() => onChange(item as number)}>{item}</button>
      )}
      <button className="btn-secondary btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

// ── ConfirmModal ───────────────────────────────────────────────────────────

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string | null;
}

export function ConfirmModal({ open, title, message, onConfirm, onCancel, loading, error }: ConfirmModalProps) {
  if (!open) return null;
  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={e => { if (e.target === e.currentTarget && !loading) onCancel(); }}
    >
      <div className="card fade-in" style={{ padding: 24, maxWidth: 400, width: '90%' }}>
        <h3 style={{ marginBottom: 8 }}>{title}</h3>
        <p style={{ color: 'var(--text-sec)', fontSize: 14, marginBottom: error ? 8 : 20 }}>{message}</p>
        {error && <p style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 16 }}>{error}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>取消</button>
          <button className="btn-primary" onClick={onConfirm} disabled={loading}>{loading ? '处理中...' : '确认'}</button>
        </div>
      </div>
    </div>
  );
}

// ── TagChipsInput ──────────────────────────────────────────────────────────

interface TagChipsInputProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TagChipsInput({ value = '', onChange, placeholder = '输入标签后按 Enter 或逗号添加' }: TagChipsInputProps) {
  const [input, setInput] = React.useState('');
  const tags = value ? value.split(',').map(t => t.trim()).filter(Boolean) : [];

  function addTag(raw: string) {
    const t = raw.trim();
    if (!t || tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t].join(','));
    setInput('');
  }

  function removeTag(tag: string) {
    onChange(tags.filter(t => t !== tag).join(','));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div
      style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center', padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', background: 'var(--surface)', minHeight: 40, cursor: 'text' }}
      onClick={e => (e.currentTarget.querySelector('input') as HTMLInputElement | null)?.focus()}
    >
      {tags.map(tag => (
        <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 99, background: 'var(--accent-light)', color: 'var(--accent)', fontSize: 12, fontWeight: 600 }}>
          {tag}
          <button type="button" onClick={() => removeTag(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: 0, fontSize: 15, lineHeight: 1, display: 'flex', alignItems: 'center' }}>×</button>
        </span>
      ))}
      <input
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => input.trim() && addTag(input)}
        placeholder={tags.length === 0 ? placeholder : ''}
        style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, minWidth: 80, flex: 1, padding: '2px 0', fontFamily: 'var(--font)' }}
      />
    </div>
  );
}

// ── Time / Quality helpers ─────────────────────────────────────────────────

export function TimeAgo({ date }: { date: string | null | undefined }) {
  if (!date) return null;
  const d = new Date(date);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return <span>刚刚</span>;
  if (diff < 3600) return <span>{Math.floor(diff / 60)} 分钟前</span>;
  if (diff < 86400) return <span>{Math.floor(diff / 3600)} 小时前</span>;
  if (diff < 604800) return <span>{Math.floor(diff / 86400)} 天前</span>;
  return <span>{d.toLocaleDateString('zh-CN')}</span>;
}

export function QualityDot({ score }: { score: number }) {
  const color = score > 0.8 ? 'var(--green)' : score > 0.5 ? 'var(--text)' : 'var(--red)';
  return <span style={{ color, fontWeight: 700 }}>{score.toFixed(2)}</span>;
}

// ── KnowledgeType ──────────────────────────────────────────────────────────

export const KNOWLEDGE_TYPE_LABELS: Record<KnowledgeType, string> = {
  how_to: '操作指南',
  troubleshoot: '故障排查',
  best_practice: '最佳实践',
  gotcha: '常见陷阱',
  faq: '常见问题',
};

export function KnowledgeTypeBadge({ type }: { type: KnowledgeType | null | undefined }) {
  if (!type) return null;
  const label = KNOWLEDGE_TYPE_LABELS[type] ?? type;
  return <Badge type="gray">{label}</Badge>;
}
