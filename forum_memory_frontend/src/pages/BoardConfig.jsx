import React, { useState } from 'react';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';

export default function BoardConfig() {
  const { data: boards, loading, error } = useAsync(() => namespaceApi.list());
  const [selectedId, setSelectedId] = useState(null);

  // Auto-select first board
  const boardId = selectedId || boards?.[0]?.id;

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!boards?.length) return <EmptyState icon="📂" message="还没有板块" />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>板块配置</h1>

      {/* Board selector */}
      <div style={{ marginBottom: 20 }}>
        <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>选择板块:</label>
        <select value={boardId || ''} onChange={e => setSelectedId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
          {boards.map(b => <option key={b.id} value={b.id}>{b.display_name} ({b.name})</option>)}
        </select>
      </div>

      {boardId && <BoardConfigPanel boardId={boardId} />}
    </div>
  );
}

function BoardConfigPanel({ boardId }) {
  const { data: board, loading, refetch } = useAsync(() => namespaceApi.get(boardId), [boardId]);
  const [tab, setTab] = useState('info');

  if (loading || !board) return <Loading />;

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'dict', label: '黑话字典' },
  ];

  return (
    <div>
      <div className="tabs">
        {tabs.map(t => (
          <button key={t.key} className={`tab ${tab === t.key ? 'tab--active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'info' && <InfoTab board={board} onUpdate={refetch} />}
      {tab === 'dict' && <DictTab board={board} onUpdate={refetch} />}
    </div>
  );
}

function InfoTab({ board, onUpdate }) {
  const [form, setForm] = useState({ display_name: board.display_name, description: board.description || '', access_mode: board.access_mode });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await namespaceApi.update(board.id, form);
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card" style={{ padding: 20, maxWidth: 500 }}>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>板块名称</label>
        <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>描述</label>
        <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ minHeight: 80 }} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>访问模式</label>
        <select value={form.access_mode} onChange={e => setForm(f => ({ ...f, access_mode: e.target.value }))} style={{ width: 'auto' }}>
          <option value="public">公开</option>
          <option value="internal">内部</option>
          <option value="restricted">受限</option>
        </select>
      </div>
      <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
    </div>
  );
}

function DictTab({ board, onUpdate }) {
  const [newSlang, setNewSlang] = useState('');
  const [newCanonical, setNewCanonical] = useState('');
  const dict = board.dictionary || {};
  const entries = Object.entries(dict);

  async function handleAdd() {
    if (!newSlang.trim() || !newCanonical.trim()) return;
    await namespaceApi.updateDict(board.id, { [newSlang.trim()]: newCanonical.trim() });
    setNewSlang('');
    setNewCanonical('');
    onUpdate();
  }

  async function handleRemove(key) {
    // Remove by setting to empty (backend should handle)
    const updated = { ...dict };
    delete updated[key];
    await namespaceApi.update(board.id, { config: { ...board.config, dictionary: updated } });
    onUpdate();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>
        查询预处理时自动映射团队术语到标准名称，提升搜索命中率。
      </p>

      {entries.length > 0 ? (
        <table className="dict-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>团队黑话</th><th>标准名称</th><th style={{ width: 60 }}>操作</th></tr></thead>
          <tbody>
            {entries.map(([slang, canonical]) => (
              <tr key={slang}>
                <td style={{ fontWeight: 600 }}>{slang}</td>
                <td style={{ color: 'var(--text-sec)' }}>{canonical}</td>
                <td><button className="btn-danger btn-sm" onClick={() => handleRemove(slang)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text-ter)', fontSize: 13, marginBottom: 16 }}>暂无黑话映射</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="黑话" value={newSlang} onChange={e => setNewSlang(e.target.value)} style={{ flex: 1 }} />
        <input placeholder="标准名称" value={newCanonical} onChange={e => setNewCanonical(e.target.value)} style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleAdd}>添加</button>
      </div>
    </div>
  );
}
