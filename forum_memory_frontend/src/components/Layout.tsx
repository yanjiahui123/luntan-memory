import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import type { Namespace, User } from '../types';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const GLOBAL_ADMIN_NAV: NavItem[] = [
  { path: '/admin', label: '仪表盘', icon: '📊' },
  { path: '/admin/memories', label: '记忆管理', icon: '🧠' },
  { path: '/admin/pending', label: '待处理中心', icon: '📋' },
  { path: '/admin/audit', label: '审计日志', icon: '📜' },
  { path: '/admin/users', label: '用户管理', icon: '👥' },
  { path: '/admin/settings', label: '板块配置', icon: '⚙️' },
];

const BOARD_ADMIN_GLOBAL_NAV: NavItem[] = [
  { path: '/admin', label: '仪表盘', icon: '📊' },
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

/* ── Forum sidebar: dynamic board list ─────────── */
function ForumSidebar({ boards, currentBoardId, currentUser, locationPath, onClose }: {
  boards: Namespace[] | null;
  currentBoardId: string | null;
  currentUser: User | null;
  locationPath: string;
  onClose: () => void;
}) {
  const activeBoards = boards ? boards.filter(b => b.is_active) : null;
  return (
    <>
      <div className="sidebar__section">板块</div>
      {activeBoards === null ? (
        <div style={{ padding: '8px 20px', fontSize: 12, color: 'var(--text-ter)' }}>加载中...</div>
      ) : activeBoards.length === 0 ? (
        <div style={{ padding: '8px 20px', fontSize: 12, color: 'var(--text-ter)' }}>暂无板块</div>
      ) : (
        activeBoards.map(b => (
          <Link
            key={b.id}
            to={`/boards/${b.id}/threads`}
            className={`sidebar__item ${currentBoardId === b.id ? 'sidebar__item--active' : ''}`}
            onClick={onClose}
          >
            {b.display_name}
          </Link>
        ))
      )}
      {currentUser && (
        <>
          <div className="sidebar__section" style={{ marginTop: 12 }}>其他</div>
          <Link
            to="/my-posts"
            className={`sidebar__item ${locationPath === '/my-posts' ? 'sidebar__item--active' : ''}`}
            onClick={onClose}
          >
            📝 我的帖子
          </Link>
        </>
      )}
    </>
  );
}

/* ── Admin sidebar: static nav items ───────────── */
function AdminSidebar({ nav, sidebarTitle, activeBoardId, isBoardAdmin, isAdmin, myNamespaces, locationPath, onClose }: {
  nav: NavItem[];
  sidebarTitle: string;
  activeBoardId: string | null;
  isBoardAdmin: boolean;
  isAdmin: boolean;
  myNamespaces: Namespace[] | null;
  locationPath: string;
  onClose: () => void;
}) {
  return (
    <>
      <div className="sidebar__section">{sidebarTitle}</div>
      {nav.map(item => (
        <Link
          key={item.path}
          to={item.path}
          className={`sidebar__item ${locationPath === item.path ? 'sidebar__item--active' : ''}`}
          onClick={onClose}
        >
          {item.icon} {item.label}
        </Link>
      ))}
      {isBoardAdmin && !activeBoardId && myNamespaces && myNamespaces.length > 0 && (
        <>
          <div className="sidebar__section" style={{ marginTop: 12 }}>我管理的板块</div>
          {myNamespaces.map(ns => (
            <Link key={ns.id} to={`/admin/boards/${ns.id}`} className="sidebar__item" onClick={onClose}>
              {ns.display_name}
            </Link>
          ))}
        </>
      )}
      {isAdmin && activeBoardId && (
        <Link to="/admin" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }} onClick={onClose}>
          ← 管理仪表盘
        </Link>
      )}
      <Link to="/boards" className="sidebar__item" style={{ marginTop: 8, color: 'var(--text-ter)', fontSize: 12 }} onClick={onClose}>
        ← 返回论坛
      </Link>
    </>
  );
}

