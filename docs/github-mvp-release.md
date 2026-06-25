# GitHub MVP 发布检查清单

本文档用于把 MVP 发布到 GitHub 前做本地自检。目标是只影响当前项目目录，不修改用户电脑上的其他开发环境。

## 隔离原则

- 项目目录固定为 `/home/mi/文档/yuque-cookie-plugin`。
- 依赖安装只在当前目录执行 `npm install`，不使用 `npm install -g`。
- 不执行 `npm link`，不修改全局 npm、Node、shell、git 配置。
- 不把 `_yuque_session`、`yuque_ctoken`、真实下载报告、备份快照提交到 Git。
- 登录凭据只保存在 `~/.config/yuque-cookie-plugin/config.json`，并由 CLI 读取。
- 真实验收输出保存在 `reports/` 和 `backups/`，这两个目录已被 `.gitignore` 忽略。

## MVP 当前能力

- Cookie 登录：`login`、`auth-status`。
- 读取与快照：`inspect`、`snapshot`、`lake-to-markdown`、`diff-lake`。
- 安全 Lake 写入：`apply-lake`、`update-lake`，写入前生成备份。
- 创建知识库和文档：`create-book`、`create-doc`。
- 标题原生编号：`--number-headings`，使用 `data-lake-index-type="2"`。
- 下载能力：`download-book`、`download-doc`、增量下载、资源清单、warning/retry 报告。
- 资源写入：`upload-attach`、`insert-image`、`insert-attachment`。
- PDF 附件预览：file card 使用 `src = https://www.yuque.com/office/<filekey>?from=<doc-url>`。
- 本地预览下载结果：`serve-book`。

## 不在 MVP 承诺范围

- 不承诺 npm 公共包发布。
- 不承诺跨平台安装器。
- 不承诺 MCP 服务或 OpenAPI token 模式。
- 思维导图、画板、复杂语雀卡片仍处于探索阶段。
- mock 测试不是最终上线验收依据；最终验收以真实语雀文档操作为准。

## 发布前命令

在当前项目目录执行：

```bash
cd /home/mi/文档/yuque-cookie-plugin
npm run typecheck
npm run yuque-local -- --help
git diff --check
```

敏感信息扫描：

```bash
rg "_yuque_session[:：]\s*[A-Za-z0-9_=-]{20,}|yuque_ctoken[:：]\s*[A-Za-z0-9_-]{10,}|YUQUE_SESSION=['\"][A-Za-z0-9_=-]{20,}|YUQUE_CTOKEN=['\"][A-Za-z0-9_-]{10,}" \
  -n . \
  --glob '!node_modules/**' \
  --glob '!package-lock.json' \
  --glob '!reports/**' \
  --glob '!backups/**'
```

如果 `rg` 返回退出码 1 且没有输出，表示没有命中。

## 建议提交内容

应该提交：

- `src/`
- `bin/`
- `docs/`
- `test/`
- `vendor/lake-editor/`
- `README.md`
- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vitest.config.ts`
- `.env.example`
- `.gitignore`

不应该提交：

- `.env`
- `.env.local`
- `node_modules/`
- `reports/`
- `backups/`
- `download/`
- 用户真实文章、真实 Cookie、临时 Lake 输出。

## GitHub 创建方式

如果还没有远程仓库，推荐先在 GitHub 创建空仓库，然后在本地绑定：

```bash
git remote add origin git@github.com:<your-name>/yuque-cookie-plugin.git
git branch -M main
git push -u origin main
```

如果使用 HTTPS：

```bash
git remote add origin https://github.com/<your-name>/yuque-cookie-plugin.git
git branch -M main
git push -u origin main
```

执行 push 前先确认：

```bash
git status --short
git remote -v
```

## MVP 标签建议

首次公开 MVP 可以使用：

```bash
git tag v0.1.0-mvp
git push origin v0.1.0-mvp
```

只有在确认 GitHub 仓库中没有敏感信息后再打 tag。
