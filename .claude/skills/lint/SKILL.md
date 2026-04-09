---
name: lint
description: 对 git 改动的文件执行代码门禁规则检查（Python 后端 + TypeScript 前端），报告违规项并给出修复建议
---

# /lint — 门禁规则检查

对当前 git 改动的文件执行代码门禁规则检查，报告违规项。

## 执行步骤

1. 运行 `git diff --name-only HEAD` 获取改动文件列表（含未暂存和已暂存）
2. 如果没有改动文件，运行 `git diff --name-only HEAD~1` 检查最近一次提交
3. 对每个改动的 `.py` 文件，逐条检查以下规则：

### Python 后端规则

- **异常链**：`except` 块中 `raise HTTPException(...)` 必须带 `from e`
- **布尔列比较**：SQLAlchemy 布尔列禁止 `== True` / `== False`，使用 `.is_(True)` / `.is_(False)`
- **None 比较**：SQLAlchemy 列禁止 `== None` / `!= None`，使用 `.is_(None)` / `.isnot(None)`
- **函数体长度 ≤50 行**：超过则报告函数名和行数
- **嵌套深度 ≤4 层**：`if/for/try/with` 嵌套超过 4 层则报告
- **函数参数 ≤10 个**：参数过多则报告
- **标识符遮蔽**：局部变量/参数不得与内置名称同名（如 `id`、`type`、`list`、`app`）
- **推导式保持简单**：推导式内不应包含数据库查询
- **冗余导入**：模块顶部已 import 的符号，函数体内不要重复 import
- **禁止 `__import__`**：使用 `importlib.import_module` 替代

4. 对每个改动的 `.tsx` / `.ts` 文件，逐条检查以下规则：

### TypeScript / React 前端规则

- **禁止嵌套三元表达式**：三元内嵌套三元则报告
- **禁止 `alert()`**：使用 Toast 或状态提示替代

5. 输出检查报告，格式：

```
## 门禁检查报告

### ✅ 通过的文件
- file1.py
- file2.tsx

### ❌ 违规项
- **file3.py:42** — 函数 `foo` 体长 63 行，超过 50 行限制
- **file4.tsx:18** — 嵌套三元表达式

### 总结
检查 X 个文件，发现 Y 个违规项
```

## 注意

- 只检查改动的文件，不扫描整个项目
- 只读取文件内容进行检查，不修改任何文件
- 如果发现违规项，给出具体的修复建议
