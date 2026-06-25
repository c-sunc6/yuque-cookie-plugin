# yuque-cookie-plugin

一个面向 AI Agent 的本地语雀 Web Session 自动化工具。

本项目的核心目标是让 AI 通过和浏览器一致的网页 Session 路径操作语雀文档，而不是依赖语雀 Personal Token、OpenAPI Token、Skill 或 MCP。工具使用 `_yuque_session` 和 `yuque_ctoken` 访问语雀网页端接口，用于降低 token 限流和 MCP 部署带来的限制。

这不是一个 OpenAPI wrapper，而是一个本地 CLI 操作面：AI 可以用它读取、整理、下载、快照、对比、格式化并安全写入语雀文档，尽量接近语雀编辑器原生 Lake 结构。

## 当前 MVP 能力

- Cookie 登录和登录态检测：`login`、`auth-status`
- 读取语雀信息：`inspect`
- 文档快照和结构对比：`snapshot`、`diff-lake`
- Lake 和 Markdown 辅助转换：`lake-to-markdown`、`editor-serialize`
- 安全写入：`apply-lake`、`update-lake`
- 创建知识库和文档：`create-book`、`create-doc`
- 标题原生编号：`--number-headings`
- 整库/单篇下载：`download-book`、`download-doc`
- 下载资源清单、warning、retry 报告
- 本地 VitePress 预览：`serve-book`
- 上传并插入图片、PDF 附件：`upload-attach`、`insert-image`、`insert-attachment`

## 安装

从 GitHub 一行安装：

```bash
npm install -g https://codeload.github.com/c-sunc6/yuque-cookie-plugin/tar.gz/refs/heads/main
```

安装后可直接运行：

```bash
yuque-local --help
yuque-local login
```

开发者本地源码运行：

```bash
git clone git@github.com:c-sunc6/yuque-cookie-plugin.git
cd yuque-cookie-plugin
npm install
```

本项目建议作为“项目内本地 CLI”使用：

```bash
npm run yuque-local -- --help
```

MVP 阶段不建议使用 `npm install -g`、`npm link` 或修改全局 npm 配置，避免影响电脑上的其他开发环境。

## 登录

```bash
npm run yuque-local -- login
```

命令会打开一个本地网页，需要填写：

- 语雀个人/团队主页 URL，例如 `https://www.yuque.com/your-login/`
- `_yuque_session`
- `yuque_ctoken`

凭据会保存到：

```bash
~/.config/yuque-cookie-plugin/config.json
```

项目目录不会保存真实 Cookie。配置文件会记录保存时间、更新时间、最近成功验证时间和最近失败时间。

也可以用环境变量覆盖本地配置：

```bash
export YUQUE_SESSION='your _yuque_session'
export YUQUE_CTOKEN='your yuque_ctoken'
export YUQUE_HOME_URL='https://www.yuque.com/your-login/'
```

验证登录态：

```bash
npm run yuque-local -- auth-status https://www.yuque.com/<your-login>/<your-book>
```

## 常用命令

查看知识库或文档信息：

```bash
npm run yuque-local -- inspect https://www.yuque.com/<your-login>/<your-book>
```

下载整个知识库：

```bash
npm run yuque-local -- download-book https://www.yuque.com/<your-login>/<your-book> \
  --dist-dir download \
  --incremental
```

下载单篇文档：

```bash
npm run yuque-local -- download-doc https://www.yuque.com/<your-login>/<your-book>/<doc-slug> \
  --dist-dir download
```

创建文档：

```bash
npm run yuque-local -- create-doc https://www.yuque.com/<your-login>/<your-book> \
  --title AI测试文档 \
  --markdown-file article.md \
  --number-headings
```

插入图片：

```bash
npm run yuque-local -- insert-image https://www.yuque.com/<your-login>/<your-book>/<doc-slug> \
  --file ./image.png \
  --after-text "图片位置"
```

插入 PDF 附件：

```bash
npm run yuque-local -- insert-attachment https://www.yuque.com/<your-login>/<your-book>/<doc-slug> \
  --file ./example.pdf \
  --after-text "附件位置"
```

生成文档快照：

```bash
npm run yuque-local -- snapshot https://www.yuque.com/<your-login>/<your-book>/<doc-slug> \
  --out /tmp/doc.snapshot.json
```

对比两个快照：

```bash
npm run yuque-local -- diff-lake before.json after.json
```

预览下载后的知识库：

```bash
npm run yuque-local -- serve-book download/知识库 --config-only
npm run yuque-local -- serve-book download/知识库 --port 5173
```

## 原生 Lake 写入策略

项目优先使用语雀自身生成的 Lake 结构，而不是手写 Markdown 后直接覆盖。

典型流程：

1. 通过语雀 Web Session 创建或读取文档。
2. `snapshot` 获取语雀生成的 `body_asl`。
3. 只做已验证的 Lake 变换，例如标题编号 `data-lake-index-type="2"`。
4. 写入前生成备份和报告。

PDF 附件写入已通过真实测试验证：file card 必须包含 `src + name`，其中 `src` 指向 `https://www.yuque.com/office/<filekey>?from=<doc-url>`，否则语雀阅读页可能打开 `about:blank`。

## yuque-dl 迁移

本项目已迁移并改造了部分 `gxr404/yuque-dl` 的核心下载能力，但不通过外部 shell 调用它，而是使用 TypeScript 在本项目内实现，并适配 `_yuque_session + yuque_ctoken` 的认证路径。

已支持：

- 整库下载并保持 TOC 目录结构
- 单篇/多篇文档下载
- `progress.json` 增量下载
- `index.md` 汇总页
- 图片、附件、音视频资源本地化
- 资源清单、失败 warning、retry 信息
- VitePress 本地预览配置

仍在继续补齐：

- 复杂语雀表格变体
- 音视频真实复杂样例
- 思维导图、画板、复杂 card 的原生创建和更新

## 开发与验证

```bash
npm run typecheck
npm test
npm run yuque-local -- --help
```

真实语雀验收不会进入默认 `npm test`。需要手动运行：

```bash
npm run real:acceptance -- \
  --book-url https://www.yuque.com/<your-login>/<your-book> \
  --dist-dir /tmp/yuque-real-acceptance
```

## 文档

- `docs/usage-zh.md`：中文完整使用指南
- `docs/real-acceptance.md`：真实语雀验收流程
- `docs/native-lake-capability.md`：原生 Lake 能力矩阵
- `docs/development-plan.md`：开发计划和迭代日志
- `docs/principles.md`：项目开发原则
- `docs/github-mvp-release.md`：GitHub MVP 发布检查清单

## 安全约束

- 不要把真实 `_yuque_session` 或 `yuque_ctoken` 写入项目文件。
- 不要提交 `~/.config/yuque-cookie-plugin/config.json`。
- `reports/`、`backups/`、`node_modules/` 已被 `.gitignore` 忽略。
- 批量写入前先对单篇文档做真实实验。
- 不确定 Lake 语义时，先 snapshot，再 diff，再实现。
