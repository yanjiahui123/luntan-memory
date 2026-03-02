import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import AdminGuard from './components/AdminGuard';

import BoardList from './pages/BoardList';
import ThreadList from './pages/ThreadList';
import ThreadDetail from './pages/ThreadDetail';
import NewThread from './pages/NewThread';
import SearchResults from './pages/SearchResults';
import AdminDashboard from './pages/AdminDashboard';
import MemoryList from './pages/MemoryList';
import MemoryDetail from './pages/MemoryDetail';
import PendingCenter from './pages/PendingCenter';
import BoardConfig from './pages/BoardConfig';
import ImportTopics from './pages/ImportTopics';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          {/* Forum routes */}
          <Route path="/" element={<Navigate to="/boards" replace />} />
          <Route path="/boards" element={<BoardList />} />
          <Route path="/boards/:boardId/threads" element={<ThreadList />} />
          <Route path="/boards/:boardId/new" element={<NewThread />} />
          <Route path="/threads/:threadId" element={<ThreadDetail />} />
          <Route path="/search" element={<SearchResults />} />

          {/* Admin routes — protected by AdminGuard */}
          <Route element={<AdminGuard />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/memories" element={<MemoryList />} />
            <Route path="/admin/memories/:memoryId" element={<MemoryDetail />} />
            <Route path="/admin/pending" element={<PendingCenter />} />
            <Route path="/admin/settings" element={<BoardConfig />} />
            <Route path="/admin/import" element={<ImportTopics />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
