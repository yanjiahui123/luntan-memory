# Forum Memory Agent — Backend

知识论坛 + 记忆系统后端，基于 FastAPI + SQLModel + PostgreSQL（同步模式）。

## 快速启动

```bash
# 1. 安装依赖
pip install -e ".[dev]"

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，设置数据库连接和 LLM API Key

# 3. 启动
uvicorn forum_memory.main:app --reload --port 8000
```

## 技术栈

- **FastAPI** — Web 框架
- **SQLModel** ≥0.0.22 — ORM（基于 SQLAlchemy 2.0）
- **psycopg2-binary** — PostgreSQL 同步驱动
- **Pydantic v2** — 数据校验
- **OpenAI SDK** — LLM 调用（知识提取、AUDN、AI 回答）

## 项目结构

```
forum_memory/
├── main.py                 # FastAPI 入口
├── config.py               # 配置（Pydantic Settings）
├── database.py             # 同步 Engine + Session
├── models/                 # SQLModel 数据模型
│   ├── enums.py            # 所有枚举
│   ├── base.py             # UUID + Timestamp Mixin
│   ├── user.py / namespace.py / thread.py / memory.py
│   ├── extraction.py / feedback.py / operation_log.py / event.py
├── schemas/                # Pydantic 请求/响应模型
├── core/                   # 核心业务逻辑引擎
│   ├── state_machine.py    # 帖子状态机 + 权威映射
│   ├── quality.py          # 五因子质量评分
│   ├── audn.py             # AUDN 决策解析
│   ├── extraction.py       # 提取辅助逻辑
│   └── prompts.py          # 所有 LLM Prompt 模板
├── providers/              # LLM 提供商抽象
│   ├── base.py / openai_provider.py / factory.py
├── services/               # 业务服务层
│   ├── namespace_service.py / thread_service.py
│   ├── memory_service.py / feedback_service.py
│   ├── search_service.py / extraction_service.py
└── api/                    # FastAPI 路由
    ├── deps.py             # 依赖注入
    ├── namespaces.py / threads.py / memories.py / feedback.py
```

## 关键改动说明

- **同步模式**：使用 `psycopg2-binary` 替代 `asyncpg`，所有 service/api 均为同步函数
- **绝对导入**：全部使用 `from forum_memory.xxx import yyy` 格式
- **SQLModel ≥0.0.22**：兼容最新版本

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/v1/namespaces` | 板块列表 / 创建 |
| GET/PUT | `/api/v1/namespaces/:id` | 板块详情 / 更新 |
| GET | `/api/v1/namespaces/:id/stats` | 板块统计 |
| PUT | `/api/v1/namespaces/:id/dictionary` | 黑话字典更新 |
| GET/POST | `/api/v1/threads` | 帖子列表 / 创建 |
| GET | `/api/v1/threads/:id` | 帖子详情 |
| POST | `/api/v1/threads/:id/resolve` | 采纳关闭 |
| POST | `/api/v1/threads/:id/timeout-close` | 超时关闭 |
| GET/POST | `/api/v1/threads/:id/comments` | 评论列表 / 添加 |
| GET/POST | `/api/v1/memories` | 记忆列表 / 创建 |
| GET/PUT/DELETE | `/api/v1/memories/:id` | 记忆详情 / 更新 / 删除 |
| PUT | `/api/v1/memories/:id/authority` | 权威等级变更 |
| POST | `/api/v1/memories/search` | 记忆搜索 |
| POST | `/api/v1/memories/extract/:thread_id` | 触发知识提取 |
| POST | `/api/v1/memories/:id/feedback` | 提交反馈 |
| GET | `/api/v1/memories/:id/feedback/summary` | 反馈汇总 |
