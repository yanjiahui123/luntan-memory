# 知识论坛前端

React + Vite + **TypeScript** 构建的论坛前端系统，配合 `forum_memory` 后端使用。

## 技术栈

- **React 18** + **Vite 5** + **TypeScript 5** — 严格类型模式
- **React Router v6** — 路由管理
- **原生 CSS** — 无额外 UI 框架依赖，轻量简洁
- **Fetch API** — 原生 HTTP 请求

## 快速启动（开发模式）

### 1. 安装依赖

```bash
cd forum_memory_frontend
npm install
```

### 2. 启动后端（另一个终端）

```bash
cd forum_memory_backend
pip install -e ".[dev]"
uvicorn forum_memory.main:app --reload --port 8000
```

### 3. 启动前端

```bash
npm run dev
```

前端默认运行在 `http://localhost:3001`，已配置代理将 `/api` 请求转发到后端 `http://localhost:8000`。

---

## 生产部署

### 方式一：Nginx 反向代理（推荐）

#### 步骤

```bash
# 1. 构建生产产物
cd forum_memory_frontend
npm install
npm run build          # 产物输出到 dist/

# 2. 将 dist/ 目录内容部署到 Nginx 静态目录，或直接配置 root
```

#### Nginx 配置示例

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端静态资源
    root /path/to/forum_memory_frontend/dist;
    index index.html;

    # SPA 路由回退：所有非文件请求都返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 反向代理到后端
    location /api/ {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

> **注意**：`location /` 中的 `try_files ... /index.html` 是 SPA 必须的，否则用户刷新非根路径会报 404。

#### 关键环境变量

生产构建时可以通过 `.env.production` 覆盖环境变量：

```bash
# forum_memory_frontend/.env.production
VITE_API_BASE=/api/v1          # 如果后端路径有变化时修改
```

---

### 方式二：Docker（含 Nginx）

```dockerfile
# Dockerfile（放在 forum_memory_frontend/ 目录）
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

`nginx.conf` 内容同上方 Nginx 配置示例（去掉 `server_name`，`root` 改为 `/usr/share/nginx/html`）。

---

## TypeScript 开发说明

### 类型检查

```bash
# 仅做类型检查，不编译输出
npx tsc --noEmit

# 构建（自动做类型检查）
npm run build
```

### 目录约定

| 路径 | 职责 |
|------|------|
| `src/types/index.ts` | 所有领域模型类型（User, Namespace, Thread, Memory 等） |
| `src/api/client.ts` | API 客户端，所有接口都带泛型返回类型 |
| `src/hooks/useAsync.ts` | 通用数据加载 Hook，`useAsync<T>()` |
| `src/hooks/useUrlState.ts` | URL 查询参数双向同步 Hook |
| `src/contexts/UserContext.tsx` | 当前用户状态 Context |
| `src/contexts/ToastContext.tsx` | 全局 Toast 通知 Context |
| `src/components/` | 共享组件（全部 `.tsx`） |
| `src/pages/` | 页面组件（全部 `.tsx`） |

### 新增 API 接口步骤

1. 在 `src/types/index.ts` 补充返回值类型
2. 在 `src/api/client.ts` 对应的 `xxxApi` 对象里添加方法，使用 `get<T>()` / `post<T>()` / `requestPaginated<T>()` 泛型包装
3. 在页面/组件中用 `useAsync(() => xxxApi.method())` 调用

---

## 页面清单

| 路由 | 页面 | 说明 |
|------|------|------|
| `/boards` | 板块列表 | 所有论坛板块入口 |
| `/boards/:id/threads` | 帖子列表 | 板块内帖子流，支持状态筛选 |
| `/boards/:id/new` | 发帖 | 创建新问题，支持相似帖子提示 |
| `/threads/:id` | 帖子详情 | **核心页面**：问答 + AI 回复 + 采纳关闭 |
| `/search?q=xxx&ns=boardId` | 搜索结果 | 记忆语义搜索，需指定板块 |
| `/my-posts` | 我的帖子 | 当前用户发布的帖子列表 |
| `/admin` | 管理仪表盘 | 数据概览 + 快速操作 |
| `/admin/memories` | 记忆列表 | 多维筛选 + 记忆浏览 |
| `/admin/memories/:id` | 记忆详情 | 编辑 + 权威变更 + 质量指标 |
| `/admin/pending` | 待处理中心 | 超时确认 / 低质量处理 / 质量告警 |
| `/admin/settings` | 板块配置 | 基本信息 + 黑话字典 + 知识库 + 管理员 |
| `/admin/import` | 批量导入 | 历史帖子 JSON/ZIP 导入 |
| `/admin/users` | 用户管理 | 用户列表 + 创建/删除 |
| `/admin/audit` | 审计日志 | 操作日志查询 |
| `/admin/boards/:id` | 板块级仪表盘 | 板块管理员专属后台 |
| `/admin/boards/:id/*` | 板块级子路由 | 板块级的记忆/待处理/配置/导入页面 |

---

## 项目结构

```
forum_memory_frontend/
├── index.html              # HTML 入口
├── package.json
├── tsconfig.json           # TypeScript 配置（严格模式）
├── tsconfig.node.json      # Vite 配置文件的 TS 配置
├── vite.config.ts          # Vite 配置（API 代理，端口 3001）
└── src/
    ├── main.tsx            # React 入口
    ├── App.tsx             # 路由定义
    ├── index.css           # 全局样式（CSS 变量 + 组件样式）
    ├── types/
    │   └── index.ts        # 所有领域模型类型定义
    ├── api/
    │   └── client.ts       # 泛型 API 请求封装
    ├── hooks/
    │   ├── useAsync.ts     # 通用数据加载 Hook（泛型）
    │   └── useUrlState.ts  # URL 查询参数双向同步 Hook
    ├── contexts/
    │   ├── UserContext.tsx  # 用户状态 Context
    │   └── ToastContext.tsx # 全局 Toast 通知 Context
    ├── components/
    │   ├── Layout.tsx      # 全局布局（顶栏 + 侧栏 + 内容区）
    │   ├── UI.tsx          # 共享 UI 组件（Badge, Loading, Modal 等）
    │   ├── AdminGuard.tsx  # 管理员路由守卫
    │   ├── ErrorBoundary.tsx
    │   └── ImagePasteTextarea.tsx
    └── pages/
        ├── BoardList.tsx
        ├── ThreadList.tsx
        ├── ThreadDetail.tsx
        ├── NewThread.tsx
        ├── SearchResults.tsx
        ├── MyPosts.tsx
        ├── AdminDashboard.tsx
        ├── MemoryList.tsx
        ├── MemoryDetail.tsx
        ├── PendingCenter.tsx
        ├── BoardConfig.tsx
        ├── ImportTopics.tsx
        ├── UserManagement.tsx
        └── AuditLog.tsx
```

## API 代理（开发模式）

`vite.config.ts` 中配置了开发代理：

```ts
proxy: {
  '/api': {
    target: 'http://localhost:8000',  // 后端地址
    changeOrigin: true,
  },
}
```

**生产环境**不使用 Vite 代理，由 Nginx 的 `location /api/` 块接管。
