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

## 编码规范（门禁检查）

以下规则在编写和修改代码时必须遵守，违反会被门禁拦截。

### Python 后端

1. **异常链**：`except` 块中 `raise HTTPException(...)` 必须带 `from e`，保留原始异常上下文。
   ```python
   # ✗ 错误
   except ValueError:
       raise HTTPException(400, "msg")
   # ✓ 正确
   except ValueError as e:
       raise HTTPException(400, "msg") from e
   ```

2. **布尔列比较**：SQLAlchemy 布尔列禁止 `== True` / `== False`，使用 `.is_(True)` / `.is_(False)`。
   ```python
   # ✗ 触发 E712
   .where(User.is_active == True)
   # ✓ 正确
   .where(User.is_active.is_(True))
   ```

3. **None 比较**：SQLAlchemy 列禁止 `== None` / `!= None`，使用 `.is_(None)` / `.isnot(None)`。
   ```python
   # ✗ 触发 E711
   .where(Memory.indexed_at == None)
   # ✓ 正确
   .where(Memory.indexed_at.is_(None))
   ```

4. **函数体长度 ≤50 行**：超过则提取辅助函数，每个函数只做一件事。

5. **嵌套深度 ≤4 层**：`if/for/try/with` 每增加一层计为 +1。超过时通过提取函数、early return、guard clause 降低层级。

6. **函数参数 ≤10 个**：参数过多时用 Pydantic `BaseModel` 封装。FastAPI 端点可使用 `Depends()` 注入参数模型。
   ```python
   # ✗ 参数过多
   def list_memories(ns_id, authority, status, pending, type, tags, q, source, page, size, session, user): ...
   # ✓ 封装为 MemoryFilter + Depends()
   def list_memories(response, filters: MemoryFilter = Depends(), page, size, session, user): ...
   ```

7. **标识符遮蔽**：禁止局部变量/参数与外层或内置名称同名（如 `app`、`id`、`type`、`list`）。

8. **推导式/生成器保持简单**：推导式内只做简单映射或过滤。复杂查询 + 转换应拆为独立步骤。
   ```python
   # ✗ 推导式内嵌查询
   return {str(e.id) for e in session.exec(select(...).where(...)).all()}
   # ✓ 拆解
   events = session.exec(stmt).all()
   return {str(e.id) for e in events}
   ```

9. **字典格式化**：字典字面量冒号后只留 1 个空格，不做对齐空格。

10. **冗余导入**：模块顶部已 import 的符号，函数体内不要重复 import。

### TypeScript / React 前端

1. **禁止嵌套三元表达式**：多条件分支改用变量提取、`if/else`、或对象映射。
   ```tsx
   // ✗ 嵌套三元
   const params = a ? x : b ? y : z;
   // ✓ 提取公共部分 + 单层三元
   const base = { ...common };
   const params = condition ? { ...base, extra } : { ...base, other };
   ```
