import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { namespaceApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';

export default function BoardList() {
  const { data: boards, loading, error, refetch } = useAsync(() => namespaceApi.list());
  const { data: me } = useAsync(() => userApi.me().catch(() => null));
  const [showCreate, setShowCreate] = useState(false);

  const isAdmin = me?.role === 'super_admin';

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">全部板块</h1>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setShowCreate(true)}>+ 创建板块</button>
        )}
      </div>

      {!boards?.length ? (
        <EmptyState icon="📂" message="还没有板块" />
      ) : (
        <div className="board-grid">
          {boards.map(b => <BoardCard key={b.id} board={b} />)}
        </div>
      )}

      {showCreate && (
        <CreateBoardModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetch(); }}
        />
      )}
    </div>
  );
}

function BoardCard({ board }) {
  return (
    <Link to={`/boards/${board.id}/threads`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card" style={{ padding: 20, cursor: 'pointer' }}>
        <h3 style={{ fontSize: 16, marginBottom: 4 }}>{board.display_name}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 12 }}>{board.description || board.name}</p>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-ter)' }}>
          <span>📋 {board.name}</span>
          <span style={{ color: board.is_active ? 'var(--green)' : 'var(--red)' }}>
            {board.is_active ? '● 活跃' : '○ 已关闭'}
          </span>
        </div>
      </div>
    </Link>
  );
}

function CreateBoardModal({ onClose, onCreated }) {
  const [form, setForm] = useState({ name: '', display_name: '', description: '', access_mode: 'public' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  function update(field, value) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.display_name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await namespaceApi.create({
        name: form.name.trim(),
        display_name: form.display_name.trim(),
        description: form.description.trim() || null,
        access_mode: form.access_mode,
      });
      onCreated();
    } catch (err) {
      setError(err.message);
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
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>板块标识 *</label>
            <input placeholder="英文标识，如: backend-issues" value={form.name} onChange={e => update('name', e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>显示名称 *</label>
            <input placeholder="如: 后端问题" value={form.display_name} onChange={e => update('display_name', e.target.value)} required />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>描述</label>
            <textarea placeholder="板块描述（可选）" value={form.description} onChange={e => update('description', e.target.value)} style={{ minHeight: 80 }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>访问模式</label>
            <select value={form.access_mode} onChange={e => update('access_mode', e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
              <option value="public">公开</option>
              <option value="internal">内部</option>
              <option value="restricted">受限</option>
            </select>
          </div>

          {error && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>❌ {error}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '创建中...' : '创建'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
