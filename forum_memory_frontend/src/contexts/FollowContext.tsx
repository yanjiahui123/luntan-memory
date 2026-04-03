import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { userApi } from '../api/client';
import { useUser } from './UserContext';
import type { Namespace } from '../types';

interface FollowContextValue {
  followedBoards: Namespace[] | null;
  followedIds: Set<string>;
  refetchFollowed: () => void;
}

const FollowContext = createContext<FollowContextValue>({
  followedBoards: null,
  followedIds: new Set(),
  refetchFollowed: () => {},
});

export function FollowProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUser();
  const [followedBoards, setFollowedBoards] = useState<Namespace[] | null>(null);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [ver, setVer] = useState(0);

  const refetchFollowed = useCallback(() => setVer(v => v + 1), []);

  useEffect(() => {
    if (!currentUser) {
      setFollowedBoards(null);
      setFollowedIds(new Set());
      return;
    }
    userApi.followedBoards()
      .then(boards => {
        setFollowedBoards(boards);
        setFollowedIds(new Set(boards.map(b => b.id)));
      })
      .catch(() => {
        setFollowedBoards([]);
        setFollowedIds(new Set());
      });
  }, [currentUser, ver]);

  return (
    <FollowContext.Provider value={{ followedBoards, followedIds, refetchFollowed }}>
      {children}
    </FollowContext.Provider>
  );
}

export function useFollow() {
  return useContext(FollowContext);
}
