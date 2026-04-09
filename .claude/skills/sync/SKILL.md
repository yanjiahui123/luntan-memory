---
name: sync
description: 将主仓最新代码自动同步推送到后端（memory_service）和前端（memory_website）子仓库
---

# /sync — 三仓同步

将主仓的最新代码同步推送到后端和前端子仓库。

## 仓库信息

| 仓库 | 本地路径 | 远程 | 分支 |
|------|---------|------|------|
| 主仓（全量） | `D:\pythonProject\forum_memory` | `git@github.com:yanjiahui123/luntan-memory.git` | master |
| 后端服务 | `D:\pythonProject\_repo_sync\memory_service` | `git@github.com:yanjiahui123/memory_service.git` | main |
| 前端站点 | `D:\pythonProject\_repo_sync\memory_website` | `git@github.com:yanjiahui123/memory_website.git` | main |

## 执行步骤

1. **检测改动范围**：运行 `git diff --name-only HEAD~1` 判断最近提交涉及后端、前端还是两者都有
   - 包含 `forum_memory_backend/` → 需同步后端
   - 包含 `forum_memory_frontend/` → 需同步前端
   - 包含 `docs/` → 需同步后端（docs 也归后端仓）

2. **同步后端**（如有变更）：
   - 将 `forum_memory_backend/` 下改动的文件复制到 `D:\pythonProject\_repo_sync\memory_service\` 对应路径
   - 将 `docs/` 下改动的文件复制到 `D:\pythonProject\_repo_sync\memory_service\docs\`
   - 在后端仓执行 `git add` + `git commit` + `git push origin main`
   - commit message 复用主仓最近一次 commit 的 message

3. **同步前端**（如有变更）：
   - 将 `forum_memory_frontend/` 下改动的文件复制到 `D:\pythonProject\_repo_sync\memory_website\` 对应路径
   - 排除 `node_modules/` 和 `dist/`
   - 在前端仓执行 `git add` + `git commit` + `git push origin main`
   - commit message 复用主仓最近一次 commit 的 message

4. **输出结果**：

```
## 同步完成

| 仓库 | 状态 |
|------|------|
| 主仓 (master) | 已推送 |
| 后端 (main) | 已同步推送 / 无变更 |
| 前端 (main) | 已同步推送 / 无变更 |
```

## 注意

- 主仓必须已经 commit 并 push 完成后再调用此 skill
- 如果当前在 worktree 分支，先 merge 到 master 再同步
- commit message 末尾保留 `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>`
