import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { memoryApi, namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import {
  AuthorityBadge, Badge, EmptyState, ErrorMsg,
  KnowledgeTypeBadge, LifecycleBadge, Loading,
  QualityDot, KNOWLEDGE_TYPE_LABELS,
} from '../components/UI';

// ─── constants ───────────────────────────────────────────────────────────────

const AUTHORITY_OPTIONS = [['', '全部'], ['LOCKED', '🔒 LOCKED'], ['NORMAL', '🤖 NORMAL']];
const STATUS_OPTIONS    = [['', '全部'], ['ACTIVE', 'ACTIVE'], ['COLD', 'COLD'], ['ARCHIVED', 'ARCHIVED']];
const TYPE_OPTIONS      = [['', '全部'], ...Object.entries(KNOWLEDGE_TYPE_LABELS)];

// Human-readable label for each filter key
function chipLabel(key, val, namespaces) {
  if (key === 'namespace_id') return `板块: ${namespaces.find(n => n.id === val)?.name ?? val}`;
  if (key === 'authority')    return `权威: ${val === 'LOCKED' ? 'LOCKED' : 'NORMAL'}`;
  if (key === 'status')       return `生命周期: ${val}`;
  if (key === 'knowledge_type') return `知识类型: ${KNOWLEDGE_TYPE_LABELS[val] ?? val}`;
  if (key === 'tags')         return `标签: ${val}`;
  if (key === 'pending_confirm') return '仅待确认';
  return `${key}: ${val}`;
}

// Keys that produce a visible chip when set
const CHIP_KEYS = ['namespace_id', 'authority', 'status', 'knowledge_type', 'tags', 'pending_confirm'];

// ─── TagFilter ────────────────────────────────────────────────────────────────

function TagFilter({ allTags, selectedRaw, onSet }) {
  const [tagQ, setTagQ] = useState('');
  const selected = selectedRaw ? selectedRaw.split(',').map(t => t.trim()).filter(Boolean) : [];

  const filtered = tagQ.trim()
    ? allTags.filter(t => t.toLowerCase().includes(tagQ.trim().toLowerCase()))
    : allTags;

  function toggle(tag) {
    const next = selected.includes(tag)
      ? selected.filter(t => t !== tag)
      : [...selected, tag];
    onSet(next.join(','));
  }

  return (
    <Section label="标签">
      {/* Selected tags as small chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map(tag => (
            <span
              key={tag}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 3,
                padding: '2px 7px', borderRadius: 99,
                background: 'var(--accent-light)', border: '1px solid var(--accent)',
                fontSize: 11, color: 'var(--accent)',
              }}
            >
              {tag}
              <button
                onClick={() => toggle(tag)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--accent)', fontSize: 13, lineHeight: 1 }}
              >×</button>
            </span>
          ))}
        </div>
      )}

      {/* Keyword input */}
      <input
        value={tagQ}
        onChange={e => setTagQ(e.target.value)}
        placeholder={`搜索标签（共 ${allTags.length} 个）...`}
        style={{ width: '100%', fontSize: 12, padding: '5px 8px', marginBottom: 6, boxSizing: 'border-box' }}
      />

      {/* Filtered tag suggestions */}
      <div style={{ maxHeight: 120, overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {filtered.length === 0
          ? <span style={{ fontSize: 11, color: 'var(--text-ter)' }}>无匹配标签</span>
          : filtered.map(tag => {
              const active = selected.includes(tag);
              return (
                <button
                  key={tag}
                  className={`filter-pill ${active ? 'filter-pill--active' : ''}`}
                  style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => toggle(tag)}
                >
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

function FilterDropdown({ filters, namespaces, allTags, onSet, onClearAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
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
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          zIndex: 200, width: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          padding: 16,
        }}>
          {/* Namespace */}
          <Section label="板块">
            <select
              value={filters.namespace_id}
              onChange={e => onSet('namespace_id', e.target.value)}
              style={{ width: '100%', fontSize: 13 }}
            >
              <option value="">全部板块</option>
              {namespaces.map(ns => (
                <option key={ns.id} value={ns.id}>{ns.name}</option>
              ))}
            </select>
          </Section>

          {/* Knowledge type */}
          <Section label="知识类型">
            <PillRow
              options={TYPE_OPTIONS}
              value={filters.knowledge_type}
              onChange={v => onSet('knowledge_type', v)}
            />
          </Section>

          {/* Lifecycle */}
          <Section label="生命周期">
            <PillRow
              options={STATUS_OPTIONS}
              value={filters.status}
              onChange={v => onSet('status', v)}
            />
          </Section>

          {/* Authority */}
          <Section label="权威等级">
            <PillRow
              options={AUTHORITY_OPTIONS}
              value={filters.authority}
              onChange={v => onSet('authority', v)}
            />
          </Section>

          {/* Tags — searchable */}
          {allTags.length > 0 && (
            <TagFilter
              allTags={allTags}
              selectedRaw={filters.tags}
              onSet={v => onSet('tags', v)}
            />
          )}

          {/* Pending confirm */}
          <Section label="">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={filters.pending_confirm === 'true'}
                onChange={e => onSet('pending_confirm', e.target.checked ? 'true' : '')}
              />
              仅待确认
            </label>
          </Section>

          {/* Clear all */}
          {activeCount > 0 && (
            <button
              className="btn-sm btn-secondary"
              style={{ width: '100%', marginTop: 8, fontSize: 12 }}
              onClick={() => { onClearAll(); setOpen(false); }}
            >
              清除全部筛选
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-sec)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>}
      {children}
    </div>
  );
}

function PillRow({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {options.map(([val, label]) => (
        <button
          key={val}
          className={`filter-pill ${value === val ? 'filter-pill--active' : ''}`}
          style={{ fontSize: 12, padding: '3px 10px' }}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const EMPTY_FILTERS = {
  namespace_id: '', authority: '', status: '', pending_confirm: '',
  knowledge_type: '', tags: '', q: '', page: 1,
};

const PAGE_SIZE = 40;

export default function MemoryList() {
  const { boardId } = useParams();
  const { myNamespaces } = useUser();
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, namespace_id: boardId || '' });
  const namespaces = myNamespaces || [];
  const [allTags, setAllTags] = useState([]);
  const [debouncedQ, setDebouncedQ] = useState('');

  useEffect(() => {
    memoryApi.tags(filters.namespace_id || undefined).then(setAllTags).catch(() => {});
  }, [filters.namespace_id]);

  // Debounce keyword input (400ms)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(filters.q), 400);
    return () => clearTimeout(timer);
  }, [filters.q]);

  // Build API params: use debouncedQ for the q field
  const apiFilters = { ...cleanFilters(filters), ...(debouncedQ ? { q: debouncedQ } : {}), size: PAGE_SIZE };
  const { data, loading, error, refetch } = useAsync(
    () => memoryApi.list(apiFilters),
    [debouncedQ, filters.namespace_id, filters.authority, filters.status, filters.pending_confirm, filters.knowledge_type, filters.tags, filters.page]
  );

  const memories = data?.items;
  const totalCount = data?.total || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  function setFilter(key, val) {
    setFilters(f => ({ ...f, [key]: val, page: 1 }));
  }

  function clearAll() {
    setFilters(EMPTY_FILTERS);
    setDebouncedQ('');
  }

  // Active chips: all filter keys that have a non-empty value
  const activeChips = CHIP_KEYS.filter(k => filters[k]);

  // Keyword for highlighting (use raw input for instant visual feedback)
  const keyword = filters.q.trim().toLowerCase();
  const displayed = memories;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">记忆管理</h1>
      </div>

      {/* ── Unified filter bar ──────────────────────────────────────── */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {/* Search icon */}
          <span style={{ fontSize: 15, color: 'var(--text-ter)', flexShrink: 0 }}>🔍</span>

          {/* Active filter chips */}
          {activeChips.map(key => (
            <span
              key={key}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px', borderRadius: 99,
                background: 'var(--accent-light)', border: '1px solid var(--accent)',
                fontSize: 12, color: 'var(--accent)', fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {chipLabel(key, filters[key], namespaces)}
              <button
                onClick={() => setFilter(key, '')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--accent)', fontSize: 13 }}
              >
                ×
              </button>
            </span>
          ))}

          {/* Keyword input — grows to fill remaining space */}
          <input
            value={filters.q}
            onChange={e => setFilters(f => ({ ...f, q: e.target.value }))}
            placeholder="输入关键词过滤..."
            style={{
              flex: '1 1 120px', minWidth: 80,
              border: 'none', outline: 'none',
              background: 'transparent', fontSize: 13,
              padding: '4px 0',
            }}
          />

          {/* Filter button (right-aligned) */}
          <FilterDropdown
            filters={filters}
            namespaces={namespaces}
            allTags={allTags}
            onSet={setFilter}
            onClearAll={clearAll}
          />
        </div>
      </div>

      {/* ── Memory list (full width) ─────────────────────────────────── */}
      {loading ? <Loading /> :
        error   ? <ErrorMsg message={error} onRetry={refetch} /> :
        !displayed?.length ? <EmptyState icon="🧠" message="没有匹配的记忆" /> :
        <div className="card" style={{ padding: '0 16px' }}>
          {displayed.map(m => <MemoryRow key={m.id} memory={m} keyword={keyword} />)}
        </div>
      }

      {/* ── Pagination ──────────────────────────────────────────────── */}
      {totalCount > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <button
            className="btn-sm btn-secondary"
            disabled={filters.page <= 1}
            onClick={() => setFilters(f => ({ ...f, page: f.page - 1 }))}
          >
            ← 上一页
          </button>
          <span style={{ fontSize: 13, color: 'var(--text-sec)' }}>
            第 {filters.page} 页 / 共 {totalPages} 页（{totalCount} 条）
          </span>
          <button
            className="btn-sm btn-secondary"
            disabled={filters.page >= totalPages}
            onClick={() => setFilters(f => ({ ...f, page: f.page + 1 }))}
          >
            下一页 →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MemoryRow ────────────────────────────────────────────────────────────────

function highlight(text, kw) {
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

function MemoryRow({ memory, keyword }) {
  const preview = memory.content.length > 160
    ? memory.content.slice(0, 160) + '…'
    : memory.content;

  return (
    <div className="memory-row">
      <div style={{ flex: 1 }}>
        <Link
          to={`/admin/memories/${memory.id}`}
          style={{ textDecoration: 'none', color: 'var(--text)', fontSize: 13, lineHeight: 1.6, display: 'block', marginBottom: 6 }}
        >
          {highlight(preview, keyword)}
        </Link>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <AuthorityBadge authority={memory.authority} />
          <LifecycleBadge status={memory.status} />
          {memory.knowledge_type && <KnowledgeTypeBadge type={memory.knowledge_type} />}
          {memory.tags?.map(t => <Badge key={t} type="gray">{t}</Badge>)}
          {memory.pending_human_confirm && <Badge type="amber">⏳ 待确认</Badge>}
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

function cleanFilters(f) {
  const out = {};
  Object.entries(f).forEach(([k, v]) => { if (v != null && v !== '') out[k] = v; });
  return out;
}
