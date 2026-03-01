import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { userApi, setEmployeeId } from '../api/client';

const FORUM_NAV = [
  { path: '/boards', label: '全部板块', icon: '🏠' },
];

const ADMIN_NAV = [
  { path: '/admin', label: '仪表盘', icon: '📊' },
  { path: '/admin/memories', label: '记忆管理', icon: '🧠' },
  { path: '/admin/pending', label: '待处理中心', icon: '📋' },
  { path: '/admin/settings', label: '板块配置', icon: '⚙️' },
];

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdminPage = location.pathname.startsWith('/admin');
  const nav = isAdminPage ? ADMIN_NAV : FORUM_NAV;

  const [currentUser, setCurrentUser] = useState(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [inputId, setInputId] = useState('');

  useEffect(() => {
    userApi.me()
      .then(setCurrentUser)
      .catch(() => setCurrentUser(null));
  }, []);

  function handleSwitchUser() {
    if (!inputId.trim()) return;
    setEmployeeId(inputId.trim());
    setShowUserMenu(false);
    userApi.me()
      .then(u => {
        setCurrentUser(u);
        const hasAdminRole = u.role === 'super_admin' || u.role === 'board_admin';
        if (!hasAdminRole && location.pathname.startsWith('/admin')) {
          window.location.href = '/boards';
        } else {
          window.location.reload();
        }
      })
      .catch(() => { setCurrentUser(null); alert('工号不存在或未注册'); });
  }

  const displayName = currentUser?.display_name || '未登录';
  const initial = displayName[0] || '?';
  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isAdmin = isSuperAdmin || currentUser?.role === 'board_admin';

  const roleLabel = isSuperAdmin ? '超级管理员' : currentUser?.role === 'board_admin' ? '板块管理员' : '普通用户';
  const roleColor = isAdmin ? 'var(--green)' : 'var(--text-ter)';

  return (
    <>
      {/* ── Topbar ─────────────────────────────── */}
      <header className="topbar">
        <Link to="/boards" className="topbar__logo" style={{ textDecoration: 'none' }}>知识论坛</Link>
        <div style={{ flex: 1 }} />
        <input className="topbar__search" placeholder="搜索问题或知识..." onKeyDown={e => { if (e.key === 'Enter' && e.target.value) navigate(`/search?q=${encodeURIComponent(e.target.value)}`); }} />
        <nav className="topbar__nav">
          <button className={`topbar__link ${!isAdminPage ? 'topbar__link--active' : ''}`} onClick={() => navigate('/boards')}>论坛</button>
          {isAdmin && (
            <button className={`topbar__link ${isAdminPage ? 'topbar__link--active' : ''}`} onClick={() => navigate('/admin')}>管理后台</button>
          )}
        </nav>

        {/* User avatar + menu */}
        <div style={{ position: 'relative' }}>
          <div
            className="topbar__avatar"
            style={{ cursor: 'pointer', background: isAdmin ? 'var(--green)' : 'var(--accent)' }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={currentUser ? `${displayName} (${currentUser.employee_id})` : '未登录'}
          >
            {initial}
          </div>

          {showUserMenu && (
            <div style={{
              position: 'absolute', top: 40, right: 0, width: 240,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
              padding: 14, zIndex: 200,
            }}>
              {currentUser && (
                <div style={{ marginBottom: 12, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{displayName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-sec)' }}>工号: {currentUser.employee_id}</div>
                  <div style={{ fontSize: 12, color: roleColor }}>
                    {roleLabel}
                  </div>
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text-sec)', marginBottom: 6 }}>切换用户:</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  placeholder="输入工号"
                  value={inputId}
                  onChange={e => setInputId(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSwitchUser()}
                  style={{ flex: 1, fontSize: 13, padding: '5px 8px' }}
                />
                <button className="btn-primary btn-sm" onClick={handleSwitchUser}>切换</button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ── Sidebar ────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar__section">{isAdminPage ? '管理菜单' : '导航'}</div>
        {nav.map(item => (
          <Link key={item.path} to={item.path} className={`sidebar__item ${location.pathname === item.path ? 'sidebar__item--active' : ''}`}>
            {item.icon} {item.label}
          </Link>
        ))}
      </aside>

      {/* ── Main Content ───────────────────────── */}
      <main className="main-content">
        <div className="fade-in">
          <Outlet />
        </div>
      </main>
    </>
  );
}
