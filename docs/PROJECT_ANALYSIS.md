# Forum Memory Agent 项目审查报告

> **最后更新**: 2026-03-07（全量重审，基于当前实际代码）

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
| 记忆提取 | Dagster sensor 轮询 DomainEvent 表（30s 间隔） |
| ES-DB 同步修复 | Dagster sensor 每 10 分钟扫描 `indexed_at IS NULL` |
| 帖子超时关闭 | Dagster sensor 每小时触发 `batch_timeout_threads()` |
| 记忆生命周期 | Dagster sensor 每日触发 ACTIVE→COLD→ARCHIVED 转换 |
| 质量分刷新 | Dagster sensor 每日触发 `bulk_refresh_quality()` |

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

---

## 三、当前存在的问题

### 3.1 架构层面

#### 3.1.1 thread_created_sensor 是死代码

**文件**: `dagster/sensors.py:thread_created_sensor`、`dagster/assets.py:ai_answer_job`

Dagster 定义了 `thread_created_sensor`，轮询 `DomainEvent.event_type == "thread.created"` 以触发 AI 回答。但 `create_thread()` 从未向 DomainEvent 表写入此类事件——实际的 AI 回答是由后台线程池驱动的。

**结果**：
- `thread_created_sensor` 永远找不到任何事件，始终 yield `SkipReason`
- `ai_answer_job` 在 Dagster UI 中永远不会被触发
- Dagster 的 `definitions.py` 注册了这两个无效资源，造成误导

**根因**：AI 回答生成使用了两套机制（线程池 + Dagster），但只有线程池真正生效，Dagster 侧的部分未完成对接。

**影响**：当前功能不受影响，但维护者会在 Dagster UI 中看到一个"永远不运行"的 job，且如果未来想迁移到纯 Dagster 驱动，需要补发 DomainEvent。

---

#### 3.1.2 bulk_refresh_quality 中的 N 次 embedding 调用

**文件**: `services/memory_service.py:335-343`

```python
for m in changed:
    index_name = _resolve_es_index(session, m.namespace_id)
    if _index_to_es(m, index_name=index_name):   # 内部调用 provider.embed(m.content)
        m.indexed_at = datetime.now(timezone.utc)
```

`_index_to_es()` 每次调用 `provider.embed(content)`，即**每条记忆一次 embedding API 请求**。当 batch=200 中有 100 条质量分变化时，将产生 100 次独立 embedding 调用。

`LLMProvider` 已有 `embed_batch()` 接口，可以一次调用处理所有文本。`es_service` 也有 `bulk_reindex()` 支持批量写入 ES。当前实现未利用这两个接口，是 bulk 场景下最大的性能瓶颈。

---

### 3.2 搜索质量

#### 3.2.1 排序未融合质量分

**文件**: `services/search_service.py:152-197`

```python
def _simple_rank(candidates, query, top_k):
    scores = provider.rerank(query, docs)   # 纯语义相关性
    scored.sort(key=lambda x: x[1], reverse=True)
    return [m for m, _ in scored[:top_k]]  # quality_score 完全未参与

def _build_hits(session, memories, env):
    hit = MemorySearchHit(
        memory=...,
        score=m.quality_score,   # 只用于展示，不影响排序
    )
```

`quality_score` 字段记录了记忆的反馈质量、时效性、来源权威等综合评估，但在排序阶段被完全忽略。两条语义相似度相同的记忆，一条有 50 次正向反馈（quality=0.9），一条从未被使用过（quality=0.5），搜索结果中排名完全相同。

**建议**：

```python
final_score = 0.7 * semantic_score + 0.3 * m.quality_score
```

---

#### 3.2.2 查询改写无条件触发

**文件**: `services/search_service.py:75-99`

```python
def _preprocess_query(session, req):
    # 无论查询长短复杂度，都调用 LLM 改写
    rewritten = provider.complete([
        {"role": "system", "content": QUERY_REWRITE_SYSTEM},
        {"role": "user", "content": QUERY_REWRITE_USER.format(query=query, ...)},
    ])
```

