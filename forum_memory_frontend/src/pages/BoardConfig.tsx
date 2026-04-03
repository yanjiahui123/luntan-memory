import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { namespaceApi, memberApi, inviteApi, userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useUser } from '../contexts/UserContext';
import { Loading, EmptyState } from '../components/UI';
import type { Namespace, NamespaceMember, NamespaceInvite, UserSearchResult, DeptOption } from '../types';

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

  const accessMode = (board.access_mode || 'public').toLowerCase();
  const showMembers = accessMode === 'restricted' || accessMode === 'private';

  const tabs = [
    { key: 'info', label: '基本信息' },
    { key: 'dict', label: '黑话字典' },
    { key: 'kb', label: '知识库配置' },
  ];
  if (isAdmin) tabs.push({ key: 'moderators', label: '板块管理员' });
  if (showMembers && isAdmin) tabs.push({ key: 'members', label: '成员管理' });

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
      {tab === 'members' && isAdmin && <MembersTab boardId={boardId} />}
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


// ── Members Tab ─────────────────────────────────────────────────

function MembersTab({ boardId }: { boardId: string }) {
  const { data: members, loading, refetch } = useAsync(() => memberApi.list(boardId), [boardId]);
  const [addMode, setAddMode] = useState<'search' | 'batch' | 'dept'>('search');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <MemberListSection members={members} loading={loading} boardId={boardId} refetch={refetch} />

      <div className="card" style={{ padding: 20 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>添加成员</h4>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['search', 'batch', 'dept'] as const).map(m => (
            <button key={m} className={`tab ${addMode === m ? 'tab--active' : ''}`} onClick={() => setAddMode(m)} style={{ fontSize: 13 }}>
              {{ search: '搜索添加', batch: '批量粘贴', dept: '按部门添加' }[m]}
            </button>
          ))}
        </div>
        {addMode === 'search' && <SearchAddSection boardId={boardId} onAdded={refetch} />}
        {addMode === 'batch' && <BatchAddSection boardId={boardId} onAdded={refetch} />}
        {addMode === 'dept' && <DeptAddSection boardId={boardId} onAdded={refetch} />}
      </div>

      <InviteSection boardId={boardId} />
    </div>
  );
}


function MemberListSection({ members, loading: isLoading, boardId, refetch }: {
  members: NamespaceMember[] | null; loading: boolean; boardId: string; refetch: () => void;
}) {
  const [errMsg, setErrMsg] = useState('');

  async function handleRoleChange(userId: string, newRole: string) {
    setErrMsg('');
    try {
      await memberApi.updateRole(boardId, userId, newRole);
      refetch();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemove(userId: string) {
    setErrMsg('');
    try {
      await memberApi.remove(boardId, userId);
      refetch();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    }
  }

  if (isLoading) return <Loading />;

  return (
    <div className="card" style={{ padding: 20 }}>
      <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>成员列表 ({members?.length ?? 0})</h4>

      {(members?.length ?? 0) > 0 ? (
        <div style={{ maxHeight: 400, overflow: 'auto' }}>
          <table className="dict-table">
            <thead><tr><th>姓名</th><th>工号</th><th>部门</th><th>角色</th><th style={{ width: 60 }}>操作</th></tr></thead>
            <tbody>
              {(members ?? []).map(m => (
                <tr key={m.user_id}>
                  <td style={{ fontWeight: 600 }}>{m.display_name}</td>
                  <td style={{ color: 'var(--text-sec)', fontSize: 12 }}>{m.employee_id}</td>
                  <td style={{ color: 'var(--text-sec)', fontSize: 12 }}>{m.dept_path || '-'}</td>
                  <td>
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.user_id, e.target.value)}
                      style={{ fontSize: 12, padding: '2px 4px', width: 'auto' }}
                    >
                      <option value="member">成员</option>
                      <option value="moderator">管理员</option>
                    </select>
                  </td>
                  <td><button className="btn-danger btn-sm" onClick={() => handleRemove(m.user_id)}>移除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p style={{ color: 'var(--text-ter)', fontSize: 13 }}>暂无成员</p>
      )}
      {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{errMsg}</p>}
    </div>
  );
}


function SearchAddSection({ boardId, onAdded }: { boardId: string; onAdded: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState('');
  const [role, setRole] = useState('member');
  const [errMsg, setErrMsg] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    userApi.search(q.trim())
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doSearch(val), 300);
  }

  async function handleAdd(account: string) {
    setAdding(account);
    setErrMsg('');
    try {
      await memberApi.add(boardId, account, role);
      onAdded();
      setResults(prev => prev.filter(r => r.w3account !== account));
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding('');
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <input
          placeholder="输入姓名或工号搜索..."
          value={query}
          onChange={e => handleInput(e.target.value)}
          style={{ flex: 1 }}
        />
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: 'auto', fontSize: 13 }}>
          <option value="member">成员</option>
          <option value="moderator">管理员</option>
        </select>
      </div>
      {searching && <p style={{ fontSize: 12, color: 'var(--text-sec)' }}>搜索中...</p>}
      {results.length > 0 && (
        <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6, marginTop: 4 }}>
          {results.map(r => (
            <div key={r.w3account} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{r.name}</span>
                <span style={{ color: 'var(--text-sec)', fontSize: 12, marginLeft: 8 }}>{r.w3account}</span>
              </div>
              <button
                className="btn-primary btn-sm"
                onClick={() => handleAdd(r.w3account)}
                disabled={adding === r.w3account}
                style={{ fontSize: 12 }}
              >
                {adding === r.w3account ? '...' : '添加'}
              </button>
            </div>
          ))}
        </div>
      )}
      {errMsg && <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{errMsg}</p>}
    </div>
  );
}


