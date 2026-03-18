import React from 'react';
import { Navigate } from 'react-router-dom';
import { namespaceApi } from '../api/client';
import { useAsync } from '../hooks/useAsync';
import { Loading, ErrorMsg, EmptyState } from '../components/UI';

export default function BoardList() {
  const { data: boards, loading, error, refetch } = useAsync(() => namespaceApi.list());

  if (loading) return <Loading />;
  if (error) return <ErrorMsg message={error} onRetry={refetch} />;

  const activeBoards = (boards || []).filter(b => b.is_active);

  if (activeBoards.length === 0) {
    return <EmptyState icon="📂" message="还没有板块" />;
  }

  return <Navigate to={`/boards/${activeBoards[0].id}/threads`} replace />;
}
