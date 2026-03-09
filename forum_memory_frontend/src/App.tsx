import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import { ToastProvider } from './contexts/ToastContext';
import ErrorBoundary from './components/ErrorBoundary';
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
import UserManagement from './pages/UserManagement';
import AuditLog from './pages/AuditLog';
import MyPosts from './pages/MyPosts';

export default function App() {
  return (
    <BrowserRouter>
      <UserProvider>
      <ToastProvider>
      <ErrorBoundary>
      <Routes>
        <Route element={<Layout />}>
          {/* Forum routes */}
          <Route path="/" element={<Navigate to="/boards" replace />} />
          <Route path="/boards" element={<BoardList />} />
          <Route path="/boards/:boardId/threads" element={<ThreadList />} />
          <Route path="/boards/:boardId/new" element={<NewThread />} />
          <Route path="/threads/:threadId" element={<ThreadDetail />} />
          <Route path="/search" element={<SearchResults />} />
          <Route path="/my-posts" element={<MyPosts />} />

          {/* Admin routes — protected by AdminGuard */}
          <Route element={<AdminGuard />}>
            {/* 全局仪表盘（超级管理员）或板块管理员重定向入口 */}
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/memories" element={<MemoryList />} />
            <Route path="/admin/memories/:memoryId" element={<MemoryDetail />} />
            <Route path="/admin/pending" element={<PendingCenter />} />
            <Route path="/admin/settings" element={<BoardConfig />} />
            <Route path="/admin/import" element={<ImportTopics />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/audit" element={<AuditLog />} />

            {/* 板块级管理路由（板块管理员或超级管理员进入特定板块后台） */}
            <Route path="/admin/boards/:boardId" element={<AdminDashboard />} />
            <Route path="/admin/boards/:boardId/memories" element={<MemoryList />} />
            <Route path="/admin/boards/:boardId/memories/:memoryId" element={<MemoryDetail />} />
            <Route path="/admin/boards/:boardId/pending" element={<PendingCenter />} />
            <Route path="/admin/boards/:boardId/settings" element={<BoardConfig />} />
            <Route path="/admin/boards/:boardId/import" element={<ImportTopics />} />
          </Route>
        </Route>
      </Routes>
      </ErrorBoundary>
      </ToastProvider>
      </UserProvider>
    </BrowserRouter>
  );
}
