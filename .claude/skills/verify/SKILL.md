---
name: verify
description: 改动后验证功能是否正常，包括编译检查、页面预览、接口检查
---

# /verify — 改动验证

对最近的代码改动进行功能验证，确保改动没有引入问题。

## 执行步骤

### 1. 分析改动范围

运行 `git diff --name-only HEAD` 或 `git diff --name-only HEAD~1` 确定改动涉及：
- 后端（`forum_memory_backend/`）
- 前端（`forum_memory_frontend/`）
- 两者

### 2. 前端验证（如有前端改动）

1. **编译检查**：运行 `npx tsc --noEmit`，对比已知的既有错误，确认没有新增 TS 错误
2. **启动预览**：调用 preview_start 启动 Vite dev server
3. **控制台检查**：调用 preview_console_logs 检查是否有运行时错误
4. **页面截图**：调用 preview_screenshot 查看页面渲染是否正常
5. **功能验证**：根据改动内容，通过 preview 工具点击/导航到相关页面，验证改动的功能是否生效

### 3. 后端验证（如有后端改动）

1. **语法检查**：对改动的 `.py` 文件运行 `python -c "import ast; ast.parse(open('file').read())"` 确认无语法错误
2. **导入检查**：尝试导入改动的模块 `python -c "import forum_memory.xxx"` 确认依赖无误
3. **接口验证**：如果改动涉及 API 端点，用 curl 或描述测试方法

### 4. 输出验证报告

```
## 验证报告

### 改动范围
- 前端: file1.tsx, file2.tsx
- 后端: file3.py

### 前端验证
- ✅ 编译检查：无新增 TS 错误
- ✅ 控制台：无运行时错误
- ✅ 页面渲染：正常
- ✅ 功能验证：xxx 功能正常工作

### 后端验证
- ✅ 语法检查：通过
- ✅ 导入检查：通过

### 结论
所有验证通过 / 发现 N 个问题需要修复
```

## 注意

- 前端验证依赖 preview 工具，如果 preview server 未启动会自动启动
- 后端验证不会启动服务器，只做静态检查和模块导入测试
- 如果发现问题，给出具体的修复建议
- 验证完成后不要自动修改代码，只报告结果
