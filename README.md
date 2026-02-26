# Forum Memory Agent

知识论坛 + 可插拔记忆 Agent 系统

## 项目结构

```
forum_memory/
├── main.py                          # FastAPI 应用入口
├── config.py                        # Pydantic Settings 配置
├── database.py                      # 数据库引擎/会话
│
├── models/                          # SQLModel 数据模型
│   ├── enums.py                     # 所有枚举定义
│   ├── base.py                      # UUID/时间戳 Mixin
│   ├── user.py                      # 用户
│   ├── namespace.py                 # 板块/命名空间
│   ├── thread.py                    # 帖子 + 评论
│   ├── memory.py                    # 记忆（核心实体）
│   ├── extraction.py                # 提取幂等记录
│   ├── feedback.py                  # 反馈
│   ├── operation_log.py             # 操作审计日志
│   └── event.py                     # 事件/摘要/知识缺口
│
├── schemas/                         # Pydantic 请求/响应模型
│   ├── namespace.py
│   ├── thread.py
│   ├── memory.py
│   └── feedback.py
│
├── services/                        # 业务逻辑层 (与 API 分离)
│   ├── namespace_service.py         # 板块管理
│   ├── thread_service.py            # 帖子生命周期 + 状态机
│   ├── memory_service.py            # 记忆 CRUD + 权威管理 + AUDN
│   ├── feedback_service.py          # 反馈处理 + 自动动作
│   ├── search_service.py            # 四阶段检索管道
│   └── extraction_service.py        # 提取编排器 (5 步管道)
│
├── api/                             # FastAPI 路由层 (薄层, 只做参数校验和调用 service)
│   ├── deps.py                      # 依赖注入
│   ├── namespaces.py
│   ├── threads.py
│   ├── memories.py
│   └── feedback.py
│
├── core/                            # 核心引擎
│   ├── state_machine.py             # 帖子状态机
│   ├── quality.py                   # 质量评分公式
│   ├── audn.py                      # AUDN 决策引擎
│   ├── extraction.py                # 事实提取 + 压缩
│   └── prompts.py                   # Prompt 模板
│
└── providers/                       # LLM 服务抽象
    ├── base.py                      # 抽象基类
    ├── openai_provider.py           # OpenAI 实现
    └── factory.py                   # 工厂 + 注册
```

## 核心设计

### 分层架构
- **API 层** → 路由、参数校验、HTTP 协议
- **Service 层** → 业务逻辑、事务管理
- **Core 层** → 纯业务引擎（状态机、AUDN、质量评分）
- **Provider 层** → LLM 抽象（可替换）
- **Model 层** → SQLModel 数据定义

### 帖子状态机
```
OPEN → RESOLVED (发起人点赞最佳回答)
OPEN → TIMEOUT_CLOSED (系统超时)
```

### 记忆二维状态
- **权威等级**: LOCKED (人工参与) / NORMAL (AI 自动)
- **生命周期**: ACTIVE → COLD → ARCHIVED → DELETED

### AUDN 循环
每条候选事实 vs 已有记忆:
- **ADD**: 全新知识
- **UPDATE**: 补充/修正 NORMAL 记忆
- **DELETE**: 明确废弃
- **NONE**: 已有覆盖

### 检索管道
1. 查询预处理 (黑话映射 + 改写)
2. ES 混合召回 (向量 + BM25 + 权威加权)
3. Reranker 精排
4. 环境匹配后处理

## 快速启动

```bash
# 安装依赖
pip install -e ".[dev]"

# 配置 .env
cp .env.example .env

# 启动
uvicorn forum_memory.main:app --reload
```

## 编码规范

- 函数体不超过 5 行
- 嵌套层数不超过 4 层
- API 和 Service 严格分离
- Pydantic 封装所有入参/出参
- SQLModel 定义所有数据模型
