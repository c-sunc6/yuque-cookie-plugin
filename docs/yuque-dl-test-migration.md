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
Test Files  8 passed
Tests       31 passed
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
- 第二次增量下载跳过未变文档

## 尚未迁移的 yuque-dl 测试

以下测试还没有完整迁移或只完成了首批覆盖：

- `test/cli.test.ts`
- `test/index.test.ts`
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

### API 认证

yuque-dl 支持 `-k --key` 和 `-t --token`。本项目核心路线是 `_yuque_session + yuque_ctoken`，还没有完整支持企业私有服务自定义 cookie key。

## 下一步

1. 增加 CLI 子进程测试，覆盖 `download-book`、`download-doc`、`serve-book`。
2. 迁移 `index.test.ts`，覆盖整库入口级行为。
3. 扩展 `download/article` 对 custom key、音视频 card、附件失败报告的测试。
4. 迁移 yuque-dl snapshot 测试，或改造成更稳定的结构化断言。
5. 决定是否实现 yuque-dl 的 `ProgressBar` parity，或将测试改为本项目的 stderr progress 模式。
