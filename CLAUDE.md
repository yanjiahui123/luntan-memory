# Forum Memory Agent

## 设计原则

- **减少用户使用负担**：AI 应主动服务用户，而非需要手动触发。发帖后 AI 自动分析并回复，知识提取自动完成，用户只需关注内容本身。
- **软删除优先**：帖子和板块采用软删除（状态标记），保留数据完整性和可恢复性。
- **事件驱动**：通过 DomainEvent 表 + Dagster sensor 轮询实现异步编排，避免同步阻塞。

## 技术栈

- **后端**: FastAPI (同步) + SQLModel + PostgreSQL
- **前端**: React (Vite)
- **搜索**: Elasticsearch 8.9 (每板块独立索引，混合搜索 BM25+KNN+RRF)
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
