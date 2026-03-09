import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { memoryApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { useToast } from '../contexts/ToastContext';
import {
  AuthorityBadge, Badge, EmptyState, ErrorMsg,
  KnowledgeTypeBadge, LifecycleBadge, Loading,
  QualityDot, KNOWLEDGE_TYPE_LABELS,
} from '../components/UI';
import type { Memory, Namespace } from '../types';

// ─── constants ───────────────────────────────────────────────────────────────

const AUTHORITY_OPTIONS: [string, string][] = [['', '全部'], ['LOCKED', '🔒 LOCKED'], ['NORMAL', '🤖 NORMAL']];
const STATUS_OPTIONS: [string, string][] = [['', '全部'], ['ACTIVE', 'ACTIVE'], ['COLD', 'COLD'], ['ARCHIVED', 'ARCHIVED']];
const TYPE_OPTIONS: [string, string][] = [['', '全部'], ...Object.entries(KNOWLEDGE_TYPE_LABELS)];

interface FiltersState {
  namespace_id: string;
  authority: string;
  status: string;
  pending_confirm: string;
  knowledge_type: string;
  tags: string;
  q: string;
  page: number;
}

function chipLabel(key: string, val: string, namespaces: Namespace[]): string {
  if (key === 'namespace_id') return `板块: ${namespaces.find(n => n.id === val)?.name ?? val}`;
  if (key === 'authority') return `权威: ${val === 'LOCKED' ? 'LOCKED' : 'NORMAL'}`;
  if (key === 'status') return `生命周期: ${val}`;
  if (key === 'knowledge_type') return `知识类型: ${KNOWLEDGE_TYPE_LABELS[val as keyof typeof KNOWLEDGE_TYPE_LABELS] ?? val}`;
  if (key === 'tags') return `标签: ${val}`;
  if (key === 'pending_confirm') return '仅待确认';
  return `${key}: ${val}`;
}

const CHIP_KEYS: (keyof FiltersState)[] = ['namespace_id', 'authority', 'status', 'knowledge_type', 'tags', 'pending_confirm'];

// ─── TagFilter ────────────────────────────────────────────────────────────────

function TagFilter({ allTags, selectedRaw, onSet }: { allTags: string[]; selectedRaw: string; onSet: (v: string) => void }) {
  const [tagQ, setTagQ] = useState('');
  const selected = selectedRaw ? selectedRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const filtered = tagQ.trim()
    ? allTags.filter(t => t.toLowerCase().includes(tagQ.trim().toLowerCase()))
    : allTags;

  function toggle(tag: string) {
    const next = selected.includes(tag)
      ? selected.filter(t => t !== tag)
      : [...selected, tag];
    onSet(next.join(','));
  }

  return (
    <Section label="标签">
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map(tag => (
            <span key={tag} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 99, background: 'var(--accent-light)', border: '1px solid var(--accent)', fontSize: 11, color: 'var(--accent)' }}>
              {tag}
              <button onClick={() => toggle(tag)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontSize: 13, lineHeight: 1 }}>×</button>
            </span>
          ))}
        </div>
      )}
      <input
        value={tagQ}
        onChange={e => setTagQ(e.target.value)}
        placeholder={`搜索标签（共 ${allTags.length} 个）...`}
        style={{ width: '100%', fontSize: 12, padding: '5px 8px', marginBottom: 6, boxSizing: 'border-box' }}
      />
      <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {filtered.length === 0
          ? <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>无匹配标签</span>
          : filtered.map(tag => {
              const active = selected.includes(tag);
              return (
                <button key={tag} className={`filter-pill ${active ? 'filter-pill--active' : ''}`} style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => toggle(tag)}>
                  {tag}
                </button>
              );
            })
        }
      </div>
    </Section>
  );
}

// ─── FilterDropdown ───────────────────────────────────────────────────────────

interface FilterDropdownProps {
  filters: FiltersState;
  namespaces: Namespace[];
  allTags: string[];
  onSet: (key: string, val: string) => void;
  onClearAll: () => void;
}

