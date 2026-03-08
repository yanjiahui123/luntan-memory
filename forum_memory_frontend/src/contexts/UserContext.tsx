import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { userApi } from '../api/client';
import type { User, Namespace } from '../types';

interface UserContextValue {
  currentUser: User | null;
  myNamespaces: Namespace[] | null;
  loading: boolean;
  isSuperAdmin: boolean;
  isBoardAdmin: boolean;
  isAdmin: boolean;
  refetch: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [myNamespaces, setMyNamespaces] = useState<Namespace[] | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    try {
      const u = await userApi.me();
      setCurrentUser(u);
      // Fetch managed namespaces for any admin role — failure here should not
      // clear the already-loaded user, so it has its own try-catch.
      if (u?.role === 'super_admin' || u?.role === 'board_admin') {
        try {
          const ns = await userApi.myNamespaces();
          setMyNamespaces(ns);
        } catch (nsErr) {
          console.warn('Failed to load managed namespaces:', nsErr);
          setMyNamespaces(null);
        }
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
  const isAdmin = (isSuperAdmin ?? false) || (isBoardAdmin ?? false);

  return (
    <UserContext.Provider value={{
      currentUser, myNamespaces, loading,
      isSuperAdmin: isSuperAdmin ?? false,
      isBoardAdmin: isBoardAdmin ?? false,
      isAdmin,
      refetch: fetchUser,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error('useUser must be used within UserProvider');
  return ctx;
}
