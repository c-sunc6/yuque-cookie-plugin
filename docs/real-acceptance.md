# 真实语雀验收流程

## 目的

`real:acceptance` 用于手动验证真实语雀 Web Session 链路。它替代 `yuque-dl/test/realRequest.test.ts` 的思路，但不会进入默认 `npm test`。

原因：

- 真实验收依赖网络、登录态和私有知识库权限。
- 默认测试不能依赖真实 `_yuque_session` 或 `yuque_ctoken`。
- 验收报告要能长期保存，便于回溯真实环境表现。

## 前置条件

先完成登录：

```bash
npm run yuque-local -- login
```

或使用环境变量：

```bash
export YUQUE_SESSION='your _yuque_session'
export YUQUE_CTOKEN='your yuque_ctoken'
```

不要把真实 Cookie 写入项目文件。

## 整库验收

```bash
npm run real:acceptance -- \
  --book-url https://www.yuque.com/xiaoxindexiaji/ydv5i5 \
  --dist-dir /tmp/yuque-real-acceptance
```

脚本会执行：

- `inspect` 真实知识库。
- 第一次 `download-book --incremental --quiet`。
- 第二次 `download-book --incremental --quiet`，验证未变化文档跳过。
- 检查 `index.md` 和 `progress.json` 是否生成。
- 输出并保存 JSON 报告到 `reports/real-acceptance-*.json`。

## 单篇或多篇验收

```bash
npm run real:acceptance -- \
  --doc-url https://www.yuque.com/user/book/doc1 \
  --doc-url https://www.yuque.com/user/book/doc2 \
  --dist-dir /tmp/yuque-real-docs
```

## 额外 Cookie

如果需要企业私有语雀、公开密码或特殊访问 Cookie：

```bash
npm run real:acceptance -- \
  --book-url https://www.yuque.com/user/book \
  --cookie-key verified_books \
  --cookie-value '<cookie-value>'
```

## 通过标准

报告中的 `ok` 应为 `true`。

整库验收至少应看到：

- `inspect-book.ok: true`
- `download-book-first.ok: true`
- `download-book-incremental.ok: true`
- `book-index.ok: true`
- `book-progress.ok: true`

如果 `warnings` 非空，说明主流程成功，但有图片、附件或音视频资源下载失败，需要人工评估是否接受。

## 注意

- 这个脚本是手动验收，不属于默认自动化测试。
- 它不会写入语雀线上文档，只读取并下载。
- 输出目录如果未指定，会使用系统临时目录。
- 报告里不会保存 Cookie 值。