每次搜索都触发一次完整的 LLM 调用（1-3 秒）。对于简单查询如 "K8s HPA"，LLM 改写的收益微乎其微，反而增加延迟和成本。

**建议**：
- 查询词数 ≤ 4 时，跳过 LLM 改写，仅做字典映射
- 对改写结果按查询字符串做短时缓存（TTL=5 分钟）

---

#### 3.2.3 AUDN 相似度搜索 top_k 固定为 5

**文件**: `services/search_service.py:34`

```python
def find_similar(session, namespace_id, content, top_k=5):
```

提取流水线中为每个知识点调用 `find_similar()` 时始终使用 top_k=5（默认值，`_process_one_fact` 未覆盖）。当知识库积累到数千条记忆后，仅检索 5 条候选可能遗漏与新知识点高度重叠但排名靠后的已有记忆，导致 AUDN 误判为 ADD，产生重复记忆。

---

### 3.3 数据一致性

#### 3.3.1 comment_count 手动维护，存在漂移风险

**文件**: `services/thread_service.py`

`Thread.comment_count` 通过代码中的 `+= 1` / `-= 1` 手动维护，而非从 Comment 表实时聚合。若事务在 commit 前失败、或未来新增不经过 `thread_service` 的评论写入路径，计数器会出现漂移。

**建议**：读取时通过 COUNT 子查询补充，或定期校验/修正计数器。

---

#### 3.3.2 COLD 记忆从 ES 删除但 DB 保留

**文件**: `services/memory_service.py:262-276`

```python
def transition_cold_memories(session, cold_days=180):
    for m in memories:
        m.status = MemoryStatus.COLD
        m.indexed_at = None
        ...
    # Remove from ES after successful DB commit
    for memory_id, index_name in es_cleanup:
        es_service.delete_memory_doc(memory_id, index_name=index_name)
```

记忆转为 COLD 后从 ES 中删除，此后不再出现在搜索结果中。但 `es_sync_repair_sensor` 只修复 `status == ACTIVE` 的记忆，所以 COLD 记忆即使之后被恢复为 ACTIVE，也不会被修复传感器主动补索引——必须等待代码路径中的 `_index_to_es()` 主动调用或手动 reindex。

这一行为可能是设计意图（COLD 记忆不应出现在搜索中），但应当明确记录，且 status 恢复路径缺少 ES 补索引逻辑。

---

### 3.4 安全与运维

#### 3.4.1 无 API 限流

所有 API 端点无速率限制。涉及 LLM 的高成本端点尤其危险：

| 端点 | LLM 调用数 |
|------|-----------|
| `POST /threads`（触发 AI 回答） | ~2-4 次（搜索改写 + 生成） |
| `POST /memories/search` | ~2 次（改写 + rerank） |
| `POST /memories/extract/{thread_id}` | ~10-20 次（三阶段 + N×AUDN） |

恶意或误操作的批量请求可在短时间内产生大量 LLM API 费用。

**建议**：在 Nginx 层或 FastAPI 中间件层对以上端点加限流（如每用户每分钟 10 次）。

---

#### 3.4.2 X-Employee-Id 认证无验证

**文件**: `api/deps.py`

```python
def get_current_user(x_employee_id: str | None = Header(None)) -> User:
    # 直接用 header 值查 DB，无签名/token 验证
```

任何知道员工 ID 的人（或随机猜测）都可以伪造任意用户身份。内部网络环境下风险有限，但公网暴露时存在越权风险。

---

### 3.5 前端体验

#### 3.5.1 AI 回答轮询策略

前端使用渐进退避轮询（3s → 30s，5 分钟后放弃）等待 AI 回答。后端改为异步生成后，用户在网络正常情况下约 5-30 秒内可见回答，当前策略基本可用，但存在最终放弃的情况——若 AI 生成耗时超过 5 分钟（极少情况），用户页面不再刷新，需手动刷新页面。