function FilterDropdown({ filters, namespaces, allTags, onSet, onClearAll }: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeCount = CHIP_KEYS.filter(k => filters[k]).length;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className={activeCount > 0 ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
      >
        🔧 筛选{activeCount > 0 ? ` (${activeCount})` : ''} ▾
      </button>

      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 200, width: 300, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,.12)', padding: 16 }}>
          <Section label="板块">
            <select value={filters.namespace_id} onChange={e => onSet('namespace_id', e.target.value)} style={{ width: '100%', fontSize: 13 }}>
              <option value="">全部板块</option>
              {namespaces.map(ns => <option key={ns.id} value={ns.id}>{ns.name}</option>)}
            </select>
          </Section>
          <Section label="知识类型">
            <PillRow options={TYPE_OPTIONS} value={filters.knowledge_type} onChange={v => onSet('knowledge_type', v)} />
          </Section>
          <Section label="生命周期">
            <PillRow options={STATUS_OPTIONS} value={filters.status} onChange={v => onSet('status', v)} />
          </Section>
          <Section label="权威等级">
            <PillRow options={AUTHORITY_OPTIONS} value={filters.authority} onChange={v => onSet('authority', v)} />
          </Section>
          {allTags.length > 0 && (
            <TagFilter allTags={allTags} selectedRaw={filters.tags} onSet={v => onSet('tags', v)} />
          )}
          <Section label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input type="checkbox" checked={filters.pending_confirm === 'true'} onChange={e => onSet('pending_confirm', e.target.checked ? 'true' : '')} />
              仅待确认
            </label>
          </Section>
          {activeCount > 0 && (
            <button className="btn-sm btn-secondary" style={{ width: '100%', marginTop: 8, fontSize: 12 }} onClick={() => { onClearAll(); setOpen(false); }}>
              清除全部筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>}
      {children}
    </div>
  );
}

function PillRow({ options, value, onChange }: { options: [string, string][]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(([val, label]) => (
        <button key={val} className={`filter-pill ${value === val ? 'filter-pill--active' : ''}`} style={{ fontSize: 12, padding: '3px 10px' }} onClick={() => onChange(val)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EMPTY_FILTERS: FiltersState = {
  namespace_id: '', authority: '', status: '', pending_confirm: '',
  knowledge_type: '', tags: '', q: '', page: 1,
};

const PAGE_SIZE = 40;

function useUrlFilters(boardId?: string): [FiltersState, (key: string, val: string) => void, (f: FiltersState) => void] {
  const [params, setParams] = useSearchParams();
  const readFilters = useCallback((): FiltersState => ({
    namespace_id: params.get('namespace_id') || boardId || '',
    authority: params.get('authority') || '',
    status: params.get('status') || '',
    pending_confirm: params.get('pending_confirm') || '',
    knowledge_type: params.get('knowledge_type') || '',
    tags: params.get('tags') || '',
    q: params.get('q') || '',
    page: parseInt(params.get('page') || '1', 10) || 1,
  }), [params, boardId]);

  const writeFilters = useCallback((f: FiltersState) => {
    setParams(() => {
      const next = new URLSearchParams();
      Object.entries(f).forEach(([k, v]) => {
        const strV = String(v);
        const defaultV = k === 'page' ? '1' : (k === 'namespace_id' ? (boardId || '') : '');
        if (strV && strV !== defaultV) next.set(k, strV);
      });
      return next;
    }, { replace: true });
  }, [boardId, setParams]);

  const setFilter = useCallback((key: string, val: string) => {
    const current = readFilters();
    writeFilters({ ...current, [key]: val, page: 1 });
  }, [readFilters, writeFilters]);

  return [readFilters(), setFilter, writeFilters];
}

export default function MemoryList() {
  const { boardId } = useParams<{ boardId?: string }>();
  const { myNamespaces } = useUser();
  const [filters, setFilter, setFilters] = useUrlFilters(boardId);
  const namespaces = myNamespaces || [];
  const [allTags, setAllTags] = useState<string[]>([]);
  const [debouncedQ, setDebouncedQ] = useState(filters.q);

  useEffect(() => {
    memoryApi.tags(filters.namespace_id || undefined)
      .then(setAllTags)
      .catch(err => console.warn('Failed to load tags:', err));
  }, [filters.namespace_id]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  const apiFilters = { ...cleanFilters(filters), ...(debouncedQ ? { q: debouncedQ } : {}), size: PAGE_SIZE };
  const { data, loading, error, refetch } = useAsync(
    () => memoryApi.list(apiFilters),
    [debouncedQ, filters.namespace_id, filters.authority, filters.status, filters.pending_confirm, filters.knowledge_type, filters.tags, filters.page]
  );

  const memories = data?.items;
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function clearAll() {
    setFilters({ ...EMPTY_FILTERS, namespace_id: boardId || '' });
    setDebouncedQ('');
  }

  const activeChips = CHIP_KEYS.filter(k => filters[k]);
  const keyword = filters.q.trim().toLowerCase();

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">记忆管理</h1>
      </div>

      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, color: 'var(--text-ter)', flexShrink: 0 }}>🔍</span>

          {activeChips.map(key => (
            <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 99, background: 'var(--accent-light)', border: '1px solid var(--accent)', fontSize: 12, color: 'var(--accent)', fontWeight: 500, whiteSpace: 'nowrap' }}>
              {chipLabel(key as string, String(filters[key]), namespaces)}
              <button onClick={() => setFilter(key as string, '')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--accent)', fontSize: 13 }}>×</button>
            </span>
          ))}

          <input
            value={filters.q}
            onChange={e => setFilter('q', e.target.value)}
            placeholder="输入关键词过滤..."
            style={{ flex: '1 1 120px', minWidth: 80, border: 'none', outline: 'none', background: 'transparent', fontSize: 13, padding: '4px 0' }}
          />

          <FilterDropdown filters={filters} namespaces={namespaces} allTags={allTags} onSet={setFilter} onClearAll={clearAll} />
        </div>
      </div>

      {loading ? <Loading /> :
        error ? <ErrorMsg message={error} onRetry={refetch} /> :
        !memories?.length ? <EmptyState icon="🧠" message="没有匹配的记忆" /> :
        <div className="card" style={{ padding: '0 16px' }}>
          {memories.map(m => <MemoryRow key={m.id} memory={m} keyword={keyword} onRestored={refetch} />)}
        </div>
      }

      {totalCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button className="btn-sm btn-secondary" disabled={filters.page <= 1} onClick={() => setFilters({ ...filters, page: filters.page - 1 })}>← 上一页</button>
          <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>第 {filters.page} 页 / 共 {totalPages} 页（{totalCount} 条）</span>
          <button className="btn-sm btn-secondary" disabled={filters.page >= totalPages} onClick={() => setFilters({ ...filters, page: filters.page + 1 })}>下一页 →</button>
        </div>
      )}
    </div>
  );
}

