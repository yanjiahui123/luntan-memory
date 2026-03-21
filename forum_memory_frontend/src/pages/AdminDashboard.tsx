import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
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
  const { data: boards, loading, error, refetch: refetchBoards } = useAsync(() => namespaceApi.list());
  const { data: stats } = useAsync(
    () => isSuperAdmin ? namespaceApi.aggregateStats() : Promise.resolve(null),
    [isSuperAdmin],
  );
  const { refetch: refetchUser } = useUser();
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = isSuperAdmin || isBoardAdmin;

  function handleBoardChange() {
    refetchBoards();
    refetchUser();
  }

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
        {isAdmin && (
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

      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>
          {isBoardAdmin ? '我管理的板块' : '板块概览'}
        </h3>
        {(visibleBoards?.length ?? 0) === 0 ? (
          <p style={{ color: 'var(--text-ter)', fontSize: 13 }}>还没有板块</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {visibleBoards?.map(b => (
              <BoardOverviewCard key={b.id} board={b} isAdmin={isAdmin} onDeleted={handleBoardChange} />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateBoardModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); handleBoardChange(); }} />
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

function BoardOverviewCard({ board, isAdmin, onDeleted }: { board: Namespace; isAdmin: boolean; onDeleted: () => void }) {
  const navigate = useNavigate();
  const { data: stats } = useAsync(() => namespaceApi.stats(board.id), [board.id]);
  const [showDelete, setShowDelete] = useState(false);
  const aiRate = stats ? `${((stats.ai_resolve_rate ?? 0) * 100).toFixed(1)}%` : '--';
  const base = `/admin/boards/${board.id}`;

  return (
    <>
      <div
        className="card"
        style={{ padding: 16, cursor: 'pointer' }}
        onClick={() => navigate(base)}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>{board.display_name}</span>
          {isAdmin && (
            <button
              className="btn-danger btn-sm"
              style={{ marginLeft: 'auto', fontSize: 11 }}
              onClick={e => { e.stopPropagation(); setShowDelete(true); }}
            >
              删除
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, fontSize: 12 }}>
          <MiniStat label="帖子数" value={stats?.total_threads ?? '--'} color="var(--accent)" />
          <MiniStat label="AI 解决率" value={aiRate} color="var(--green)" />
          <MiniStat label="待处理" value={stats?.pending_count ?? '--'} color="var(--red)" />
          <MiniStat label="记忆总数" value={stats?.total_memories ?? '--'} color="var(--purple)" />
        </div>
      </div>
      {showDelete && (
        <DeleteBoardModal
          board={board}
          onClose={() => setShowDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </>
  );
}

function DeleteBoardModal({ board, onClose, onDeleted }: { board: Namespace; onClose: () => void; onDeleted: () => void }) {
  const [input, setInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const confirmed = input === board.display_name;

  async function handleDelete() {
    if (!confirmed || deleting) return;
    setDeleting(true);
    setErr('');
    try {
      await namespaceApi.delete(board.id);
      onDeleted();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : '删除失败，请重试');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, maxWidth: 420, width: '90%' }}>
        <h3 style={{ marginBottom: 8 }}>删除板块</h3>
        <p style={{ color: 'var(--text-sec)', fontSize: 14, marginBottom: 16 }}>
          此操作不可恢复，板块下所有帖子和知识点将一并删除。
        </p>
        <p style={{ fontSize: 14, marginBottom: 8 }}>
          请输入板块名称 <strong>{board.display_name}</strong> 以确认：
        </p>
        <input
          value={input}
          onChange={e => { setInput(e.target.value); setErr(''); }}
          placeholder={board.display_name}
          autoFocus
          style={{ marginBottom: err ? 8 : 16 }}
          onKeyDown={e => { if (e.key === 'Enter' && confirmed && !deleting) handleDelete(); }}
        />
        {err && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 16 }}>{err}</p>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={onClose} disabled={deleting}>取消</button>
          <button className="btn-danger" onClick={handleDelete} disabled={!confirmed || deleting}>
            {deleting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div>
      <div style={{ color: 'var(--text-ter)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color }}>{value}</div>
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
