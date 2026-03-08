import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { Loading } from './UI';

export default function AdminGuard() {
  const { myNamespaces, loading, isAdmin, isBoardAdmin } = useUser();
  const location = useLocation();

  if (loading) return <Loading />;

  if (!isAdmin) return <Navigate to="/boards" replace />;

  // board_admin 访问全局 /admin（不带 boardId）时，重定向到其第一个管理板块
  const isGlobalAdminPath = location.pathname === '/admin' ||
    location.pathname.startsWith('/admin/memories') ||
    location.pathname === '/admin/pending' ||
    location.pathname === '/admin/settings' ||
    location.pathname === '/admin/import';

  if (isBoardAdmin && isGlobalAdminPath) {
    if (myNamespaces && myNamespaces.length > 0) {
      const suffix = location.pathname.replace('/admin', '') || '';
      return <Navigate to={`/admin/boards/${myNamespaces[0].id}${suffix}`} replace />;
    }
    // 没有管理任何板块，返回论坛首页
    return <Navigate to="/boards" replace />;
  }

  return <Outlet />;
}
