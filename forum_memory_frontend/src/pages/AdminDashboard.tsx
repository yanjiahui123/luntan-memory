import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { Loading, ErrorMsg } from '../components/UI';
import type { Namespace, NamespaceStats, AggregateStats } from '../types';

export default function AdminDashboard() {
  const { boardId } = useParams<{ boardId?: string }>();
  const { isSuperAdmin, isBoardAdmin, isAdmin, myNamespaces } = useUser();

  if (boardId) {
    return <BoardDashboard boardId={boardId} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} />;
  }
  return <GlobalDashboard isSuperAdmin={isSuperAdmin} isBoardAdmin={isBoardAdmin} myNamespaces={myNamespaces} />;
}

function GlobalDashboard({ isSuperAdmin, isBoardAdmin, myNamespaces }: {
  isSuperAdmin: boolean;
  isBoardAdmin: boolean;
  myNamespaces: Namespace[] | null;
}) {
  const { data: boards, loading, error } = useAsync(() => namespaceApi.list());
  const { data: stats } = useAsync(
    () => isSuperAdmin ? namespaceApi.aggregateStats() : Promise.resolve(null),
    [isSuperAdmin],
  );
  const [showCreate, setShowCreate] = useState(false);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;

  // board_admin 只显示自己管理的板块
  const managedIds = new Set((myNamespaces || []).map(ns => ns.id));
  const visibleBoards = isBoardAdmin
    ? (boards || []).filter(b => managedIds.has(b.id))
    : boards;

  const aiRate = stats ? `${((stats.ai_resolve_rate ?? 0) * 100).toFixed(1)}%` : '--%';

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <h1 className="page-title">管理仪表盘</h1>
        {isSuperAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ 创建板块</button>
        )}
      </div>

      {isSuperAdmin && (
        <div className="stat-grid">
          <StatCard label="板块总数" value={boards?.length || 0} sub="全部板块" color="var(--accent)" />
          <StatCard label="AI 解决率" value={aiRate} sub={stats ? `${stats.resolved_threads ?? 0} 已解决` : '加载中'} color="var(--green)" />
          <StatCard label="待处理事项" value={stats?.pending_count ?? '--'} sub="查看详情" color="var(--red)" link="/admin/pending" />
          <StatCard label="记忆总数" value={stats?.total_memories ?? '--'} sub={stats ? `${stats.locked_memories ?? 0} 已锁定` : '全部记忆'} color="var(--purple)" link="/admin/memories" />
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {isBoardAdmin ? '我管理的板块' : '板块概览'}
        </h3>
        {(visibleBoards?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--text-ter)', fontSize: 13 }}>还没有板块</p>
        ) : (
          visibleBoards?.map(b => (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span>{b.display_name}</span>
              <Link to={`/admin/boards/${b.id}`} style={{ fontSize: 12, color: 'var(--accent)', textDecoration: 'none' }}>进入后台 →</Link>
            </div>
          ))
        )}
      </div>

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); window.location.reload(); }} />
      )}
    </div>
  );
}

function BoardDashboard({ boardId, isSuperAdmin, isAdmin }: { boardId: string; isSuperAdmin: boolean; isAdmin: boolean }) {
  const { data: board, loading: boardLoading } = useAsync(() => namespaceApi.get(boardId), [boardId]);
  const { data: stats } = useAsync(() => namespaceApi.stats(boardId), [boardId]);
  const [showCreate, setShowCreate] = useState(false);

  if (boardLoading) return <Loading />;

  const aiRate = stats ? `${((stats.ai_resolve_rate ?? 0) * 100).toFixed(1)}%` : '--%';
  const base = `/admin/boards/${boardId}`;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: 20 }}>
        <div>
          <h1 className="page-title">{board?.display_name || '板块仪表盘'}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-sec)', marginTop: 4 }}>板块管理后台</p>
        </div>
        {isAdmin && (
          <button className="btn-secondary" onClick={() => setShowCreate(true)}>+ 创建板块</button>
        )}
      </div>

      <div className="stat-grid">
        <StatCard label="总帖子数" value={stats?.total_threads ?? '--'} sub={`${stats?.open_threads ?? '--'} 进行中`} color="var(--accent)" />
        <StatCard label="AI 解决率" value={aiRate} sub={stats ? `${stats.resolved_threads ?? 0} 已解决` : '加载中'} color="var(--green)" />
        <StatCard label="待处理事项" value={stats?.pending_count ?? '--'} sub="查看详情" color="var(--red)" link={`${base}/pending`} />
        <StatCard label="记忆总数" value={stats?.total_memories ?? '--'} sub={stats ? `${stats.locked_memories ?? 0} 已锁定` : '全部记忆'} color="var(--purple)" link={`${base}/memories`} />
      </div>

      <div className="card" style={{ padding: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>板块信息</h3>
        <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--text-sec)', minWidth: 70 }}>内部名称:</span>
            <span style={{ fontFamily: 'monospace' }}>{board?.name}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--text-sec)', minWidth: 70 }}>访问模式:</span>
            <span>{board?.access_mode}</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <span style={{ color: 'var(--text-sec)', minWidth: 70 }}>描述:</span>
            <span>{board?.description || '无'}</span>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); window.location.reload(); }} />
      )}
    </div>
  );
}

function CreateBoardModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ display_name: '', description: '', access_mode: 'public' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await namespaceApi.create({
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        access_mode: form.access_mode,
      } as Partial<Namespace>);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, maxWidth: 480, width: '90%' }}>
        <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>创建新板块</h3>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>板块名称 *</label>
            <input placeholder="如: 后端问题" value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>描述</label>
            <textarea placeholder="板块描述（可选）" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 80 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>访问模式</label>
            <select value={form.access_mode} onChange={e => setForm(f => ({ ...f, access_mode: e.target.value }))} style={{ width: 'auto', minWidth: 160 }}>
              <option value="public">公开</option>
              <option value="internal">内部</option>
              <option value="restricted">受限</option>
            </select>
          </div>
          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>错误: {error}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '创建中...' : '创建'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string;
  sub: string;
  color: string;
  link?: string;
}

function StatCard({ label, value, sub, color, link }: StatCardProps) {
  const inner = (
    <div className="card stat-card">
      <div className="stat-card__label">{label}</div>
      <div className="stat-card__value" style={{ color }}>{value}</div>
      <div className="stat-card__sub">{sub}</div>
    </div>
  );
  return link ? <Link to={link} style={{ textDecoration: 'none', color: 'inherit' }}>{inner}</Link> : inner;
}
