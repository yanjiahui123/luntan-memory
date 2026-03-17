import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Loading } from './UI';

export default function AdminGuard() {
  const { myNamespaces, loading, isAdmin, isBoardAdmin } = useUser();
  const location = useLocation();

  if (loading) return <Loading />;

  if (!isAdmin) return <Navigate to="/boards" replace />;

  if (isBoardAdmin) {
    // 超管专属页面：重定向回仪表盘
    const superAdminOnly = ['/admin/audit', '/admin/users'];
    if (superAdminOnly.some(p => location.pathname.startsWith(p))) {
      return <Navigate to="/admin" replace />;
    }

    // 板块级功能路由（不带 boardId）：重定向到第一个管理板块
    const boardScoped = ['/admin/memories', '/admin/pending', '/admin/settings', '/admin/import'];
    const needsRedirect = boardScoped.some(p => location.pathname.startsWith(p));

    if (needsRedirect) {
      if (myNamespaces && myNamespaces.length > 0) {
        const suffix = location.pathname.replace('/admin', '') || '';
        return <Navigate to={`/admin/boards/${myNamespaces[0].id}${suffix}`} replace />;
      }
      return <Navigate to="/boards" replace />;
    }

    // /admin 仪表盘：允许访问（显示多板块概览）
    if (location.pathname === '/admin' && (!myNamespaces || myNamespaces.length === 0)) {
      return <Navigate to="/boards" replace />;
    }
  }

  return <Outlet />;
}
