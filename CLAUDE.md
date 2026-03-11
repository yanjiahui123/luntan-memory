# Forum Memory Agent

## 设计原则

- **减少用户使用负担**：AI 应主动服务用户，而非需要手动触发。发帖后 AI 自动分析并回复，知识提取自动完成，用户只需关注内容本身。
- **软删除优先**：帖子和板块采用软删除（状态标记），保留数据完整性和可恢复性。
- **事件驱动**：通过 DomainEvent 表 + Dagster sensor 轮询实现异步编排，避免同步阻塞。

## 技术栈

- **后端**: FastAPI (同步) + SQLModel + PostgreSQL
- **前端**: React (Vite)
- **搜索**: Elasticsearch 8.9 (每板块独立索引，混合搜索 BM25+KNN)
- **编排**: Dagster (sensor 轮询事件，graph 流水线可视化)
- **LLM**: OpenAI / 自定义 HTTP Provider

## 架构约定

- Python 代码全部同步（无 async/await），Dagster 负责异步调度
- 每个板块(Namespace)对应一个独立 ES 索引，`Namespace.es_index_name` 记录索引名
- ES 索引命名规则：`{es_index_prefix}_{namespace_name}`
- 帖子生命周期：OPEN → RESOLVED / TIMEOUT_CLOSED / DELETED
- 记忆生命周期：ACTIVE → COLD (180天) → ARCHIVED (365天)
- 提取流水线 5 步：加载讨论 → 压缩 → 提取知识点 → AUDN判定 → 完成

## 关键目录

- `forum_memory_backend/forum_memory/` — 后端主代码
- `forum_memory_frontend/src/` — 前端主代码
- `forum_memory_backend/forum_memory/dagster/` — Dagster 编排 (assets, sensors, definitions)
- `forum_memory_backend/forum_memory/services/` — 业务逻辑层
- `forum_memory_backend/forum_memory/scripts/` — 运维脚本 (reindex, backfill)

## 多仓库同步

本项目同时维护 3 个 Git 仓库，代码变更后需同步推送：

| 仓库 | SSH 地址 | 分支 | 内容 |
|------|---------|------|------|
| **主仓（全量）** | `git@github.com:yanjiahui123/luntan-memory.git` | master | 前后端 + docs |
| **后端服务** | `git@github.com:yanjiahui123/memory_service.git` | main | `forum_memory_backend/` → 仓库根 + `docs/` |
| **前端站点** | `git@github.com:yanjiahui123/memory_website.git` | main | `forum_memory_frontend/` → 仓库根（不含 node_modules/dist） |

### 同步流程

1. 在主仓完成开发、提交、push master
2. 同步后端：将 `forum_memory_backend/*` 和 `docs/` 复制到 `memory_service` 仓库根目录，提交并 push
3. 同步前端：将 `forum_memory_frontend/*`（排除 node_modules/dist）复制到 `memory_website` 仓库根目录，提交并 push

### 同步用临时目录

克隆地址在 `D:\pythonProject\_repo_sync\{memory_service,memory_website}`，使用 SSH 协议（HTTPS 被代理阻断）。
