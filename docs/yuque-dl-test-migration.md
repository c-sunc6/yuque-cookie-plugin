# yuque-dl 测试迁移记录

## 目标

把 `/home/mi/文档/yuquebk/packages/yuque-dl/test` 的测试体系逐步迁移到本项目，建立 Vitest/MSW 测试框架，并用测试驱动补齐与 yuque-dl 的功能差异。

## 当前状态

已建立：

- `vitest.config.ts`
- `npm run test:unit`
- `npm test = typecheck + vitest run + CLI help`
- `test/mocks/server.ts`
- `test/mocks/handlers.ts`
- `test/mocks/data/*`
- `test/mocks/assets/*`
- `scripts/real-acceptance.ts`

当前通过：

```bash
npm test
```

当前测试结果：

```text
Test Files  12 passed
Tests       69 passed
```

## 已迁移的测试覆盖

### download utils

来源参考：

- `yuque-dl/test/parse/fix.test.ts`
- `yuque-dl/test/crypto.test.ts`
- `yuque-dl/test/utils.test.ts`

当前覆盖：

- `fixLatex`
- `fixMarkdownImage`
- `fixPath`
- `fixInlineCode`
- `fixInlineCode` complex markdown/html combinations
- `captureImageUrl`
- `getMarkdownImageList`
- `removeEmojis`
- `formatDate`
- `writeSummary` 结构化输出：普通标题、标题即文档、嵌套文档、外链节点、空格链接转义

### sheet

来源参考：

- `yuque-dl/test/parse/sheet.test.ts`

当前覆盖：

- `parseSheet`
- `genMarkdownTable`
- pako v2 对 yuque-dl binary string sheet 数据的兼容

### client-cookie + MSW

来源参考：

- `yuque-dl/test/api.test.ts`
- `yuque-dl/test/mocks/*`

当前覆盖：

- mock Yuque HTML appData 页面
- `inspect`
- `getDocInfoFromUrl`
- `getDocMarkdownData`
- appData 无 doc 字段错误
- appData 解析失败错误

### Lake parser

本项目新增覆盖：

- heading
- paragraph
- list
- card
- table
- Lake to Markdown 基础转换

### CLI help

当前覆盖：

- `download-book`
- `download-doc`
- `editor-serialize`
- `apply-lake`
- 本地命令缺参数错误不需要凭据
- Web 命令缺凭据时进入 login flow

### CLI download subprocess

当前覆盖：

- 独立 HTTP mock server，可被 CLI 子进程访问
- `download-book` 真实 CLI 进程
- `download-doc` 真实 CLI 进程
- `--api-host`
- `--quiet`
- `--ignore-img`
- `--toc`
- `--cookie-key` / `--cookie-value` 通过真实 CLI 下载链路传递额外 Cookie
- 非 quiet 模式下进度输出到 stderr，最终 JSON 保持在 stdout
- `download-doc` 部分失败时保留成功文件
- `download-doc` 全部失败时 CLI 退出码为 1，同时保留 JSON 失败报告

### download/article

来源参考：

- `yuque-dl/test/download/article.test.ts`

当前覆盖：

- 普通 Markdown 文档下载
- 图片本地化
- 文档时间字段写入 progress item
- 缺失 `sourcecode` 错误
- board/table 未支持类型占位
- sheet 文档转 Markdown
- uuid 含特殊字符时的图片/附件目录清理
- 增量模式跳过未变化文档
- `hideFooter` 隐藏更新/原文 footer
- `convertMarkdownVideoLinks` 将 Markdown mp4/mp3 链接转成 HTML `video` / `audio` 标签

### attachments

来源参考：

- `yuque-dl/test/download/attachments.test.ts`

当前覆盖：

- Yuque 附件下载
- 附件链接改写
- 附件下载失败时保留原始链接
- 附件下载失败时记录 `warnings`
- 资源失败按类型生成 `warning_summary`
- 指定后缀忽略

### list / summary

来源参考：

- `yuque-dl/test/download/list.test.ts`
- `yuque-dl/test/parse/summary.test.ts`

当前覆盖：

- title 文件夹 + doc 文档结构
- 标题本身也是 doc 时生成 `index.md`
- 子文档路径
- `index.md` summary
- `progress.json` 路径、标题链路、更新时间字段
- 本地图片数量和文件大小
- 第二次增量下载跳过未变文档
- TOC `LINK` 节点不下载，但会保留到 `index.md` 外部链接并记录 `warnings`
- 文档失败时报告 `retry` 计划，可用于只重试失败文档
- `writeSummary` 直接单元测试覆盖 title/doc/title-doc/link 的 index 渲染，替代原 summary snapshot 的核心断言

### download-doc

来源参考：

- `yuque-dl/test/cli.test.ts` 的 `doc <...urls>` 场景

当前覆盖：