function BatchAddSection({ boardId, onAdded }: { boardId: string; onAdded: () => void }) {
  const [text, setText] = useState('');
  const [role, setRole] = useState('member');
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const ids = text.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
    if (!ids.length) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await memberApi.batchAdd(boardId, ids, role);
      setResult(res);
      onAdded();
    } catch (err) {
      setResult({ added: 0, skipped: 0, errors: [err instanceof Error ? err.message : String(err)] });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: 'auto', fontSize: 13 }}>
          <option value="member">成员</option>
          <option value="moderator">管理员</option>
        </select>
        <span style={{ fontSize: 12, color: 'var(--text-sec)' }}>最多 100 个工号</span>
      </div>
      <textarea
        placeholder="粘贴工号，一行一个或逗号分隔"
        value={text}
        onChange={e => setText(e.target.value)}
        style={{ minHeight: 80, marginBottom: 8 }}
      />
      <button className="btn-primary" onClick={handleSubmit} disabled={loading || !text.trim()}>
        {loading ? '添加中...' : '批量添加'}
      </button>
      {result && (
        <p style={{ fontSize: 13, marginTop: 8 }}>
          <span style={{ color: 'var(--success, #22c55e)' }}>添加 {result.added}</span>
          {result.skipped > 0 && <span style={{ color: 'var(--text-sec)', marginLeft: 8 }}>跳过 {result.skipped}</span>}
          {result.errors.length > 0 && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>错误: {result.errors.join(', ')}</span>}
        </p>
      )}
    </div>
  );
}


function DeptAddSection({ boardId, onAdded }: { boardId: string; onAdded: () => void }) {
  const [deptCode, setDeptCode] = useState('');
  const [role, setRole] = useState('member');
  const [departments, setDepartments] = useState<DeptOption[]>([]);
  const [result, setResult] = useState<{ added: number; skipped: number; total_in_dept: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    userApi.departments().then(setDepartments).catch(() => {});
  }, []);

  async function handleSubmit() {
    if (!deptCode.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await memberApi.batchAddByDept(boardId, deptCode.trim(), role);
      setResult(res);
      onAdded();
    } catch (err) {
      setResult(null);
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        {departments.length > 0 ? (
          <select value={deptCode} onChange={e => setDeptCode(e.target.value)} style={{ flex: 1 }}>
            <option value="">选择部门...</option>
            {departments.map(d => (
              <option key={d.dept_code} value={d.dept_code}>{d.dept_path} ({d.dept_code})</option>
            ))}
          </select>
        ) : (
          <input placeholder="输入部门代码" value={deptCode} onChange={e => setDeptCode(e.target.value)} style={{ flex: 1 }} />
        )}
        <select value={role} onChange={e => setRole(e.target.value)} style={{ width: 'auto', fontSize: 13 }}>
          <option value="member">成员</option>
          <option value="moderator">管理员</option>
        </select>
        <button className="btn-primary" onClick={handleSubmit} disabled={loading || !deptCode.trim()}>
          {loading ? '添加中...' : '按部门添加'}
        </button>
      </div>
      {result && (
        <p style={{ fontSize: 13, marginTop: 4 }}>
          部门共 {result.total_in_dept} 人，
          <span style={{ color: 'var(--success, #22c55e)' }}>添加 {result.added}</span>
          {result.skipped > 0 && <span style={{ color: 'var(--text-sec)', marginLeft: 8 }}>跳过 {result.skipped}</span>}
        </p>
      )}
    </div>
  );
}


