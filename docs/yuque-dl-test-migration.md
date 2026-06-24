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

当前通过：

```bash
npm test
```

当前测试结果：

```text
Test Files  12 passed
Tests       49 passed
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

### attachments

来源参考：

- `yuque-dl/test/download/attachments.test.ts`

当前覆盖：

- Yuque 附件下载
- 附件链接改写
- 附件下载失败时保留原始链接
- 附件下载失败时记录 `warnings`
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

### download-doc

来源参考：

- `yuque-dl/test/cli.test.ts` 的 `doc <...urls>` 场景

当前覆盖：

- 单篇/多篇文档下载
- 可读中文文件名
- 部分 URL 失败时保留已成功下载的文档
- failures 摘要

### serve-book

来源参考：

- `yuque-dl/test/cli.test.ts` 的 `server <serverPath>` 能力
- `yuque-dl/src/server.ts`

当前覆盖：

- 生成 `.vitepress/config.mjs`
- sidebar 按 `progress.json` 顺序
- 目录 `index.md` link
- 忽略 `img/`、`attachments/`、`progress.json`

### media cards

当前覆盖：

- Markdown `_lake_card` video 链接下载和改写
- HTML audio card 发现和追加链接
- `ignoreAttachments` 后缀列表对音视频生效

## 尚未迁移的 yuque-dl 测试

以下测试还没有完整迁移或只完成了首批覆盖：

- `test/cli.test.ts`
- `test/realRequest.test.ts`
- 原 snapshot 测试
- 原 ProgressBar 测试
- `download/article` 的 custom key token、音视频细节、失败信息 parity
- `download/list` 的外链、警告、失败重试报告 parity

## 已发现的差异

### fixPath

yuque-dl 会删除所有空白字符。本项目保留正常空格，只压缩连续空白并清理路径非法字符。

原因：本项目更重视 AI 和人类阅读导出文件名。

### fixInlineCode

yuque-dl 使用 mdast 做 AST 级处理。本项目当前是轻量文本处理，已覆盖常见情况，但还不是完全等价。

### ProgressBar

yuque-dl 有完整 `ProgressBar` 类。本项目当前用 stderr 行输出进度。

### Markdown 标题策略

yuque-dl 的原 `index.test.ts` snapshot 会保留源 Markdown 里的一级标题。本项目下载文章时会用语雀 TOC 标题生成文档一级标题，因此迁移测试采用结构化断言，验证索引、正文结构、footer、图片本地化和 `progress.json`，不强行复制旧 snapshot。

### API 认证

yuque-dl 支持 `-k --key` 和 `-t --token`。本项目核心路线仍是 `_yuque_session + yuque_ctoken`，现在已增加 `--cookie-key` / `--cookie-value` 和 `YUQUE_EXTRA_COOKIE_KEY` / `YUQUE_EXTRA_COOKIE_VALUE`，用于兼容企业私有服务或 `verified_books` 等额外 Cookie。

## 下一步

1. 迁移 yuque-dl snapshot 测试，或改造成更稳定的结构化断言。
2. 决定是否实现 yuque-dl 的 `ProgressBar` parity，或将测试改为本项目的 stderr progress 模式。
3. 继续补 `test/cli.test.ts` 中尚未覆盖的 server/CLI 细节。
4. 评估 `test/realRequest.test.ts` 是否适合作为手动真实验收脚本，而不是默认自动测试。
