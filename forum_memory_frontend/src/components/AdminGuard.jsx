import React, { useState, useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { userApi } from '../api/client';
import { Loading } from './UI';

export default function AdminGuard() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    userApi.me()
      .then(u => { setUser(u); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <Loading />;

  const hasAdminRole = user?.role === 'super_admin' || user?.role === 'board_admin';
  if (!hasAdminRole) return <Navigate to="/boards" replace />;

  return <Outlet />;
}