function InviteSection({ boardId }: { boardId: string }) {
  const { data: invites, loading, refetch } = useAsync(() => inviteApi.list(boardId), [boardId]);
  const [showCreate, setShowCreate] = useState(false);
  const [role, setRole] = useState('member');
  const [maxUses, setMaxUses] = useState('');
  const [expiresHours, setExpiresHours] = useState('168');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState('');

  async function handleCreate() {
    setCreating(true);
    try {
      await inviteApi.create(boardId, {
        role,
        max_uses: maxUses ? parseInt(maxUses, 10) : null,
        expires_hours: expiresHours ? parseInt(expiresHours, 10) : null,
      });
      setShowCreate(false);
      refetch();
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    await inviteApi.revoke(boardId, inviteId);
    refetch();
  }

  function copyLink(code: string) {
    const url = `${window.location.origin}/join/${code}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(code);
      setTimeout(() => setCopied(''), 2000);
    });
  }

  return (
    <div className="card" style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h4 style={{ fontSize: 14, fontWeight: 600 }}>邀请链接</h4>
        <button className="btn-primary btn-sm" onClick={() => setShowCreate(s => !s)} style={{ fontSize: 12 }}>
          {showCreate ? '取消' : '生成邀请链接'}
        </button>
      </div>

      {showCreate && (
        <div style={{ padding: 12, background: 'var(--bg-sec, #f5f5f5)', borderRadius: 6, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 13 }}>角色:
              <select value={role} onChange={e => setRole(e.target.value)} style={{ marginLeft: 4, width: 'auto', fontSize: 13 }}>
                <option value="member">成员</option>
                <option value="moderator">管理员</option>
              </select>
            </label>
            <label style={{ fontSize: 13 }}>有效期(时):
              <input value={expiresHours} onChange={e => setExpiresHours(e.target.value)} style={{ width: 60, marginLeft: 4, fontSize: 13 }} placeholder="留空=永久" />
            </label>
            <label style={{ fontSize: 13 }}>最大使用次数:
              <input value={maxUses} onChange={e => setMaxUses(e.target.value)} style={{ width: 60, marginLeft: 4, fontSize: 13 }} placeholder="留空=无限" />
            </label>
            <button className="btn-primary btn-sm" onClick={handleCreate} disabled={creating} style={{ fontSize: 12 }}>
              {creating ? '生成中...' : '确认生成'}
            </button>
          </div>
        </div>
      )}

      {loading ? <Loading /> : (invites?.length ?? 0) > 0 ? (
        <table className="dict-table">
          <thead><tr><th>邀请码</th><th>角色</th><th>已用/上限</th><th>过期时间</th><th style={{ width: 100 }}>操作</th></tr></thead>
          <tbody>
            {(invites ?? []).map(inv => (
              <tr key={inv.id}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.code}</td>
                <td>{inv.role === 'moderator' ? '管理员' : '成员'}</td>
                <td>{inv.use_count}{inv.max_uses != null ? `/${inv.max_uses}` : '/∞'}</td>
                <td style={{ fontSize: 12 }}>{inv.expires_at ? new Date(inv.expires_at).toLocaleString() : '永久'}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn-sm" onClick={() => copyLink(inv.code)} style={{ fontSize: 11 }}>
                    {copied === inv.code ? '已复制' : '复制'}
                  </button>
                  <button className="btn-danger btn-sm" onClick={() => handleRevoke(inv.id)} style={{ fontSize: 11 }}>撤销</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p style={{ color: 'var(--text-ter)', fontSize: 13 }}>暂无有效邀请链接</p>
      )}
    </div>
  );
}
