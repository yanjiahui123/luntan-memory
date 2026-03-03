import React, { useState, useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { userApi } from '../api/client';
import { Loading } from './UI';

export default function AdminGuard() {
  const [user, setUser] = useState(null);
  const [namespaces, setNamespaces] = useState(null);
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    async function load() {
      try {
        const u = await userApi.me();
        setUser(u);
        if (u?.role === 'board_admin') {
          const ns = await userApi.myNamespaces();
          setNamespaces(ns);
        }
      } catch (_) {
        // ignore — user stays null, guard will redirect
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Loading />;

  const hasAdminRole = user?.role === 'super_admin' || user?.role === 'board_admin';
  if (!hasAdminRole) return <Navigate to="/boards" replace />;

  // board_admin 访问全局 /admin（不带 boardId）时，重定向到其第一个管理板块
  const isBoardAdmin = user?.role === 'board_admin';
  const isGlobalAdminPath = location.pathname === '/admin' ||
    location.pathname.startsWith('/admin/memories') ||
    location.pathname === '/admin/pending' ||
    location.pathname === '/admin/settings' ||
    location.pathname === '/admin/import';

  if (isBoardAdmin && isGlobalAdminPath) {
    if (namespaces && namespaces.length > 0) {
      const suffix = location.pathname.replace('/admin', '') || '';
      return <Navigate to={`/admin/boards/${namespaces[0].id}${suffix}`} replace />;
    }
    // 没有管理任何板块，返回论坛首页
    return <Navigate to="/boards" replace />;
  }

  return <Outlet />;
}