- 单篇/多篇文档下载
- 可读中文文件名
- 部分 URL 失败时保留已成功下载的文档
- failures 摘要
- 全部 URL 失败时 CLI 退出码为 1
- 部分失败时报告 `retry.command`、`retry.urls`、`retry.args`

### serve-book

来源参考：

- `yuque-dl/test/cli.test.ts` 的 `server <serverPath>` 能力
- `yuque-dl/src/server.ts`

当前覆盖：

- 生成 `.vitepress/config.mjs`
- `serve-book --config-only` 通过真实 CLI 进程生成配置并输出 JSON，不需要凭据、不启动长驻服务
- sidebar 按 `progress.json` 顺序
- 目录 `index.md` link
- 忽略 `img/`、`attachments/`、`progress.json`
- `serveBook` 传递 host/port 给 VitePress
- 已存在 `.vitepress` 时默认不覆盖
- `force` 时重新生成 `.vitepress/config.mjs`
- 不存在的 book path 会失败

### media cards

当前覆盖：

- Markdown `_lake_card` video 链接下载和改写
- HTML audio card 发现和追加链接
- `ignoreAttachments` 后缀列表对音视频生效
- 音视频资源下载失败时记录 `warnings`
- 兼容 `download_url` / `downloadUrl` / `src` / `play_url` / 嵌套 `file` 等媒体 API 字段

### real request / manual acceptance

来源参考：

- `yuque-dl/test/realRequest.test.ts`

当前处理：

- 不进入默认 `npm test`。
- 新增 `npm run real:acceptance -- --book-url <url>`。
- 真实验收覆盖 inspect、首次整库下载、第二次增量下载、`index.md`、`progress.json`。
- 支持重复 `--doc-url` 做单篇/多篇文档验收。
- 单文档验收会检查每个下载出的 Markdown 文件是否存在、非空，并记录预览片段。
- 单文档验收会提升 `warning_summary`、`retry` 和下载器报告路径，便于检查音视频、图片、附件资源失败。
- 验收报告写入 `reports/real-acceptance-*.json`，不保存 Cookie。

## 尚未迁移的 yuque-dl 测试

以下测试还没有完整迁移或只完成了首批覆盖：

- `test/cli.test.ts`
- 原 snapshot 测试
- 真实音视频样本细节 parity
- `download/list` 更复杂的人工提示文案 parity

## 已发现的差异

### fixPath

yuque-dl 会删除所有空白字符。本项目保留正常空格，只压缩连续空白并清理路径非法字符。

原因：本项目更重视 AI 和人类阅读导出文件名。

### fixInlineCode

yuque-dl 使用 mdast 做 AST 级处理。本项目当前是轻量文本处理，已覆盖常见情况，但还不是完全等价。

### ProgressBar

yuque-dl 有完整动态 `ProgressBar` 类，并把断点续传状态和终端进度条放在同一个对象里。

本项目不复刻动态进度条，正式采用：

- `progress.json` 由下载流程直接维护，用于断点/增量判断。
- 非 quiet 模式下，人类可读进度写入 stderr。
- 最终机器可读 JSON 写入 stdout。
- `--quiet` 关闭进度行，只保留最终 JSON。

原因：这个项目面向 AI/脚本自动化，stdout 必须尽量保持稳定可解析。

### Markdown 标题策略

yuque-dl 的原 `index.test.ts` snapshot 会保留源 Markdown 里的一级标题。本项目下载文章时会用语雀 TOC 标题生成文档一级标题，因此迁移测试采用结构化断言，验证索引、正文结构、footer、图片本地化和 `progress.json`，不强行复制旧 snapshot。

当前 `--toc` 仍基于源 Markdown 正文生成，因此当源 Markdown 一级标题和语雀 TOC 标题不一致时，TOC 第一项可能显示源标题，而最终文档 H1 显示 TOC 标题。这个行为已经有 CLI 测试覆盖，后续若调整标题策略需要同步更新。

### API 认证

yuque-dl 支持 `-k --key` 和 `-t --token`。本项目核心路线仍是 `_yuque_session + yuque_ctoken`，现在已增加 `--cookie-key` / `--cookie-value` 和 `YUQUE_EXTRA_COOKIE_KEY` / `YUQUE_EXTRA_COOKIE_VALUE`，用于兼容企业私有服务或 `verified_books` 等额外 Cookie。

`--cookie-key` / `--cookie-value` 已覆盖真实 CLI 下载链路；不会把 Yuque personal token 迁移为主认证路径。

## 下一步

1. 迁移 yuque-dl snapshot 测试，或改造成更稳定的结构化断言。
2. 继续补 `test/cli.test.ts` 中尚未覆盖的 server/CLI 细节。
3. 用 `npm run real:acceptance` 定期验证真实私有知识库，尤其是包含音视频卡片的单篇文档，不把真实网络/cookie 放进默认测试。
