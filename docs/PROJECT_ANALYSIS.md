# Forum Memory Agent 项目审查报告

> **最后更新**: 2026-03-07（第二次全量重审，覆盖前后端完整代码审查）

---

## 目录

- [一、系统架构概述](#一系统架构概述)
- [二、已完成的改进](#二已完成的改进)
- [三、当前存在的问题](#三当前存在的问题)
- [四、改进方案与优先级](#四改进方案与优先级)

---

## 一、系统架构概述

### 1.1 核心数据流

```
用户发帖
  └─ create_thread() ──→ 后台线程池 ──→ generate_ai_answer()
                                           ├─ search_memories() [4 阶段搜索]
                                           ├─ query_rag()        [外部知识库]
                                           └─ LLM 生成回答 → Comment(is_ai=True)
                                                │
                                                └─ SSE 推送 → 前端 EventSource
                                                     └─ refetchComments()

用户结贴
  └─ resolve_thread() ──→ DomainEvent("thread.resolved") ──→ Dagster sensor
                                                               └─ run_extraction()
                                                                    ├─ 压缩讨论
                                                                    ├─ Stage 1: Structure
                                                                    ├─ Stage 2: Atomize
                                                                    ├─ Stage 3: Gate
                                                                    └─ AUDN × N facts
                                                                         └─ ADD/UPDATE/DELETE/NONE
```

### 1.2 关键设计约定

| 模块 | 机制 |
|------|------|
| AI 回答生成 | 后台 ThreadPoolExecutor（fire-and-forget，独立 session） |
| AI 回答就绪通知 | SSE EventSource `/threads/{id}/ai-answer/stream`，轮询 DB 推送，最长 120 秒 |
| 记忆提取 | Dagster sensor 轮询 DomainEvent 表（30s 间隔） |
| ES-DB 同步修复 | Dagster sensor 每 10 分钟扫描 `indexed_at IS NULL` |
| 帖子超时关闭 | Dagster sensor 每小时触发 `batch_timeout_threads()` |
| 记忆生命周期 | Dagster sensor 每日触发 ACTIVE→COLD→ARCHIVED 转换 |
| 质量分刷新 | Dagster sensor 每日触发 `bulk_refresh_quality()`，embed_batch + bulk_reindex |
| 搜索排序 | 70% 语义相关性（rerank 归一化）+ 30% quality_score 加权融合 |
| 查询改写 | 词数 > 4 时调用 LLM 改写，≤ 4 词直接搜索节省延迟 |

### 1.3 质量分公式

```
quality_score =
    35% × useful_ratio          (有用反馈 / 总反馈)
  + 20% × source_weight         (admin=1.0 > commenter=poster=0.7 > ai=0.5)
  + 15% × retrieve_heat         (min(retrieve_count / 100, 1.0))
  + 15% × freshness             (1.0 - 创建天数/365, 最低 0)
  - 15% × penalty               ((wrong + outdated×0.5) / wrong_threshold)
```

### 1.4 权威度映射

| 结贴方式 | Authority | pending_human_confirm |
|----------|-----------|----------------------|
| 人工结贴 | LOCKED | False |
| AI 结贴 | NORMAL | False |
| 超时关闭 | NORMAL | True |

### 1.5 技术栈全景

| 层 | 技术选型 | 备注 |
|----|----------|------|
| 后端框架 | FastAPI (同步路由) | 无 async/await |
| ORM | SQLModel + PostgreSQL | psycopg2 同步驱动 |
| 搜索引擎 | Elasticsearch 8.9 | 每板块独立索引，BM25+KNN+RRF |
| 任务编排 | Dagster (sensor 轮询) | 独立进程运行 |
| 后台任务 | ThreadPoolExecutor (4 workers) | 仅 AI 回答生成 |
| LLM | OpenAI / Custom HTTP | 同步调用，无 timeout |
| 前端框架 | React 18 + Vite | 纯 JS（无 TypeScript） |
| 路由 | react-router-dom v6 | |
| 样式 | 纯 CSS (设计令牌) | 无 Tailwind / CSS-in-JS |
| 状态管理 | React Context + useState | 无 Redux/Zustand |
| Markdown | react-markdown + remark-gfm | |

---

## 二、已完成的改进

| # | 问题 | 解决方案 | 关键文件 |
|---|------|---------|---------|
| 1 | AI 回答同步阻塞 HTTP 请求 | 后台 ThreadPoolExecutor，HTTP 立即返回 | `thread_service.py:95-115` |
| 2 | 提取幂等性：FAILED 不重试 | `_already_extracted()` 只检查 COMPLETED，新增 `_cleanup_failed_record()` | `extraction_service.py:82-99` |
| 3 | 提取质量低 | 三阶段流水线：Structure → Atomize → Gate | `extraction_service.py`, `core/extraction.py` |
| 4 | ES-DB 不一致被动修复 | `indexed_at` 追踪 + `es_sync_repair_sensor`（10 分钟）主动补索引 | `memory_service.py:446-478`, `dagster/sensors.py` |
| 5 | 质量刷新全量加载内存 | `bulk_refresh_quality()` 分批处理（batch=200） | `memory_service.py:302-348` |
| 6 | LLM 分级设计（dead config） | 彻底删除 `llm_small_model` 配置与 `model` 参数 | `config.py`, `providers/*.py` |
| 7 | thread_created_sensor 死代码 | 删除 `ai_answer_job` + `thread_created_sensor`，仅保留线程池驱动路径 | `dagster/assets.py`, `dagster/sensors.py`, `dagster/definitions.py` |
| 8 | bulk 刷新 N 次独立 embedding API 调用 | `embed_batch()` 批量嵌入 + `bulk_reindex()` 分 namespace 批量写 ES | `memory_service.py:bulk_refresh_quality` |
| 9 | 搜索排序未融合质量分 | `_simple_rank()` 归一化 rerank 分 + 加权融合：`0.7×语义 + 0.3×质量` | `search_service.py:156-177` |
| 10 | 查询改写无条件触发 LLM | 词数 ≤ 4 跳过改写直接返回，避免无效 LLM 延迟 | `search_service.py:_preprocess_query` |
| 11 | 前端 AI 回答依赖渐进退避轮询 | 后端新增 SSE 端点；前端替换为 `EventSource`，精确推送，最长 120s | `api/threads.py`, `ThreadDetail.jsx` |

---

## 三、当前存在的问题

### 3.1 后端 — 可靠性与健壮性

#### 3.1.1 LLM / HTTP 调用无 timeout

**文件**: `providers/openai_provider.py`, `providers/custom_provider.py`

所有 LLM 调用（complete / embed / embed_batch / rerank）均无超时配置。OpenAI SDK 和 `requests.post` 都可能无限期阻塞。CustomProvider 还使用 `verify=False` 关闭 SSL 验证。

```python
# openai_provider.py — 无 timeout
resp = self.client.chat.completions.create(model=..., messages=..., temperature=0.2)

# custom_provider.py — 无 timeout + verify=False
resp = requests.post(self.llm_url, headers=..., json=..., verify=False)
```

**影响**: 后台线程池（仅 4 worker）可能因一次 LLM 调用挂起而耗尽，导致后续 AI 回答和提取全部排队。

---

#### 3.1.2 SSE 端点持有长连接 session

**文件**: `api/threads.py:109-121`

```python
def _generate():
    with Session(engine) as session:         # session 最长持有 120 秒
        for _ in range(60):
            stmt = select(Comment).where(...)
            if session.exec(stmt).first():
                yield f"data: ..."
                return
            time.sleep(2)                    # 阻塞线程 2 秒
            yield ": heartbeat\n\n"
    yield f"data: ..."
```

一个 SSE 连接持有一个数据库 session 长达 120 秒。若客户端中途断开，`time.sleep(2)` 仍会继续执行直到下一次 yield 发现连接已关闭。高并发场景下可能耗尽连接池。

---

#### 3.1.3 提取流水线部分失败无回滚

**文件**: `extraction_service.py:69-79`

若 `_execute_pipeline()` 在处理第 3/5 个 fact 时失败，前 2 个 fact 的记忆已经 `apply_audn()` 写入 DB 和 ES。`ExtractionRecord` 被标记为 FAILED，但已创建的记忆没有回滚。下次重试时 `_cleanup_failed_record()` 只删除 FAILED 记录，不清理已创建的记忆。

**影响**: 同一 thread 重试提取后可能产生重复记忆。

---

#### 3.1.4 `delete_comment` 触发的 `re_extract` 存在竞态

**文件**: `api/threads.py:178-186`

```python
try:
    extraction_service.re_extract(session, thread_id)
except Exception:
    pass  # Non-fatal: extraction failure shouldn't block comment deletion
```

`re_extract()` 先软删除旧记忆再重新提取，但没有对 thread 加行锁。若两个管理员几乎同时删除同一 thread 的不同评论，两个 `re_extract()` 可能并发运行，产生重复记忆。此外异常被静默吞掉，无任何日志。

---

#### 3.1.5 `_apply_dictionary` 大小写不一致 + 无循环保护

**文件**: `search_service.py:106-111`

```python
def _apply_dictionary(query: str, dictionary: dict) -> str:
    result = query
    for slang, canonical in dictionary.items():
        if slang.lower() in result.lower():   # 大小写不敏感匹配
            result = result.replace(slang, canonical)  # 大小写敏感替换
    return result
```

匹配用 `.lower()` 但替换用原始大小写，若原文大小写与词典 key 不同则替换不生效。此外若词典出现 `"a" → "the a"` 之类循环定义，虽然当前单次遍历不会无限循环，但替换结果不符合预期。

---

#### 3.1.6 `bulk_refresh_quality` commit 后访问脏对象

**文件**: `memory_service.py:302-396`

批量刷新中，先修改 `memory.quality_score` 后 `session.commit()`，接着用同一批对象调用 `provider.embed_batch([m.content for m in changed])` 和 `session.get(Namespace, m.namespace_id)`。SQLModel/SQLAlchemy 在 commit 后对象进入 expired 状态，访问属性会触发惰性加载。虽然功能上不会报错，但在 commit 后批量访问过期对象可能导致 N+1 查询。

---

#### 3.1.7 `bulk_reindex` 部分成功时所有 `indexed_at` 均不更新

**文件**: `memory_service.py:363-390`

```python
ok = es_service.bulk_reindex(docs, index_name=index_name)
if ok == len(docs):
    for m, _ in pairs:
        m.indexed_at = now
else:
    logger.warning("Partial bulk reindex (%d/%d)...", ok, len(docs), index_name)
```

若 100 条中成功 95 条，所有 100 条的 `indexed_at` 仍为 NULL，repair sensor 下次会重新发送全部 100 条。由于 ES 使用 upsert 语义不会产生数据问题，但浪费资源。

---

#### 3.1.8 Dagster sensor 无 cursor 管理

**文件**: `dagster/sensors.py`

`thread_resolved_sensor` 通过 `DomainEvent.processed == False` 查询未处理事件，每次最多 20 条。事件处理在对应 job/op 中标记 `processed = True`。若 Dagster 在 yield RunRequest 后但 job 执行前崩溃，事件不会被标记，下次重新处理。虽然有幂等性保护，但造成无效重试。

---

### 3.2 后端 — 搜索质量

#### 3.2.1 AUDN 相似度搜索 top_k 固定为 5

**文件**: `search_service.py:34`

提取流水线中 `_process_one_fact()` 调用 `find_similar()` 使用默认 `top_k=5`。当知识库积累到数千条记忆后，仅检索 5 条候选可能遗漏高度重叠的已有记忆，导致 AUDN 误判为 ADD，产生重复。

---

### 3.3 后端 — 数据一致性

#### 3.3.1 comment_count 手动维护，存在漂移风险

**文件**: `thread_service.py`

`Thread.comment_count` 通过代码中的 `+= 1` / `-= 1` 手动维护。若事务 commit 前失败或存在不经过 `thread_service` 的写入路径，计数器会漂移。

---

#### 3.3.2 COLD 记忆从 ES 删除但恢复路径缺少补索引

**文件**: `memory_service.py:262-276`

记忆转 COLD 后从 ES 删除。`es_sync_repair_sensor` 仅修复 `status == ACTIVE` 且 `indexed_at IS NULL` 的记忆。若 COLD 记忆被恢复为 ACTIVE，其 `indexed_at` 为 NULL，需要 repair sensor 补索引——这一路径可行，但中间有最长 10 分钟的不可搜索窗口。

---

#### 3.3.3 `bulk_refresh_quality` 中 namespace 为 None 时 index_name 为 None

**文件**: `memory_service.py:358-361`

```python
ns_cache[m.namespace_id] = ns.es_index_name if ns else None
by_index.setdefault(ns_cache[m.namespace_id], []).append((m, emb))
```

若 namespace 已被软删除，`ns` 为 None，导致 `by_index[None]` 存在条目。后续 `es_service.bulk_reindex(docs, index_name=None)` 会使用 fallback 全局索引或报错。

---

### 3.4 后端 — 安全与运维

#### 3.4.1 无 API 限流

所有 API 端点无速率限制。涉及 LLM 的高成本端点：

| 端点 | LLM 调用数 |
|------|-----------|
| `POST /threads`（触发 AI 回答） | ~2-4 次（搜索改写 + 生成） |
| `POST /memories/search` | ~2 次（改写 + rerank） |
| `POST /memories/extract/{thread_id}` | ~10-20 次（三阶段 + N×AUDN） |

---

#### 3.4.2 X-Employee-Id 认证无验证

**文件**: `api/deps.py`

```python
def get_current_user(x_employee_id: str | None = Header(None)) -> User:
    # 直接用 header 值查 DB，无签名/token 验证
```

任何知道员工 ID 的人都可以伪造身份。内部网络环境下风险有限，但公网暴露时存在越权风险。

---

#### 3.4.3 Settings 缺少配置校验

**文件**: `config.py`

- `llm_api_key` 允许空字符串，运行时才报错
- 无 URL 格式校验
- `cold_inactive_days` / `archive_inactive_days` 未校验大小关系
- `embedding_dimension` 无边界检查

---

### 3.5 前端 — 关键问题

#### 3.5.1 `useAsync` Hook 存在竞态条件

**文件**: `hooks/useAsync.js`

```javascript
const execute = useCallback(async () => {
    setLoading(true);
    try {
        const result = await asyncFn();
        setData(result);  // 无 stale 检测
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
}, deps);
```

若 deps 变化触发新请求时旧请求仍在进行中，先发后至时旧数据覆盖新数据。影响所有使用 `useAsync` 的页面（MemoryList、ThreadList、ThreadDetail 等），可能导致切换板块后显示上一个板块的数据。

---

#### 3.5.2 SSE EventSource 依赖数组包含 `comment_count`

**文件**: `pages/ThreadDetail.jsx`

```javascript
useEffect(() => {
    // ... EventSource 创建 ...
    return () => { es.close(); };
}, [thread?.id, thread?.comment_count]);
```

`comment_count` 在 `refetchComments()` 后变化，会导致 effect 重新执行、旧 EventSource 关闭后立即创建新连接。虽然有 cleanup 函数，但在 AI 回答到来后仍可能建立不必要的新连接。

---

#### 3.5.3 无全局 Error Boundary

**文件**: `App.jsx`

任何组件内未捕获的异常会导致整个应用白屏崩溃。缺少 React Error Boundary 提供降级 UI。

---

#### 3.5.4 API Client 无 timeout / 重试

**文件**: `api/client.js`

```javascript
async function request(url, options = {}) {
    const res = await fetch(`${BASE}${url}`, { ... });
    // 无 timeout，无 retry，无请求去重
}
```

网络异常时 `fetch` 可能无限等待。5xx / 429 错误无自动重试。无请求去重（快速切换筛选条件时可能并发多个重复请求）。

---

#### 3.5.5 多处 Promise rejection 被静默吞掉

**文件**: `ThreadDetail.jsx`, `MemoryList.jsx` 等

```javascript
memoryApi.batchGet(comment.cited_memory_ids)
    .then(setCitedMemories)
    .catch(() => {});   // 静默丢弃错误
```

用户不知道数据加载失败，显示为空白而非错误提示。

---

#### 3.5.6 表单双击提交未防护

**文件**: `pages/NewThread.jsx`

`handleSubmit` 设置 `setSubmitting(true)` 前存在竞态窗口。React 批处理更新在 `await` 之前不一定生效，快速双击可能触发两次 `threadApi.create()`。

---

#### 3.5.7 无响应式设计

**文件**: `index.css`

- `.sidebar` 固定 220px 宽度，无折叠能力
- `.main-content` 使用 `margin-left: var(--sidebar-w)` 固定偏移
- `.stat-grid` 固定 4 列，平板/手机端溢出
- 无 `@media` 断点适配

---

### 3.6 前端 — 中等优先级

#### 3.6.1 `UserContext` 链式请求容错不足

**文件**: `contexts/UserContext.jsx`

```javascript
const u = await userApi.me();
setCurrentUser(u);
if (u?.role === 'super_admin' || u?.role === 'board_admin') {
    const ns = await userApi.myNamespaces();  // 若此处失败
    setMyNamespaces(ns);
}
```

若 `myNamespaces()` 失败，整个 catch 块清空 `currentUser` 和 `myNamespaces`。应分开处理：用户信息获取成功后不应因为二级请求失败而丢失。

---

#### 3.6.2 MemoryList 筛选器 `clearAll()` 丢失 boardId 上下文

**文件**: `pages/MemoryList.jsx`

```javascript
function clearAll() {
    setFilters(EMPTY_FILTERS);  // boardId 被清空
}
```

在板块管理页点击"清除筛选"后，namespace_id 被清空，列表显示全局数据而非当前板块。

---

#### 3.6.3 搜索高亮未转义正则特殊字符

**文件**: `pages/MemoryList.jsx`

搜索关键词直接作为正则匹配高亮，若关键词包含 `(`, `)`, `[`, `.` 等正则特殊字符会报错或高亮异常。

---

## 四、改进方案与优先级

### 高优先级（影响可靠性，应尽快修复）

| 编号 | 问题 | 方案 | 工作量 |
|------|------|------|--------|
| **3.1.1** | LLM 调用无 timeout | OpenAI: `client = OpenAI(timeout=30)`；Custom: `requests.post(timeout=30)` | 极小 |
| **3.1.2** | SSE 长连接 session | 每次循环创建短命 session 或用连接池；增加客户端断连检测 | 小 |
| **3.1.3** | 提取部分失败无回滚 | 在 `_execute_pipeline` 失败时清理本次已创建的记忆（按 `ExtractionRecord.id` 关联） | 小 |
| **3.5.1** | useAsync 竞态 | 添加 AbortController 或 stale flag，确保旧请求不覆盖新数据 | 小 |
| **3.5.3** | 无 Error Boundary | 在 `App.jsx` 顶层添加 Error Boundary 组件 | 极小 |
| **3.4.3** | Settings 校验 | 添加 Pydantic `@field_validator` 校验 API key、URL 格式、天数关系 | 小 |

### 中优先级（改善质量与体验）

| 编号 | 问题 | 方案 | 工作量 |
|------|------|------|--------|
| **3.4.1** | 无 API 限流 | `slowapi` 中间件或 Nginx 限流，对 LLM 端点 ≤ 10 req/min | 小 |
| **3.2.1** | AUDN top_k=5 | `_process_one_fact()` 传 `top_k=10-15` | 极小 |
| **3.1.4** | re_extract 竞态 | `SELECT ... FOR UPDATE` 锁定 thread 行；re_extract 异常记录日志 | 小 |
| **3.1.5** | dictionary 替换不一致 | 改用 `re.sub(re.escape(slang), canonical, result, flags=re.IGNORECASE)` | 极小 |
| **3.1.7** | bulk_reindex 部分成功 | 逐条标记已成功的 `indexed_at`（ES bulk response 返回逐条状态） | 小 |
| **3.3.1** | comment_count 漂移 | 增加定期校验 job 或改用 COUNT 子查询 | 小 |
| **3.3.3** | namespace=None 导致 index_name=None | `if index_name is None: continue` 跳过 | 极小 |
| **3.5.2** | SSE 依赖数组多余 | 移除 `comment_count` 依赖，仅保留 `thread?.id` | 极小 |
| **3.5.4** | API Client 无 timeout | 使用 `AbortSignal.timeout(30_000)` 或封装带 timeout 的 fetch | 小 |
| **3.5.5** | Promise 静默吞错 | `.catch(() => {})` 改为显示错误提示或 fallback UI | 小 |
| **3.5.6** | 双击提交 | 提交按钮增加 `disabled={submitting}` 并在 onClick 前检查 ref flag | 极小 |
| **3.6.1** | UserContext 容错 | 拆分两个 try-catch：me() 失败清空全部，myNamespaces() 失败仅清空 ns | 极小 |
| **3.6.2** | clearAll 丢 boardId | `setFilters({...EMPTY_FILTERS, namespace_id: boardId})` | 极小 |

### 低优先级（长期规划）

| 编号 | 问题 | 方案 | 工作量 |
|------|------|------|--------|
| **3.4.2** | 认证简单 | 接入 OAuth2 / JWT / SSO | 大 |
| **3.3.2** | COLD 恢复不可搜索窗口 | 恢复时主动调用 `_index_to_es()` | 小 |
| **3.1.6** | bulk_refresh N+1 | commit 后 `session.expire_all()` + 批量重新加载 | 小 |
| **3.1.8** | sensor 无 cursor | 使用 Dagster cursor 机制记录已处理事件 ID | 中 |
| **3.5.7** | 无响应式设计 | 添加 `@media` 断点、可折叠 sidebar、grid 自适应 | 中 |
| — | 前端 TypeScript 迁移 | .jsx → .tsx，添加类型定义 | 大 |
| — | AUDN 多维度召回 | KNN top-10 ∪ 相同 tags ∪ 相同 knowledge_type | 中 |
| — | 搜索引入专用 Reranker | 替代 embedding cosine similarity | 中 |
| — | Custom Provider 移除 verify=False | 改为可配置 `FM_CUSTOM_VERIFY_CERTS` | 极小 |

---

## 附录：问题状态全表

| 编号 | 问题描述 | 状态 |
|------|---------|------|
| 1.1 | AI 回答同步阻塞 HTTP | ✅ 已解决 |
| 1.2 | LLM small_model 设计 | ✅ 已移除 |
| 1.3 | 提取幂等性（FAILED 不重试） | ✅ 已解决 |
| 2.1 | ES-DB 不一致（被动修复） | ✅ 已解决（主动 sensor） |
| 2.2 | 质量刷新全量加载 | ✅ 已解决（batch=200） |
| 3.1.1（新）| thread_created_sensor 死代码 | ✅ 已移除 |
| 3.1.2（旧）| bulk 刷新 N 次 embedding | ✅ 已优化（embed_batch + bulk_reindex） |
| 3.2.1（旧）| 排序未融合质量分 | ✅ 已实现（0.7×语义 + 0.3×质量） |
| 3.2.2（旧）| 查询改写无条件触发 | ✅ 已优化（≤ 4 词跳过 LLM） |
| 3.5.1（旧）| AI 回答前端轮询 | ✅ 已替换为 SSE EventSource |
| **3.1.1** | LLM 调用无 timeout | ✅ 已修复（llm_timeout=60，OpenAI+Custom 均生效） |
| **3.1.2** | SSE 长连接 session | ✅ 已修复（session 移入循环内，每次查询独立获取/释放） |
| **3.1.3** | 提取部分失败无回滚 | ✅ 已修复（_rollback_partial_memories 软删除+ES清理） |
| **3.1.4** | re_extract 竞态条件 | ✅ 已修复（SELECT FOR UPDATE NOWAIT 行锁 + 异常日志） |
| **3.1.5** | dictionary 替换不一致 | ✅ 已修复（re.sub + re.IGNORECASE 大小写不敏感替换） |
| **3.1.6** | bulk_refresh commit 后 N+1 | ⚪ 长期 |
| **3.1.7** | bulk_reindex 部分成功不标记 | ✅ 已修复（bulk_reindex 返回 failed_ids，逐条标记 indexed_at） |
| **3.1.8** | sensor 无 cursor | ⚪ 长期 |
| **3.2.1** | AUDN top_k=5 过小 | ✅ 已修复（_process_one_fact 传 top_k=15） |
| **3.3.1** | comment_count 手动维护漂移 | ✅ 已修复（reconcile_comment_counts + Dagster 每日校验 sensor） |
| **3.3.2** | COLD 恢复不可搜索窗口 | ⚪ 长期 |
| **3.3.3** | namespace=None 导致 index_name=None | ✅ 已修复（bulk_refresh_quality 跳过 None index_name） |
| **3.4.1** | 无 API 限流 | 🟡 待处理 |
| **3.4.2** | X-Employee-Id 认证简单 | ⚪ 长期 |
| **3.4.3** | Settings 缺少配置校验 | ✅ 已修复（model_validator 校验 provider/天数/维度） |
| **3.5.1** | useAsync 竞态条件 | ✅ 已修复（callIdRef 序列号丢弃过期响应） |
| **3.5.2** | SSE 依赖数组多余 | 🟡 待处理 |
| **3.5.3** | 无 Error Boundary | ✅ 已修复（ErrorBoundary 组件包裹 Routes） |
| **3.5.4** | API Client 无 timeout | 🟡 待处理 |
| **3.5.5** | Promise 静默吞错 | 🟡 待处理 |
| **3.5.6** | 表单双击提交 | 🟡 待处理 |
| **3.5.7** | 无响应式设计 | ⚪ 长期 |
| **3.6.1** | UserContext 容错不足 | 🟡 待处理 |
| **3.6.2** | clearAll 丢 boardId | 🟡 待处理 |
| **3.6.3** | 搜索高亮未转义正则 | 🟡 待处理 |
