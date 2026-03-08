# Forum Memory Agent 项目审查报告

> **最后更新**: 2026-03-07（第三次全量重审，对照实际代码重新整理，清理已解决条目）

---

## 目录

- [一、系统架构概述](#一系统架构概述)
- [二、已完成的改进](#二已完成的改进)
- [三、当前存在的问题](#三当前存在的问题)
- [四、改进方案与优先级](#四改进方案与优先级)
- [附录：问题状态全表](#附录问题状态全表)

---

## 一、系统架构概述

### 1.1 核心数据流

```
用户发帖
  └─ create_thread() ──→ 后台线程池 ──→ generate_ai_answer()
                                           ├─ search_memories() [4 阶段搜索]
                                           ├─ query_rag()        [外部知识库, timeout=30s]
                                           └─ LLM 生成回答 → Comment(is_ai=True, cited_memory_ids)
                                                │
                                                └─ SSE 推送 → 前端 EventSource
                                                     └─ refetchComments()

用户结贴（人工 / AI / 超时）
  └─ resolve_thread()
       ├─ _update_resolved_citations()  ← 递增所有引用记忆的 resolved_citation_count
       ├─ refresh_quality() × N         ← 立即刷新受影响记忆的质量分
       └─ DomainEvent("thread.resolved") ──→ Dagster sensor
                                               └─ run_extraction()
                                                    ├─ SELECT ... FOR UPDATE NOWAIT  ← 防并发
                                                    ├─ 压缩讨论
                                                    ├─ Stage 1: Structure
                                                    ├─ Stage 2: Atomize
                                                    ├─ Stage 3: Gate (top_k=15)
                                                    └─ AUDN × N facts
                                                         ├─ ADD/UPDATE/DELETE/NONE
                                                         └─ 失败时 _rollback_partial_memories()

帖子删除
  ├─ 作者自删：记忆级联软删除 + ES 移除
  └─ 管理员删除：记忆标记 pending_human_confirm（等待人工审核）
```

### 1.2 关键设计约定

| 模块 | 机制 |
|------|------|
| AI 回答生成 | 后台 ThreadPoolExecutor（fire-and-forget，独立 session） |
| AI 回答就绪通知 | SSE EventSource `/threads/{id}/ai-answer/stream`，每次轮询独立 session，最长 120 秒 |
| 记忆提取 | Dagster sensor 轮询 DomainEvent 表（30s 间隔） |
| ES-DB 同步修复 | Dagster sensor 每 10 分钟扫描 `indexed_at IS NULL` |
| 帖子超时关闭 | Dagster sensor 每小时触发 `batch_timeout_threads()` |
| 记忆生命周期 | Dagster sensor 每日触发 ACTIVE→COLD→ARCHIVED 转换 |
| 质量分刷新 | Dagster sensor 每日触发 `bulk_refresh_quality()`，embed_batch + bulk_reindex |
| 搜索排序 | 70% 语义相关性（rerank 归一化）+ 30% quality_score 加权融合 |
| 查询改写 | 词数 > 4 时调用 LLM 改写，≤ 4 词直接搜索节省延迟 |
| LLM 超时 | `llm_timeout=60s`（OpenAI + Custom 均生效），RAG 独立 `rag_timeout=30s` |

### 1.3 质量分公式（当前版本，6 因子）

```
quality_score =
    30% × useful_ratio              (有用反馈 / 总反馈)
  + 20% × citation_resolution_rate  (resolved_citation_count / cite_count，帮助解决问题的比率)
  + 15% × source_weight             (admin=1.0 > commenter=poster=0.7 > ai=0.5)
  + 15% × freshness                 (1.0 - 创建天数/365, 最低 0)
  + 10% × retrieve_heat             (min(retrieve_count / 100, 1.0))
  - 10% × penalty                   ((wrong + outdated×0.5) / wrong_threshold)
```

> ⚠️ **注意**：与上一版报告相比，权重已调整：新增 `citation_resolution_rate`（20%），`useful_ratio` 从 35% 降至 30%，`penalty` 从 15% 降至 10%，`retrieve_heat` 从 15% 降至 10%。

### 1.4 权威度映射

| 结贴方式 | Authority | pending_human_confirm |
|----------|-----------|----------------------|
| 人工结贴 | LOCKED | False |
| AI 结贴 | NORMAL | False |
| 超时关闭 | NORMAL | True |
| 管理员删帖（记忆） | 保留原值 | True（强制标记待审） |

### 1.5 技术栈全景

| 层 | 技术选型 | 备注 |
|----|----------|------|
| 后端框架 | FastAPI (同步路由) | 无 async/await |
| ORM | SQLModel + PostgreSQL | psycopg2 同步驱动，pool_timeout=10s |
| 搜索引擎 | Elasticsearch 8.9 | 每板块独立索引，BM25+KNN+RRF |
| 任务编排 | Dagster (sensor 轮询) | 独立进程运行，6 个 sensor |
| 后台任务 | ThreadPoolExecutor (4 workers) | 仅 AI 回答生成 |
| LLM | OpenAI / Custom HTTP | 同步调用，timeout=60s |
| 前端框架 | React 18 + Vite | 纯 JS（无 TypeScript） |
| 路由 | react-router-dom v6 | |
| 样式 | 纯 CSS (设计令牌) | 无 Tailwind / CSS-in-JS |
| 状态管理 | React Context + useState | 无 Redux/Zustand |
| Markdown | react-markdown + remark-gfm | |

### 1.6 Dagster Sensor 全列表

| Sensor | 触发频率 | 功能 |
|--------|---------|------|
| `thread_resolved_sensor` | 事件驱动（30s 轮询） | 提取记忆 |
| `thread_timeout_sensor` | 每 1 小时 | 超时关闭帖子 |
| `memory_lifecycle_sensor` | 每日 | ACTIVE→COLD→ARCHIVED |
| `quality_refresh_sensor` | 每日 | 批量刷新质量分 |
| `es_sync_repair_sensor` | 每 10 分钟 | 修复 ES-DB 不一致 |
| `comment_count_reconcile_sensor` | 每日 | 修复 comment_count 漂移 |

---

## 二、已完成的改进

| # | 问题 | 解决方案 | 关键文件 |
|---|------|---------|---------|
| 1 | AI 回答同步阻塞 HTTP 请求 | 后台 ThreadPoolExecutor，HTTP 立即返回 | `thread_service.py` |
| 2 | 提取幂等性：FAILED 不重试 | `_already_extracted()` 只检查 COMPLETED，`_cleanup_failed_record()` 删除 FAILED 记录 | `extraction_service.py` |
| 3 | 提取质量低 | 三阶段流水线：Structure → Atomize → Gate | `extraction_service.py`, `core/extraction.py` |
| 4 | ES-DB 不一致被动修复 | `indexed_at` 追踪 + `es_sync_repair_sensor`（10 分钟）主动补索引 | `memory_service.py`, `dagster/sensors.py` |
| 5 | 质量刷新全量加载内存 | `bulk_refresh_quality()` 分批处理（batch=200） | `memory_service.py` |
| 6 | LLM 分级设计（dead config） | 彻底删除 `llm_small_model` 配置与 `model` 参数 | `config.py`, `providers/*.py` |
| 7 | thread_created_sensor 死代码 | 删除 `ai_answer_job` + `thread_created_sensor` | `dagster/` |
| 8 | bulk 刷新 N 次独立 embedding API 调用 | `embed_batch()` 批量嵌入 + `bulk_reindex()` 分 namespace 批量写 ES | `memory_service.py` |
| 9 | 搜索排序未融合质量分 | `_simple_rank()` 归一化 rerank 分 + 加权融合：`0.7×语义 + 0.3×质量` | `search_service.py` |
| 10 | 查询改写无条件触发 LLM | 词数 ≤ 4 跳过改写直接返回 | `search_service.py` |
| 11 | 前端 AI 回答依赖渐进退避轮询 | 后端新增 SSE 端点；前端替换为 `EventSource` | `api/threads.py`, `ThreadDetail.jsx` |
| 12 | LLM / HTTP 调用无 timeout | OpenAI: `timeout=llm_timeout`；Custom: `requests.post(timeout=self.timeout)` | `providers/*.py`, `config.py` |
| 13 | SSE 长连接持有 session | session 移入循环内，每次查询创建独立短命 session | `api/threads.py` |
| 14 | 提取部分失败无回滚 | `_rollback_partial_memories()` 软删除本次已创建记忆并从 ES 清理 | `extraction_service.py` |
| 15 | re_extract 竞态条件 | `SELECT ... FOR UPDATE NOWAIT` 行锁 + 异常日志 | `extraction_service.py` |
| 16 | dictionary 大小写替换不一致 | `re.sub(re.escape(slang), canonical, result, flags=re.IGNORECASE)` | `search_service.py` |
| 17 | bulk_reindex 部分成功不标记 | `bulk_reindex()` 返回 `failed_ids`，逐条标记成功的 `indexed_at` | `memory_service.py` |
| 18 | AUDN top_k=5 过小 | `_process_one_fact()` 传 `top_k=15` | `extraction_service.py`, `search_service.py` |
| 19 | comment_count 手动维护漂移 | `reconcile_comment_counts()` + Dagster 每日校验 sensor | `thread_service.py`, `dagster/sensors.py` |
| 20 | namespace=None 导致 index_name=None | `bulk_refresh_quality()` 跳过 None index_name，记录 warning | `memory_service.py` |
| 21 | Settings 缺少配置校验 | `@model_validator` 校验 provider/API key/天数顺序/维度边界 | `config.py` |
| 22 | useAsync 竞态条件 | `callIdRef` 序列号机制，丢弃过期响应 | `hooks/useAsync.js` |
| 23 | 无 Error Boundary | `ErrorBoundary` 组件包裹 `Routes` | `App.jsx`, `components/ErrorBoundary.jsx` |
| 24 | 表单双击提交 | `submitting` 标志 + `disabled={submitting}` 按钮防护 | `pages/NewThread.jsx` |
| 25 | 搜索高亮未转义正则 | 改用 `indexOf()` 字符串切割，完全避免正则 | `pages/MemoryList.jsx` |
| 26 | 知识质量自动反馈闭环 | 新增 `resolved_citation_count` 字段；结贴时递增引用记忆计数并立即刷新质量分 | `models/memory.py`, `thread_service.py`, `core/quality.py` |
| 27 | 帖子删除权限不完整 | 作者可自删（记忆级联软删除）；管理员删除时记忆标记 `pending_human_confirm` | `api/threads.py`, `thread_service.py` |
| 28 | 质量告警无自动触发 | `wrong_count >= wrong_threshold` 时自动设置 `pending_human_confirm=True` 并记录 warning | `memory_service.py` |

---

## 三、当前存在的问题

> 本节仅列出**尚未解决**的问题。已解决条目见第二节和附录。

### 3.1 前端 — 关键问题

#### 3.1.1 SSE EventSource 依赖数组包含 `comment_count`

**文件**: `pages/ThreadDetail.jsx`

```javascript
useEffect(() => {
    // 当 comment_count > 0 时会早期返回（不启动 SSE）
    if (thread?.status !== 'OPEN' || (thread?.comment_count ?? 0) > 0) return;
    const es = new EventSource(`/api/v1/threads/${thread_id}/ai-answer/stream`);
    // ...
    return () => { es.close(); };
}, [thread?.id, thread?.comment_count]);  // ← comment_count 不应在依赖数组
```

`comment_count` 变化（如 AI 回答到来后 refetch 触发）会导致 effect 重新执行，关闭旧连接后立即创建新连接，虽然 early-return 会快速退出，但产生了不必要的副作用。

**修复**: 仅保留 `thread?.id` 作为依赖，移除 `thread?.comment_count`。

---

### 3.2 前端 — 中等优先级

#### 3.2.1 `UserContext` 链式请求容错不足

**文件**: `contexts/UserContext.jsx`

```javascript
try {
    const u = await userApi.me();
    setCurrentUser(u);
    if (u?.role === 'super_admin' || u?.role === 'board_admin') {
        const ns = await userApi.myNamespaces();  // 若此处失败
        setMyNamespaces(ns);
    }
} catch {
    setCurrentUser(null);   // ← 用户信息也被清空
    setMyNamespaces(null);
}
```

`myNamespaces()` 失败会导致已成功获取的 `currentUser` 也被清空，用户丢失登录状态。

**修复**: 拆分两个 try-catch，`me()` 成功后分别处理 `myNamespaces()` 的失败。

---

#### 3.2.2 MemoryList `clearAll()` 丢失 boardId 上下文

**文件**: `pages/MemoryList.jsx`

```javascript
const EMPTY_FILTERS = { namespace_id: '', ... };

function clearAll() {
    setFilters(EMPTY_FILTERS);  // namespace_id 被清空
}
```

在板块管理页点击"清除筛选"后，`namespace_id` 被重置为空字符串，列表切换为全局视图。

**修复**: `setFilters({ ...EMPTY_FILTERS, namespace_id: boardId || '' })`

---

### 3.4 长期规划（低优先级）

| 编号 | 问题 | 建议方案 |
|------|------|---------|
| L1 | X-Employee-Id 认证无签名验证 | ✅ 已实现 JWT 认证（pyjwt，`POST /auth/login`，Bearer token + X-Employee-Id 双模式） |
| L2 | COLD 记忆恢复有最长 10 分钟不可搜索窗口 | ✅ 已实现 `restore_memory()` + `PUT /memories/{id}/restore`，恢复时立即调用 `_index_to_es()` |
| L3 | `bulk_refresh_quality` commit 后 N+1 惰性加载 | ✅ 已修复（预查询所有 namespace_id→es_index_name 映射，单次 SQL 替代 N 次 `session.get`） |
| L4 | Dagster sensor 无 cursor 管理 | ✅ 已实现（事件驱动 sensor 用 JSON cursor 记录已分发事件 ID；定时 sensor 用 ISO 时间戳 cursor） |
| L5 | 无响应式设计 | ✅ 已实现（`@media` 断点 767px/1024px，可折叠 sidebar + hamburger 菜单，grid 自适应） |
| L6 | 前端无 TypeScript | ✅ 已实现（全量迁移至 TypeScript：tsconfig.json、types/index.ts、client.ts、useAsync.ts、所有组件和页面 .tsx，严格模式通过 `tsc --noEmit`） |
| L7 | AUDN 仅 KNN 召回 | ✅ 已实现（KNN ∪ 同 tags ∪ 同 knowledge_type 多维度召回 + 去重） |
| L8 | Custom Provider `verify=False` | 改为可配置环境变量 `FM_CUSTOM_VERIFY_CERTS` |

---

## 四、改进方案与优先级

### 中优先级（改善体验）

| 编号 | 问题 | 方案 | 工作量 |
|------|------|------|--------|
| **3.1.1** | SSE 依赖数组多余 | 移除 `comment_count` 依赖，仅保留 `thread?.id` | 极小 |
| **3.2.1** | UserContext 容错 | 拆分两个 try-catch，`me()` 成功后独立处理 `myNamespaces()` | 极小 |
| **3.2.2** | clearAll 丢 boardId | `setFilters({...EMPTY_FILTERS, namespace_id: boardId || ''})` | 极小 |

### 低优先级（长期规划）

见 3.4 节。

---

## 附录：问题状态全表

| 编号 | 问题描述 | 状态 |
|------|---------|------|
| AI 回答同步阻塞 HTTP | ThreadPoolExecutor 后台处理 | ✅ 已解决 |
| LLM small_model 设计 | 彻底删除 | ✅ 已移除 |
| 提取幂等性（FAILED 不重试） | `_cleanup_failed_record` | ✅ 已解决 |
| ES-DB 不一致（被动修复） | `es_sync_repair_sensor` 主动修复 | ✅ 已解决 |
| 质量刷新全量加载 | `batch=200` 分批 | ✅ 已解决 |
| thread_created_sensor 死代码 | 已删除 | ✅ 已移除 |
| bulk 刷新 N 次 embedding | `embed_batch` + `bulk_reindex` | ✅ 已优化 |
| 搜索排序未融合质量分 | `0.7×语义 + 0.3×质量` | ✅ 已实现 |
| 查询改写无条件触发 | ≤ 4 词跳过 LLM | ✅ 已优化 |
| AI 回答前端轮询 | SSE EventSource | ✅ 已替换 |
| LLM 调用无 timeout | `llm_timeout=60s` OpenAI+Custom | ✅ 已修复 |
| SSE 长连接持有 session | session 移入循环内 | ✅ 已修复 |
| 提取部分失败无回滚 | `_rollback_partial_memories` | ✅ 已修复 |
| re_extract 竞态条件 | `SELECT FOR UPDATE NOWAIT` | ✅ 已修复 |
| dictionary 替换大小写不一致 | `re.sub` + `re.IGNORECASE` | ✅ 已修复 |
| bulk_reindex 部分成功不标记 | `failed_ids` 逐条标记 `indexed_at` | ✅ 已修复 |
| AUDN top_k=5 过小 | `top_k=15` | ✅ 已修复 |
| comment_count 手动维护漂移 | `reconcile_comment_counts` + 每日 sensor | ✅ 已修复 |
| namespace=None 导致 index_name=None | 跳过 None index_name | ✅ 已修复 |
| Settings 缺少配置校验 | `@model_validator` 全面校验 | ✅ 已修复 |
| useAsync 竞态条件 | `callIdRef` 序列号丢弃过期响应 | ✅ 已修复 |
| 无 Error Boundary | `ErrorBoundary` 包裹 Routes | ✅ 已修复 |
| 表单双击提交 | `submitting` + `disabled` | ✅ 已修复 |
| 搜索高亮未转义正则 | `indexOf` 替代正则 | ✅ 已修复 |
| 知识质量自动反馈闭环 | `resolved_citation_count` + 结贴时刷新 | ✅ 已实现 |
| 帖子删除权限不完整 | 作者级联删除/管理员标记待审 | ✅ 已实现 |
| 质量告警无自动触发 | `wrong_count >= threshold` 自动标记 | ✅ 已实现 |
| **3.1.1** | 无 API 限流 | ✅ 已修复（slowapi，POST /threads 10/min，search 20/min，extract 5/min） |
| **3.2.1** | SSE 依赖数组含 comment_count | ✅ 已修复（移除 comment_count 依赖，仅保留 thread?.id） |
| **3.2.2** | API Client 无 timeout / 重试 | ✅ 已修复（AbortSignal.timeout：API 30s，上传 60~300s） |
| **3.2.3** | Promise rejection 静默吞掉 | ✅ 已修复（ThreadDetail×2, MemoryList, MemoryDetail 均改为 console.warn） |
| **3.3.1** | UserContext 链式请求容错不足 | ✅ 已修复（myNamespaces 独立 try-catch，me() 成功不受影响） |
| **3.3.2** | clearAll 丢失 boardId | ✅ 已修复（clearAll 保留 boardId || ''） |
| **L1** | X-Employee-Id 认证简单 | ✅ 已实现（JWT + X-Employee-Id 双模式） |
| **L2** | COLD 恢复不可搜索窗口 | ✅ 已修复（`restore_memory` 立即 ES 索引） |
| **L3** | bulk_refresh commit 后 N+1 | ✅ 已修复（预查询 namespace 映射） |
| **L4** | sensor 无 cursor 管理 | ✅ 已实现（JSON cursor + ISO 时间戳） |
| **L5** | 无响应式设计 | ✅ 已实现（响应式断点 + 可折叠 sidebar） |
| **L6** | 前端 TypeScript 迁移 | ✅ 已完成 |
| **L7** | AUDN 多维度召回 | ✅ 已实现（KNN ∪ tags ∪ knowledge_type） |
| **L8** | Custom Provider verify=False | ⚪ 长期 |
