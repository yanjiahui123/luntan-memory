import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const FORUM_NAV: NavItem[] = [
  { path: '/boards', label: '全部板块', icon: '🏠' },
];

const GLOBAL_ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: '仪表盘', icon: '📊' },
  { path: '/admin/memories', label: '记忆管理', icon: '🧠' },
  { path: '/admin/pending', label: '待处理中心', icon: '📋' },
  { path: '/admin/audit', label: '审计日志', icon: '📜' },
  { path: '/admin/users', label: '用户管理', icon: '👥' },
  { path: '/admin/settings', label: '板块配置', icon: '⚙️' },
];

function boardAdminNav(boardId: string): NavItem[] {
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

  // 记住最后访问的板块，以便从 /threads/:id 等非板块页面搜索时也能传递板块上下文
  useEffect(() => {
    if (currentBoardId) {
      sessionStorage.setItem('lastBoardId', currentBoardId);
    }
  }, [currentBoardId]);
  const effectiveBoardId = currentBoardId || sessionStorage.getItem('lastBoardId');

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQ.trim())}${effectiveBoardId ? `&ns=${effectiveBoardId}` : ''}`);
    setSearchQ('');
  }

  const displayName = currentUser?.display_name || '未登录';
  const initial = displayName[0] || '?';

  const roleLabel = isSuperAdmin ? '超级管理员' : currentUser?.role === 'board_admin' ? '板块管理员' : '普通用户';
  const roleColor = isAdmin ? 'var(--green)' : 'var(--text-ter)';

  // 动态论坛导航（包含"我的帖子"）
  const forumNav: NavItem[] = [...FORUM_NAV];
  if (currentUser) {
    forumNav.push({ path: `/my-posts`, label: '我的帖子', icon: '📝' });
  }

  // 选择侧边栏导航
  let nav: NavItem[];
  let sidebarTitle: string;
  if (!isAdminPage) {
    nav = forumNav;
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
        <button
          className="topbar__hamburger"
          onClick={() => setSidebarOpen(!sidebarOpen)}
          aria-label="Toggle sidebar"
        >
          {sidebarOpen ? '\u2715' : '\u2630'}
        </button>
        <Link to="/boards" className="topbar__logo" style={{ textDecoration: 'none' }}>知识论坛</Link>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, margin: '0 16px' }}>
          <input
            className="topbar__search"
            placeholder={effectiveBoardId ? '搜索当前板块...' : '搜索知识...'}
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
            <>
              {/* 点击遮罩关闭 */}
              <div
                style={{ position: 'fixed', inset: 0, zIndex: 199 }}
                onClick={() => setShowUserMenu(false)}
              />
              <div style={{
                position: 'absolute', top: 40, right: 0, width: 220,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                padding: 14, zIndex: 200,
              }}>
                {currentUser ? (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{displayName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>工号 {currentUser.employee_id}</div>
                    {currentUser.email && (
                      <div style={{ fontSize: 12, color: 'var(--text-sec)', marginTop: 2 }}>{currentUser.email}</div>
                    )}
                    <div style={{ fontSize: 11, color: roleColor, marginTop: 2 }}>{roleLabel}</div>
                  </div>
                ) : (
                  <div style={{ fontSize: 13, color: 'var(--text-sec)' }}>未登录，请通过 SSO 登录</div>
                )}
              </div>
            </>
          )}
        </div>
      </header>

      {/* ── Sidebar overlay (mobile) ──────────── */}
      {sidebarOpen && (
        <div className="sidebar-overlay sidebar-overlay--visible" onClick={() => setSidebarOpen(false)} />
      )}

      {/* ── Sidebar ────────────────────────────── */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        <div className="sidebar__section">{sidebarTitle}</div>
        {nav.map(item => (
          <Link
            key={item.path}
            to={item.path}
            className={`sidebar__item ${location.pathname === item.path ? 'sidebar__item--active' : ''}`}
            onClick={() => setSidebarOpen(false)}
          >
            {item.icon} {item.label}
          </Link>
        ))}
        {isAdminPage && (
          <>
            {isSuperAdmin && activeBoardId && (
              <Link to="/admin" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }} onClick={() => setSidebarOpen(false)}>
                ← 全局仪表盘
              </Link>
            )}
            <Link to="/boards" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }} onClick={() => setSidebarOpen(false)}>
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