// ─── MemoryRow ────────────────────────────────────────────────────────────────

function highlight(text: string, kw: string): React.ReactNode {
  if (!kw) return text;
  const idx = text.toLowerCase().indexOf(kw);
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--accent-light)', color: 'var(--accent)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + kw.length)}
      </mark>
      {text.slice(idx + kw.length)}
    </>
  );
}

function MemoryRow({ memory, keyword, onRestored }: { memory: Memory; keyword: string; onRestored: () => void }) {
  const { addToast } = useToast();
  const [restoring, setRestoring] = useState(false);
  const lifecycleStatus = (memory.status || memory.lifecycle_status) as string | undefined;
  const canRestore = lifecycleStatus === 'COLD' || lifecycleStatus === 'ARCHIVED';
  const preview = memory.content.length > 160 ? memory.content.slice(0, 160) + '…' : memory.content;

  async function handleRestore(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRestoring(true);
    try {
      await memoryApi.restore(memory.id);
      addToast('success', '记忆已恢复');
      onRestored();
    } catch (err: any) {
      addToast('error', err.message || '恢复失败');
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="memory-row">
      <div style={{ flex: 1 }}>
        <Link to={`/admin/memories/${memory.id}`} style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 13, lineHeight: 1.6, display: 'block', marginBottom: 6 }}>
          {highlight(preview, keyword)}
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <AuthorityBadge authority={memory.authority} />
          <LifecycleBadge status={(memory.status || memory.lifecycle_status)!} />
          {memory.knowledge_type && <KnowledgeTypeBadge type={memory.knowledge_type} />}
          {memory.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
          {memory.pending_human_confirm && <Badge type="amber">⏳ 待确认</Badge>}
          {canRestore && (
            <button
              className="btn-sm btn-secondary"
              style={{ fontSize: 11, padding: '1px 8px' }}
              onClick={handleRestore}
              disabled={restoring}
            >
              {restoring ? '恢复中...' : '♻️ 恢复'}
            </button>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: 12, whiteSpace: 'nowrap', minWidth: 56, marginLeft: 12 }}>
        <QualityDot score={memory.quality_score} />
        <div style={{ color: 'var(--text-ter)', marginTop: 2 }}>质量分</div>
      </div>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function cleanFilters(f: FiltersState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') out[k] = v; });
  return out;
}