/* ── User dropdown menu ────────────────────────── */
function UserMenu({ currentUser, roleLabel, roleColor, onClose }: {
  currentUser: User | null;
  roleLabel: string;
  roleColor: string;
  onClose: () => void;
}) {
  const displayName = currentUser?.display_name || '未登录';
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={onClose} />
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
  );
}

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, isSuperAdmin, isBoardAdmin, isAdmin, myNamespaces } = useUser();
  const isAdminPage = location.pathname.startsWith('/admin');

  const boardAdminMatch = location.pathname.match(/^\/admin\/boards\/([^/]+)/);
  const activeBoardId = boardAdminMatch ? boardAdminMatch[1] : null;
  const boardForumMatch = location.pathname.match(/^\/boards\/([^/]+)/);
  const currentBoardId = boardForumMatch ? boardForumMatch[1] : null;

  useEffect(() => {
    if (currentBoardId) sessionStorage.setItem('lastBoardId', currentBoardId);
  }, [currentBoardId]);
  const effectiveBoardId = currentBoardId || sessionStorage.getItem('lastBoardId');

  const { data: allBoards } = useAsync(
    () => isAdminPage ? Promise.resolve(null) : namespaceApi.list(),
    [isAdminPage],
  );

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQ.trim()) return;
    navigate(`/search?q=${encodeURIComponent(searchQ.trim())}${effectiveBoardId ? `&ns=${effectiveBoardId}` : ''}`);
    setSearchQ('');
  }

  const closeSidebar = () => setSidebarOpen(false);
  const displayName = currentUser?.display_name || '未登录';
  const initial = displayName[0] || '?';
  let roleLabel = '普通用户';
  if (isSuperAdmin) roleLabel = '超级管理员';
  else if (currentUser?.role === 'board_admin') roleLabel = '板块管理员';
  const roleColor = isAdmin ? 'var(--green)' : 'var(--text-ter)';

  let adminNav: NavItem[] = GLOBAL_ADMIN_NAV;
  let adminTitle = '管理菜单';
  if (activeBoardId) { adminNav = boardAdminNav(activeBoardId); adminTitle = '板块管理'; }
  else if (isBoardAdmin) { adminNav = BOARD_ADMIN_GLOBAL_NAV; }

  return (
    <>
      {/* ── Topbar ─────────────────────────────── */}
      <header className="topbar">
        <button className="topbar__hamburger" onClick={() => setSidebarOpen(!sidebarOpen)} aria-label="Toggle sidebar">
          {sidebarOpen ? '\u2715' : '\u2630'}
        </button>
        <Link to="/boards" className="topbar__logo" style={{ textDecoration: 'none' }}>知识论坛</Link>
        <form onSubmit={handleSearch} style={{ flex: 1, maxWidth: 400, margin: '0 16px' }}>
          <input className="topbar__search" placeholder={effectiveBoardId ? '搜索当前板块...' : '搜索知识...'} value={searchQ} onChange={e => setSearchQ(e.target.value)} />
        </form>
        <nav className="topbar__nav">
          {isAdmin && (
            <button className={`topbar__link ${isAdminPage ? 'topbar__link--active' : ''}`} onClick={() => navigate('/admin')}>管理后台</button>
          )}
        </nav>
        <div style={{ position: 'relative' }}>
          <div
            className="topbar__avatar"
            style={{ cursor: 'pointer', background: isAdmin ? 'var(--green)' : 'var(--accent)' }}
            onClick={() => setShowUserMenu(!showUserMenu)}
            title={currentUser ? `${displayName} (${currentUser.employee_id})` : '未登录'}
          >{initial}</div>
          {showUserMenu && (
            <UserMenu currentUser={currentUser} roleLabel={roleLabel} roleColor={roleColor} onClose={() => setShowUserMenu(false)} />
          )}
        </div>
      </header>

      {/* ── Sidebar ────────────────────────────── */}
      {sidebarOpen && <div className="sidebar-overlay sidebar-overlay--visible" onClick={closeSidebar} />}
      <aside className={`sidebar${sidebarOpen ? ' sidebar--open' : ''}`}>
        {isAdminPage ? (
          <AdminSidebar nav={adminNav} sidebarTitle={adminTitle} activeBoardId={activeBoardId} isBoardAdmin={isBoardAdmin} isAdmin={isAdmin} myNamespaces={myNamespaces} locationPath={location.pathname} onClose={closeSidebar} />
        ) : (
          <ForumSidebar boards={allBoards} currentBoardId={currentBoardId} currentUser={currentUser} locationPath={location.pathname} onClose={closeSidebar} />
        )}
      </aside>

      {/* ── Main Content ───────────────────────── */}
      <main className="main-content">
        <div className="fade-in"><Outlet /></div>
      </main>
    </>
  );
}
