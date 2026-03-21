import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { Loading, EmptyState } from '../components/UI';
import type { Namespace } from '../types';

export default function BoardConfig() {
  const { boardId: routeBoardId } = useParams<{ boardId?: string }>();
  const { myNamespaces: boards, loading: userLoading, isSuperAdmin, isAdmin } = useUser();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const boardId = routeBoardId || selectedId || boards?.[0]?.id;

  if (userLoading) return <Loading />;
  if (!boards?.length) return <EmptyState icon="" message="还没有板块" />;

  return (
    <div>
      <h1 className="page-title" style={{ marginBottom: 20 }}>板块配置</h1>

      {!routeBoardId && (
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginRight: 8 }}>选择板块:</label>
          <select value={boardId || ''} onChange={e => setSelectedId(e.target.value)} style={{ width: 'auto', minWidth: 200 }}>
            {boards.map(b => <option key={b.id} value={b.id}>{b.display_name} ({b.name})</option>)}
          </select>
        </div>
      )}

      {boardId && <BoardConfigPanel boardId={boardId} isSuperAdmin={isSuperAdmin} isAdmin={isAdmin} />}
    </div>
  );
}

function BoardConfigPanel({ boardId, isSuperAdmin, isAdmin }: { boardId: string; isSuperAdmin: boolean; isAdmin: boolean }) {
  const { data: board, loading, refetch } = useAsync(() => namespaceApi.get(boardId), [boardId]);
  const [tab, setTab] = useState('info');

  if (loading || !board) return <Loading />;

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'dict', label: '黑话字典' },
    { key: 'kb', label: '知识库配置' },
  ];
  if (isAdmin) tabs.push({ key: 'moderators', label: '板块管理员' });

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
      {tab === 'moderators' && isAdmin && <ModeratorsTab boardId={boardId} />}
    </div>
  );
}

function InfoTab({ board, onUpdate }: { board: Namespace; onUpdate: () => void }) {
  const [form, setForm] = useState({ display_name: board.display_name, description: board.description || '' });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await namespaceApi.update(board.id, form as Partial<Namespace>);
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
      <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</button>
    </div>
  );
}

function DictTab({ board, onUpdate }: { board: Namespace; onUpdate: () => void }) {
  const [newSlang, setNewSlang] = useState('');
  const [newCanonical, setNewCanonical] = useState('');
  const dict = board.dictionary || {};
  const entries = Object.entries(dict);

  async function handleAdd() {
    if (!newSlang.trim() || !newCanonical.trim()) return;
    await namespaceApi.updateDict(board.id, [{ slang: newSlang.trim(), canonical: newCanonical.trim() }]);
    setNewSlang('');
    setNewCanonical('');
    onUpdate();
  }

  async function handleRemove(key: string) {
    const updated = { ...dict };
    delete updated[key];
    await namespaceApi.update(board.id, { config: { ...board.config, dictionary: updated } } as Partial<Namespace>);
    onUpdate();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>查询预处理时自动映射团队术语到标准名称，提升搜索命中率。</p>

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

function KBConfigTab({ board, onUpdate }: { board: Namespace; onUpdate: () => void }) {
  const kbList = board.config?.kb_sn_list || [];
  const enableMemory = board.config?.enable_memory_search !== false;
  const enableRag = board.config?.enable_rag_search !== false;
  const [newSn, setNewSn] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleToggle(key: string, value: boolean | number) {
    await namespaceApi.update(board.id, { config: { ...board.config, [key]: value } } as Partial<Namespace>);
    onUpdate();
  }

  async function handleAdd() {
    if (!newSn.trim()) return;
    const updated = [...kbList, newSn.trim()];
    setSaving(true);
    try {
      await namespaceApi.update(board.id, { config: { ...board.config, kb_sn_list: updated } } as Partial<Namespace>);
      setNewSn('');
      onUpdate();
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(index: number) {
    const updated = kbList.filter((_, i) => i !== index);
    await namespaceApi.update(board.id, { config: { ...board.config, kb_sn_list: updated } } as Partial<Namespace>);
    onUpdate();
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>控制 AI 回答时使用的知识来源，可独立开关以对比不同搜索策略的效果。</p>

      <div style={{ display: 'flex', gap: 24, marginBottom: 20, padding: 16, background: 'var(--bg-sec, #f5f5f5)', borderRadius: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={enableMemory} onChange={e => handleToggle('enable_memory_search', e.target.checked)} />
          <span style={{ fontWeight: 600 }}>记忆搜索</span>
          <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>（从已提取的知识点中检索）</span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={enableRag} onChange={e => handleToggle('enable_rag_search', e.target.checked)} />
          <span style={{ fontWeight: 600 }}>RAG 搜索</span>
          <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>（从外部知识库检索）</span>
        </label>
      </div>

      {enableRag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', background: 'var(--bg-sec, #f5f5f5)', borderRadius: 8 }}>
          <label style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>RAG 返回切片数</label>
          <input
            type="number"
            min={1}
            max={10}
            value={board.config?.rag_top_k ?? 5}
            onChange={e => {
              const val = Math.min(10, Math.max(1, Number(e.target.value) || 5));
              handleToggle('rag_top_k', val);
            }}
            style={{ width: 70, textAlign: 'center' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>（范围 1-10，默认 5）</span>
        </div>
      )}

      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>外部知识库配置</h4>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>配置外部知识库序列号，AI 回答时会结合知识库检索结果生成更准确的回答。</p>

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

function ModeratorsTab({ boardId }: { boardId: string }) {
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
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(userId: string) {
    try {
      await namespaceApi.removeModerator(boardId, userId);
      refetch();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (loading) return <Loading />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <p style={{ fontSize: 13, color: 'var(--text-sec)', marginBottom: 16 }}>输入工号即可添加板块管理员。若该工号用户尚未注册，系统将自动创建账号。</p>

      {(moderators?.length ?? 0) > 0 ? (
        <table className="dict-table" style={{ marginBottom: 16 }}>
          <thead><tr><th>姓名</th><th>工号</th><th style={{ width: 60 }}>操作</th></tr></thead>
          <tbody>
            {(moderators ?? []).map(m => (
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
        <input placeholder="工号（必填）" value={employeeId} onChange={e => { setEmployeeId(e.target.value); setErrMsg(''); }} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
        <input placeholder="姓名（选填）" value={displayName} onChange={e => setDisplayName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} style={{ flex: 1 }} />
        <button className="btn-primary" onClick={handleAdd} disabled={!employeeId.trim() || adding}>
          {adding ? '添加中...' : '添加'}
        </button>
      </div>
      {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{errMsg}</p>}
    </div>
  );
}
