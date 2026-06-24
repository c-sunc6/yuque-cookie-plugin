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
Test Files  5 passed
Tests       17 passed
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

## 尚未迁移的 yuque-dl 测试

以下测试还没有完整迁移：

- `test/cli.test.ts`
- `test/index.test.ts`
- `test/download/article.test.ts`
- `test/download/attachments.test.ts`
- `test/download/list.test.ts`
- `test/parse/summary.test.ts`
- `test/realRequest.test.ts`
- 原 snapshot 测试
- 原 ProgressBar 测试

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

1. 迁移 `download/article.test.ts`，补齐文档类型、附件、图片、sheet、错误分支。
2. 迁移 `download/attachments.test.ts`。
3. 迁移 `download/list.test.ts` 和 `parse/summary.test.ts`。
4. 增加 CLI 子进程测试，覆盖 `download-book`、`download-doc`、`serve-book`。
5. 决定是否实现 yuque-dl 的 `ProgressBar` parity，或将测试改为本项目的 stderr progress 模式。
