import React, { useState } from 'react';
import { userApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { useToast } from '../contexts/ToastContext';
import { Loading, ErrorMsg, EmptyState, Badge } from '../components/UI';
import type { User, UserRole } from '../types';

const ROLE_OPTIONS: { value: UserRole | ''; label: string }[] = [
  { value: '', label: '全部' },
  { value: 'super_admin', label: '超级管理员' },
  { value: 'board_admin', label: '板块管理员' },
  { value: 'user', label: '普通用户' },
];

const ROLE_BADGE: Record<UserRole, { type: string; label: string }> = {
  super_admin: { type: 'red', label: '超级管理员' },
  board_admin: { type: 'amber', label: '板块管理员' },
  user: { type: 'gray', label: '普通用户' },
};

export default function UserManagement() {
  const { data: users, loading, error, refetch } = useAsync(() => userApi.list());
  const [roleFilter, setRoleFilter] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<User | null>(null);

  const filtered = filterUsers(users, roleFilter, searchQ);

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">用户管理</h1>
        <button className="btn-primary" onClick={() => setShowCreate(true)}>+ 创建用户</button>
      </div>

      <div className="filter-bar" style={{ marginBottom: 16 }}>
        {ROLE_OPTIONS.map(r => (
          <button key={r.value} className={`filter-pill ${roleFilter === r.value ? 'filter-pill--active' : ''}`} onClick={() => setRoleFilter(r.value)}>
            {r.label}
          </button>
        ))}
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="搜索工号或姓名..."
          style={{ maxWidth: 200, fontSize: 13, padding: '6px 12px' }}
        />
      </div>

      {filtered.length === 0 ? <EmptyState icon="👥" message="没有匹配的用户" /> : (
        <div className="card" style={{ padding: '0 16px' }}>
          {filtered.map(u => (
            <UserRow key={u.id} user={u} onEdit={() => setEditTarget(u)} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />
      )}
      {editTarget && (
        <EditUserModal user={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); refetch(); }} />
      )}
    </div>
  );
}

function filterUsers(users: User[] | null, roleFilter: string, searchQ: string): User[] {
  return (users ?? []).filter(u => {
    if (roleFilter && u.role !== roleFilter) return false;
    if (searchQ) {
      const q = searchQ.toLowerCase();
      return u.display_name.toLowerCase().includes(q)
        || u.employee_id.includes(q)
        || (u.username?.toLowerCase().includes(q));
    }
    return true;
  });
}

function UserRow({ user, onEdit }: { user: User; onEdit: () => void }) {
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
        {user.display_name[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{user.display_name}</div>
        <div style={{ fontSize: 12, color: 'var(--text-ter)', display: 'flex', gap: 12 }}>
          <span>工号: {user.employee_id}</span>
          {user.username && <span>用户名: {user.username}</span>}
          {user.email && <span>{user.email}</span>}
        </div>
      </div>
      <Badge type={ROLE_BADGE[user.role]?.type || 'gray'}>{ROLE_BADGE[user.role]?.label || user.role}</Badge>
      <button className="btn-secondary btn-sm" onClick={onEdit}>编辑</button>
    </div>
  );
}

function EditUserModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({
    display_name: user.display_name,
    username: user.username || '',
    email: user.email || '',
    role: user.role,
  });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.display_name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await userApi.update(user.id, {
        display_name: form.display_name.trim(),
        username: form.username.trim() || undefined,
        email: form.email.trim() || undefined,
        role: form.role as UserRole,
      } as Partial<User>);
      addToast('success', '用户信息已更新');
      onSaved();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const isSystem = user.employee_id === '00000000';

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, maxWidth: 480, width: '90%' }}>
        <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>编辑用户</h3>
        <form onSubmit={handleSubmit}>
          <FieldGroup label="工号">
            <input value={user.employee_id} disabled style={{ background: 'var(--surface-alt)', color: 'var(--text-ter)' }} />
          </FieldGroup>
          <FieldGroup label="显示名称 *">
            <input value={form.display_name} onChange={e => update('display_name', e.target.value)} required />
          </FieldGroup>
          <FieldGroup label="用户名">
            <input value={form.username} onChange={e => update('username', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="邮箱">
            <input type="email" value={form.email} onChange={e => update('email', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="角色" last>
            <select value={form.role} onChange={e => update('role', e.target.value)} disabled={isSystem} style={{ width: 'auto', minWidth: 160 }}>
              <option value="user">普通用户</option>
              <option value="board_admin">板块管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
            {isSystem && <div style={{ fontSize: 11, color: 'var(--text-ter)', marginTop: 4 }}>系统管理员角色不可修改</div>}
          </FieldGroup>

          {formError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>错误: {formError}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '保存中...' : '保存'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { addToast } = useToast();
  const [form, setForm] = useState({ employee_id: '', username: '', display_name: '', email: '', role: 'user' as UserRole });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function update(field: string, value: string) {
    setForm(f => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.employee_id.trim() || !form.display_name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await userApi.create({
        employee_id: form.employee_id.trim(),
        username: form.username.trim() || form.employee_id.trim(),
        display_name: form.display_name.trim(),
        email: form.email.trim() || undefined,
        role: form.role,
      } as Partial<User>);
      addToast('success', '用户创建成功');
      onCreated();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div className="card fade-in" style={{ padding: 24, maxWidth: 480, width: '90%' }}>
        <h3 style={{ marginBottom: 16, fontSize: 16, fontWeight: 700 }}>创建新用户</h3>
        <form onSubmit={handleSubmit}>
          <FieldGroup label="工号 *">
            <input placeholder="如: 10001" value={form.employee_id} onChange={e => update('employee_id', e.target.value)} required />
          </FieldGroup>
          <FieldGroup label="显示名称 *">
            <input placeholder="如: 张三" value={form.display_name} onChange={e => update('display_name', e.target.value)} required />
          </FieldGroup>
          <FieldGroup label="用户名">
            <input placeholder="留空则使用工号" value={form.username} onChange={e => update('username', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="邮箱">
            <input type="email" placeholder="可选" value={form.email} onChange={e => update('email', e.target.value)} />
          </FieldGroup>
          <FieldGroup label="角色" last>
            <select value={form.role} onChange={e => update('role', e.target.value)} style={{ width: 'auto', minWidth: 160 }}>
              <option value="user">普通用户</option>
              <option value="board_admin">板块管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          </FieldGroup>

          {formError && <div style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>错误: {formError}</div>}

          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="btn-secondary" onClick={onClose}>取消</button>
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? '创建中...' : '创建'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FieldGroup({ label, last, children }: { label: string; last?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: last ? 20 : 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}
