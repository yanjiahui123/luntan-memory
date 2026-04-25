import React, { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * RouteListener 组件
 *
 * 功能：
 * 1. 监听路由变化，并将当前路径发送给父窗口（用于 iframe 嵌套场景）。
 * 2. 监听来自父窗口的消息，当收到 'showForum' 指令时发送当前路径。
 */
function RouteListener() {
  const location = useLocation();

  useEffect(() => {
    // 发送当前路由路径到父窗口的函数
    const sendRoutePath = () => {
      const targetOrigin = '*';

      if (window.parent) {
        window.parent.postMessage({
          type: 'forumPath',
          data: {
            path: location.pathname,
          },
        }, targetOrigin);
      }
    };

    // 1. 组件挂载或路由变化时，主动发送一次路径
    sendRoutePath();

    // 2. 处理来自父窗口的消息
    const handleMessage = (event: MessageEvent) => {

      if (event.data && event.data.type === 'showForum') {
        sendRoutePath();
      }
    };

    // 添加事件监听器
    window.addEventListener('message', handleMessage);

    // 清理函数：组件卸载时移除事件监听器
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [location]); // 依赖项包含 location，确保路由变化时重新执行

  // 该组件不渲染任何 UI
  return null;
}

export default RouteListener;