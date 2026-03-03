import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { namespaceApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState, ConfirmModal } from '../components/UI';

export default function BoardConfig() {
  // 支持从路由参数直接获取 boardId（板块级管理后台）
  const { boardId: routeBoardId } = useParams();
  const { data: boards, loading, error } = useAsync(() => userApi.myNamespaces());
  const [selectedId, setSelectedId] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    userApi.me().then(setCurrentUser).catch(() => {});
  }, []);

  // 优先使用路由参数中的 boardId，其次是用户选择，最后默认第一个
  const boardId = routeBoardId || selectedId || boards?.[0]?.id;
  const isSuperAdmin = currentUser?.role === 'super_admin';

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} />;
  if (!boards?.length) return <EmptyState icon="" message="还没有板块" />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>板块配置</h1>

      {/* 没有路由锁定板块时，才显示板块选择器 */}
      {!routeBoardId && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>选择板块:</label>
          <select value={boardId || ''} onChange={e => setSelectedId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            {boards.map(b => <option key={b.id} value={b.id}>{b.display_name} ({b.name})</option>)}
          </select>
        </div>
      )}

      {boardId && <BoardConfigPanel boardId={boardId} isSuperAdmin={isSuperAdmin} />}
    </div>
  );
}

function BoardConfigPanel({ boardId, isSuperAdmin }) {
  const { data: board, loading, refetch } = useAsync(() => namespaceApi.get(boardId), [boardId]);
  const [tab, setTab] = useState('info');

  if (loading || !board) return <Loading />;

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'dict', label: '黑话字典' },
    { key: 'kb', label: '知识库配置' },
  ];
  if (isSuperAdmin) {
    tabs.push({ key: 'moderators', label: '板块管理员' });
  }

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
      {tab === 'kb' && <KBConfigTab board={board} onUpdate={refetch} />}
      {tab === 'moderators' && isSuperAdmin && <ModeratorsTab boardId={boardId} />}
    </div>
  );
}

function InfoTab({ board, onUpdate }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ display_name: board.display_name, description: board.description || '', access_mode: board.access_mode });
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    <div className="card" style={{ padding: 20 }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
        <button className="btn-danger" onClick={() => setShowDeleteConfirm(true)}>删除板块</button>
      </div>

      <ConfirmModal
        open={showDeleteConfirm}
        title="删除板块"
        message={`确认删除板块「${board.display_name}」？删除后板块将不再显示，其下帖子也将不可访问。`}
        onConfirm={async () => {
          await namespaceApi.delete(board.id);
          setShowDeleteConfirm(false);
          navigate('/boards');
        }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
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

function KBConfigTab({ board, onUpdate }) {
  const kbList = board.config?.kb_sn_list || [];
  const [newSn, setNewSn] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!newSn.trim()) return;
    const updated = [...kbList, newSn.trim()];
    setSaving(true);
    try {
      await namespaceApi.update(board.id, { config: { ...board.config, kb_sn_list: updated } });
      setNewSn('');
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(index) {
    const updated = kbList.filter((_, i) => i !== index);
    await namespaceApi.update(board.id, { config: { ...board.config, kb_sn_list: updated } });
    onUpdate();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>
        配置外部知识库序列号，AI 回答时会结合知识库检索结果生成更准确的回答。
      </p>

      {kbList.length > 0 ? (
        <table className="dict-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>知识库序列号</th><th style={{ width: 60 }}>操作</th></tr></thead>
          <tbody>
            {kbList.map((sn, i) => (
              <tr key={i}>
                <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{sn}</td>
                <td><button className="btn-danger btn-sm" onClick={() => handleRemove(i)}>删除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text-ter)', fontSize: 13, marginBottom: 16 }}>暂未配置知识库</p>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        <input placeholder="输入知识库序列号" value={newSn} onChange={e => setNewSn(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleAdd} disabled={saving}>{saving ? '添加中...' : '添加'}</button>
      </div>
    </div>
  );
}

function ModeratorsTab({ boardId }) {
  const { data: moderators, loading, refetch } = useAsync(() => namespaceApi.listModerators(boardId), [boardId]);
  const [employeeId, setEmployeeId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [adding, setAdding] = useState(false);
  const [errMsg, setErrMsg] = useState('');

  async function handleAdd() {
    if (!employeeId.trim()) return;
    setAdding(true);
    setErrMsg('');
    try {
      await namespaceApi.addModerator(boardId, employeeId.trim(), displayName.trim() || undefined);
      setEmployeeId('');
      setDisplayName('');
      refetch();
    } catch (err) {
      setErrMsg(err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId) {
    try {
      await namespaceApi.removeModerator(boardId, userId);
      refetch();
    } catch (err) {
      alert(err.message);
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>
        输入工号即可添加板块管理员。若该工号用户尚未注册，系统将自动创建账号。
      </p>

      {moderators?.length > 0 ? (
        <table className="dict-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>姓名</th><th>工号</th><th style={{ width: 60 }}>操作</th></tr></thead>
          <tbody>
            {moderators.map(m => (
              <tr key={m.id}>
                <td style={{ fontWeight: 600 }}>{m.display_name}</td>
                <td style={{ color: 'var(--text-sec)' }}>{m.employee_id}</td>
                <td><button className="btn-danger btn-sm" onClick={() => handleRemove(m.id)}>移除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text-ter)', fontSize: 13, marginBottom: 16 }}>暂无板块管理员</p>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          placeholder="工号（必填）"
          value={employeeId}
          onChange={e => { setEmployeeId(e.target.value); setErrMsg(''); }}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <input
          placeholder="姓名（选填）"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={handleAdd} disabled={!employeeId.trim() || adding}>
          {adding ? '添加中...' : '添加'}
        </button>
      </div>
      {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{errMsg}</p>}
    </div>
  );
}
