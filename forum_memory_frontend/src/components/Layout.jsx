import React from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';

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
  const isAdmin = location.pathname.startsWith('/admin');
  const nav = isAdmin ? ADMIN_NAV : FORUM_NAV;

  return (
    <>
      {/* ── Topbar ─────────────────────────────── */}
      <header className="topbar">
        <Link to="/boards" className="topbar__logo" style={{ textDecoration: 'none' }}>💡 知识论坛</Link>
        <div style={{ flex: 1 }} />
        <input className="topbar__search" placeholder="搜索问题或知识..." onKeyDown={e => { if (e.key === 'Enter' && e.target.value) navigate(`/search?q=${encodeURIComponent(e.target.value)}`); }} />
        <nav className="topbar__nav">
          <button className={`topbar__link ${!isAdmin ? 'topbar__link--active' : ''}`} onClick={() => navigate('/boards')}>论坛</button>
          <button className={`topbar__link ${isAdmin ? 'topbar__link--active' : ''}`} onClick={() => navigate('/admin')}>管理后台</button>
        </nav>
        <div className="topbar__avatar">U</div>
      </header>

      {/* ── Sidebar ────────────────────────────── */}
      <aside className="sidebar">
        <div className="sidebar__section">{isAdmin ? '管理菜单' : '导航'}</div>
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
