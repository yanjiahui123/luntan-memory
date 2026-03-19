import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../api/client';
import type { AppNotification } from '../types';

function formatTimeAgo(date: string): string {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} 天前`;
  return new Date(date).toLocaleDateString('zh-CN');
}

function notificationText(n: AppNotification): string {
  const actor = n.actor_display_name || '某用户';
  if (n.notification_type === 'reply_to_comment') {
    return `${actor} 回复了你的评论`;
  }
  return `${actor} 评论了你的帖子`;
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Poll unread count every 30s
  const fetchUnread = useCallback(() => {
    notificationApi.unreadCount()
      .then(res => setUnread(res.unread_count))
      .catch(() => { /* silently ignore polling errors */ });
  }, []);

  useEffect(() => {
    fetchUnread();
    const timer = setInterval(fetchUnread, 30_000);
    return () => clearInterval(timer);
  }, [fetchUnread]);

  // Load notifications when panel opens
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    notificationApi.list({ page: 1, size: 20 })
      .then(res => setNotifications(res.items))
      .catch(() => { /* ignore */ })
      .finally(() => setLoading(false));
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  function handleItemClick(n: AppNotification) {
    if (!n.is_read) {
      notificationApi.markRead(n.id).then(fetchUnread).catch(() => {});
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, is_read: true } : item));
    }
    setOpen(false);
    navigate(`/threads/${n.thread_id}`);
  }

  function handleMarkAllRead() {
    notificationApi.markAllRead().then(() => {
      setUnread(0);
      setNotifications(prev => prev.map(item => ({ ...item, is_read: true })));
    }).catch(() => {});
  }

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        className="topbar__bell"
        onClick={() => setOpen(!open)}
        aria-label="通知"
      >
        🔔
        {unread > 0 && <span className="topbar__bell-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel__header">
            <span style={{ fontWeight: 700, fontSize: 14 }}>通知</span>
            {unread > 0 && (
              <button
                className="notification-panel__mark-all"
                onClick={handleMarkAllRead}
              >
                全部标记已读
              </button>
            )}
          </div>

          <div className="notification-panel__body">
            {loading && (
              <div className="notification-panel__empty">加载中...</div>
            )}
            {!loading && notifications.length === 0 && (
              <div className="notification-panel__empty">暂无通知</div>
            )}
            {!loading && notifications.map(n => (
              <div
                key={n.id}
                className={`notification-item${n.is_read ? '' : ' notification-item--unread'}`}
                onClick={() => handleItemClick(n)}
              >
                {!n.is_read && <span className="notification-item__dot" />}
                <div className="notification-item__content">
                  <div className="notification-item__text">{notificationText(n)}</div>
                  {n.thread_title && (
                    <div className="notification-item__title">{n.thread_title}</div>
                  )}
                  <div className="notification-item__time">{formatTimeAgo(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
