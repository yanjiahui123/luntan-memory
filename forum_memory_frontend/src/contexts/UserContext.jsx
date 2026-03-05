import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { userApi } from '../api/client';

const UserContext = createContext(null);

export function UserProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [myNamespaces, setMyNamespaces] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const u = await userApi.me();
      setCurrentUser(u);
      // Fetch managed namespaces for any admin role
      if (u?.role === 'super_admin' || u?.role === 'board_admin') {
        const ns = await userApi.myNamespaces();
        setMyNamespaces(ns);
      } else {
        setMyNamespaces(null);
      }
    } catch {
      setCurrentUser(null);
      setMyNamespaces(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const isSuperAdmin = currentUser?.role === 'super_admin';
  const isBoardAdmin = currentUser?.role === 'board_admin';
  const isAdmin = isSuperAdmin || isBoardAdmin;

  return (
    <UserContext.Provider value={{
      currentUser, myNamespaces, loading,
      isSuperAdmin, isBoardAdmin, isAdmin,
      refetch: fetchUser,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
