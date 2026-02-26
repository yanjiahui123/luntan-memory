# 知识论坛前端

React + Vite 构建的论坛前端系统，配合 `forum_memory` 后端使用。

## 技术栈

- **React 18** + **Vite 5** — 快速开发与构建
- **React Router v6** — 路由管理
- **原生 CSS** — 无额外 UI 框架依赖，轻量简洁
- **Fetch API** — 原生 HTTP 请求

## 快速启动

### 1. 安装依赖

```bash
cd frontend
npm install
```

### 2. 启动后端（另一个终端）

```bash
cd forum_memory项目目录
pip install -e ".[dev]"
uvicorn forum_memory.main:app --reload --port 8000
```

### 3. 启动前端

```bash
npm run dev
```

前端默认运行在 `http://localhost:3000`，已配置代理将 `/api` 请求转发到后端 `http://localhost:8000`。

## 页面清单

| 路由 | 页面 | 说明 |
|------|------|------|
| `/boards` | 板块列表 | 所有论坛板块入口 |
| `/boards/:id/threads` | 帖子列表 | 板块内帖子流，支持状态筛选 |
| `/boards/:id/new` | 发帖 | 创建新问题 |
| `/threads/:id` | 帖子详情 | **核心页面**：问答 + AI 回复 + 采纳关闭 |
| `/search?q=xxx` | 搜索结果 | 帖子 + 记忆融合搜索 |
| `/admin` | 管理仪表盘 | 数据概览 + 快速操作 |
| `/admin/memories` | 记忆列表 | 多维筛选 + 记忆浏览 |
| `/admin/memories/:id` | 记忆详情 | 编辑 + 权威变更 + 质量指标 |
| `/admin/pending` | 待处理中心 | 超时确认 / 低质量处理 |
| `/admin/settings` | 板块配置 | 基本信息 + 黑话字典管理 |

## 项目结构

```
frontend/
├── index.html              # HTML 入口
├── package.json            # 依赖管理
├── vite.config.js          # Vite 配置（含 API 代理）
└── src/
    ├── main.jsx            # React 入口
    ├── App.jsx             # 路由定义
    ├── index.css           # 全局样式（CSS 变量 + 组件样式）
    ├── api/
    │   └── client.js       # API 请求封装（对应所有后端接口）
    ├── hooks/
    │   └── useAsync.js     # 通用数据加载 Hook
    ├── components/
    │   ├── Layout.jsx      # 全局布局（顶栏 + 侧栏 + 内容区）
    │   └── UI.jsx          # 共享 UI 组件（Badge, Loading, Modal 等）
    └── pages/
        ├── BoardList.jsx       # P1
        ├── ThreadList.jsx      # P2
        ├── ThreadDetail.jsx    # P3
        ├── NewThread.jsx       # P4
        ├── SearchResults.jsx   # P5
        ├── AdminDashboard.jsx  # P6
        ├── MemoryList.jsx      # P7
        ├── MemoryDetail.jsx    # P8
        ├── PendingCenter.jsx   # P9
        └── BoardConfig.jsx     # P10
```

## API 代理

`vite.config.js` 中配置了开发代理：

```js
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // 后端地址
    changeOrigin: true,
  },
}
```

生产部署时需通过 Nginx 或其他反向代理处理 `/api` 路径转发。
