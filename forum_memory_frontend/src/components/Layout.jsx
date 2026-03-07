import React, { useState, useRef } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { userApi, setEmployeeId } from '../api/client';
import { useUser } from '../contexts/UserContext';

const FORUM_NAV = [
  { path: '/boards', label: '全部板块', icon: '🏠' },
];

const GLOBAL_ADMIN_NAV = [
  { path: '/admin', label: '仪表盘', icon: '📊' },
  { path: '/admin/memories', label: '记忆管理', icon: '🧠' },
  { path: '/admin/pending', label: '待处理中心', icon: '📋' },
  { path: '/admin/settings', label: '板块配置', icon: '⚙️' },
];

function boardAdminNav(boardId) {
  return [
    { path: `/admin/boards/${boardId}`, label: '仪表盘', icon: '📊' },
    { path: `/admin/boards/${boardId}/memories`, label: '记忆管理', icon: '🧠' },
    { path: `/admin/boards/${boardId}/pending`, label: '待处理中心', icon: '📋' },
    { path: `/admin/boards/${boardId}/settings`, label: '板块配置', icon: '⚙️' },
    { path: `/admin/boards/${boardId}/import`, label: '导入帖子', icon: '📥' },
  ];
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isAdmin } = useUser();
  const isAdminPage = location.pathname.startsWith('/admin');

  // 检测是否在板块级管理后台 /admin/boards/:boardId/*
  const boardAdminMatch = location.pathname.match(/^\/admin\/boards\/([^/]+)/);
  const activeBoardId = boardAdminMatch ? boardAdminMatch[1] : null;

  // 检测是否在论坛板块页面 /boards/:boardId/*
  const boardForumMatch = location.pathname.match(/^\/boards\/([^/]+)/);
  const currentBoardId = boardForumMatch ? boardForumMatch[1] : null;

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [inputId, setInputId] = useState('');
  const [searchQ, setSearchQ] = useState('');

  function handleSearch(e) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQ.trim())}${currentBoardId ? `&ns=${currentBoardId}` : ''}`);
    setSearchQ('');
  }

  function handleSwitchUser() {
    if (!inputId.trim()) return;
    setEmployeeId(inputId.trim());
    setShowUserMenu(false);
    userApi.me()
      .then(u => {
        const hasAdminRole = u.role === 'super_admin' || u.role === 'board_admin';
        if (!hasAdminRole && location.pathname.startsWith('/admin')) {
          window.location.href = '/boards';
        } else {
          window.location.reload();
        }
      })
      .catch(() => { alert('工号不存在或未注册'); });
  }

  const displayName = currentUser?.display_name || '未登录';
  const initial = displayName[0] || '?';

  const roleLabel = isSuperAdmin ? '超级管理员' : currentUser?.role === 'board_admin' ? '板块管理员' : '普通用户';
  const roleColor = isAdmin ? 'var(--green)' : 'var(--text-ter)';

  // 选择侧边栏导航
  let nav;
  let sidebarTitle;
  if (!isAdminPage) {
    nav = FORUM_NAV;
    sidebarTitle = '导航';
  } else if (activeBoardId) {
    nav = boardAdminNav(activeBoardId);
    sidebarTitle = '板块管理';
  } else {
    nav = GLOBAL_ADMIN_NAV;
    sidebarTitle = '管理菜单';
  }

  // 管理后台按钮：板块管理员直接进入第一个管理板块后台（由 AdminGuard 处理重定向）
  function handleAdminNav() {
    navigate('/admin');
  }

  return (
    <>
      {/* ── Topbar ─────────────────────────────── */}
      <header className="topbar">
        <Link to="/boards" className="topbar__logo" style={{ textDecoration: 'none' }}>知识论坛</Link>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, margin: '0 16px' }}>
          <input
            className="topbar__search"
            placeholder={currentBoardId ? '搜索当前板块...' : '搜索知识...'}
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </form>
        <nav className="topbar__nav">
          {isAdmin && (
            <button className={`topbar__link ${isAdminPage ? 'topbar__link--active' : ''}`} onClick={handleAdminNav}>管理后台</button>
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
        <div className="sidebar__section">{sidebarTitle}</div>
        {nav.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar__item ${location.pathname === item.path ? 'sidebar__item--active' : ''}`}
          >
            {item.icon} {item.label}
          </Link>
        ))}
        {isAdminPage && (
          <>
            {isSuperAdmin && activeBoardId && (
              <Link to="/admin" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }}>
                ← 全局仪表盘
              </Link>
            )}
            <Link to="/boards" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }}>
              ← 返回论坛
            </Link>
          </>
        )}
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