**建议**：Server-Sent Events（SSE）可精确推送，消除轮询延迟和超时放弃问题，但工作量中等。

---

## 四、改进方案与优先级

### 高优先级（代码改动量小，收益明显）

| 问题 | 方案 | 预期收益 | 工作量 |
|------|------|---------|--------|
| **3.2.1** 排序未融合质量分 | `_simple_rank()` 中加权融合：`0.7×语义 + 0.3×质量` | 搜索精准度提升 | 极小 |
| **3.2.2** 查询改写无条件触发 | 词数 ≤ 4 跳过 LLM，加查询级缓存 | 搜索延迟降低 30-60% | 小 |
| **3.1.1** thread_created_sensor 死代码 | 方案 A：在 `create_thread()` 中补发 `DomainEvent("thread.created")`，停用背后线程池；方案 B：从 `definitions.py` 移除无效 sensor/job | 架构清晰，消除误导 | 小 |
| **3.1.2** bulk 场景 N 次 embedding | 收集 changed 记忆的 content，统一 `embed_batch()`，再 `bulk_reindex()` | bulk 场景性能提升 N 倍 | 小 |

### 中优先级（需要一定设计考虑）

| 问题 | 方案 | 预期收益 | 工作量 |
|------|------|---------|--------|
| **3.4.1** 无 API 限流 | Nginx 限流或 `slowapi` 中间件，对 LLM 端点加速率限制 | 防止成本攻击 | 小 |
| **3.2.3** AUDN top_k=5 | `_process_one_fact()` 中将 top_k 提升到 10-15 | 减少重复记忆 | 极小 |
| **3.3.2** COLD 恢复无补索引 | `change_status_to_active()` 路径（如有）调用 `_index_to_es()` | 状态恢复后可搜索 | 小 |
| **3.3.1** comment_count 漂移 | 增加定期校验 job：`UPDATE threads SET comment_count = (SELECT COUNT(*) FROM comments WHERE ...)` | 数据准确性 | 小 |

### 低优先级（长期规划）

| 问题 | 方案 | 预期收益 | 工作量 |
|------|------|---------|--------|
| **3.4.2** 认证简单 | 接入 OAuth2 / JWT / SSO | 安全性 | 大 |
| **3.5.1** 轮询策略 | Server-Sent Events 推送 AI 回答 | 体验提升 | 中 |
| AUDN 多维度召回 | KNN top-10 ∪ 相同 tags ∪ 相同 knowledge_type | 减少重复知识遗漏 | 中 |
| 搜索质量分融合（高级） | 引入专用 Reranker 替代 embedding cosine similarity | 搜索精准度大幅提升 | 中 |

---

## 附录：问题状态全表

| 编号 | 问题描述 | 状态 |
|------|---------|------|
| 1.1 | AI 回答同步阻塞 HTTP | ✅ 已解决 |
| 1.2 | LLM small_model 设计 | ✅ 已移除 |
| 1.3 | 提取幂等性（FAILED 不重试） | ✅ 已解决 |
| 2.1 | ES-DB 不一致（被动修复） | ✅ 已解决（主动 sensor） |
| 2.2 | 质量刷新全量加载 | ✅ 已解决（batch=200） |
| 3.1.1 | thread_created_sensor 死代码 | 🔴 待处理 |
| 3.1.2 | bulk 刷新 N 次 embedding | 🔴 待处理 |
| 3.2.1 | 排序未融合质量分 | 🔴 待处理 |
| 3.2.2 | 查询改写无条件触发 | 🔴 待处理 |
| 3.2.3 | AUDN top_k=5 过小 | 🟡 待处理 |
| 3.3.1 | comment_count 手动维护漂移 | 🟡 待处理 |
| 3.3.2 | COLD 恢复无 ES 补索引 | 🟡 待处理 |
| 3.4.1 | 无 API 限流 | 🟡 待处理 |
| 3.4.2 | X-Employee-Id 认证简单 | ⚪ 长期 |
| 3.5.1 | AI 回答前端轮询 | ⚪ 长期 |
