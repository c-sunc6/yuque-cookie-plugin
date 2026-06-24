# Yuque Cookie Plugin 中文使用指南

## 1. 项目定位

`yuque-cookie-plugin` 是一个本地 CLI 工具，目标是让 AI 通过浏览器同款 Web Session 操作语雀，而不是走语雀 personal token、OpenAPI token、Skill 或 MCP。

核心认证方式：

- `_yuque_session`
- `yuque_ctoken`

这两个值来自你浏览器里已经登录语雀后的 Cookie。工具会把它们保存到本机用户配置目录：

```bash
~/.config/yuque-cookie-plugin/config.json
```

项目目录不会保存真实 Cookie。

## 2. 安装和准备

进入项目目录：

```bash
cd /home/mi/文档/yuque-cookie-plugin
```

安装依赖：

```bash
npm install
```

检查工具是否可运行：

```bash
npm run yuque-local -- --help
```

## 3. 登录

运行：

```bash
npm run yuque-local -- login
```

命令会打开本地网页，地址类似：

```text
http://127.0.0.1:34567/
```

在网页中填写：

- `_yuque_session`
- `yuque_ctoken`

保存后页面会显示 `Saved`，CLI 会自动退出。

验证配置是否可用：

```bash
npm run yuque-local -- inspect https://www.yuque.com/xiaoxindexiaji/ydv5i5
```

成功时会输出知识库 id、slug、名称、TOC 数量和当前用户信息。

### 额外 Cookie

默认认证仍然是：

- `_yuque_session`
- `yuque_ctoken`

如果遇到企业私有语雀或公开密码访问场景，需要额外 Cookie，例如 `verified_books`，可以在命令中临时传入：

```bash
npm run yuque-local -- inspect https://www.yuque.com/user/book \
  --cookie-key verified_books \
  --cookie-value '<cookie-value>'
```

也可以使用环境变量：

```bash
export YUQUE_EXTRA_COOKIE_KEY='verified_books'
export YUQUE_EXTRA_COOKIE_VALUE='<cookie-value>'
```

额外 Cookie 不会改变本项目的主链路，只用于兼容特殊访问场景。

## 4. 下载整个知识库

推荐先下载到临时目录验证：

```bash
npm run yuque-local -- download-book https://www.yuque.com/xiaoxindexiaji/ydv5i5 --dist-dir /tmp/yuque-download-test --incremental
```

输出会显示逐篇进度：

```text
Downloading book "工控" (15 docs) -> /tmp/yuque-download-test/工控
[1/15] 工厂工程师学C#，第一天能干啥？
  saved: 工厂工程师学C#，第一天能干啥？.md
```

完成后会输出 JSON 摘要：

```json
{
  "ok": true,
  "docs": 15,
  "downloaded": 15,
  "skipped": 0,
  "failures": []
}
```

第二次使用 `--incremental` 时，如果文档没有变化，会跳过：

```json
{
  "downloaded": 0,
  "skipped": 15
}
```

下载产物包括：

- Markdown 文档
- `index.md`
- `progress.json`
- `img/`
- `attachments/`
- 本地报告 `reports/download-book-*.json`

如果部分文档失败，最终 JSON 和本地报告会包含 `retry`：

```json
{
  "retry": {
    "command": "download-doc",
    "urls": ["https://www.yuque.com/user/book/failed-doc"],
    "args": ["download-doc", "https://www.yuque.com/user/book/failed-doc", "--dist-dir", "download"]
  }
}
```

AI 或脚本可以用 `retry.args` 只重试失败文档。

## 5. 下载单篇或多篇文档

下载单篇：

```bash
npm run yuque-local -- download-doc https://www.yuque.com/user/book/doc --dist-dir /tmp/yuque-doc-test
```

下载多篇：

```bash
npm run yuque-local -- download-doc \
  https://www.yuque.com/user/book/doc1 \
  https://www.yuque.com/user/book/doc2 \
  --dist-dir /tmp/yuque-doc-test
```

## 6. 本地预览下载结果

下载完成后可以启动 VitePress 预览：

```bash
npm run yuque-local -- serve-book /tmp/yuque-download-test/工控 --port 5173
```

浏览器打开：

```text
http://localhost:5173/
```

如需重新生成 `.vitepress` 配置：

```bash
npm run yuque-local -- serve-book /tmp/yuque-download-test/工控 --port 5173 --force
```

## 7. 快照和差异比较

抓取语雀文档快照：

```bash
npm run yuque-local -- snapshot https://www.yuque.com/user/book/doc --out /tmp/doc.snapshot.json
```

比较两个快照：

```bash
npm run yuque-local -- diff-lake /tmp/before.json /tmp/after.json
```

把快照转成 AI 可读 Markdown：

```bash
npm run yuque-local -- lake-to-markdown /tmp/doc.snapshot.json --out /tmp/doc.md
```

## 8. HTML 转语雀 Lake

把本地 HTML 交给语雀 Lake editor runtime 序列化：

```bash
npm run yuque-local -- editor-serialize --html-file article.html --out article.lake.html
```

如果输出中有：

```json
"serializer": "official-lake-editor"
```

说明使用的是 vendored Lake editor，而不是 fallback。

## 9. 安全写入语雀文档

强烈建议先 dry-run：

```bash
npm run yuque-local -- apply-lake https://www.yuque.com/user/book/doc --lake-file article.lake.html --dry-run
```

确认报告没有异常后再写入：

```bash
npm run yuque-local -- apply-lake https://www.yuque.com/user/book/doc --lake-file article.lake.html
```

真实写入前会自动生成 snapshot 备份：

```text
backups/
```

写入报告会生成在：

```text
reports/
```

## 10. 文章格式化流程

本地 HTML 到语雀文档的完整流程：

```bash
npm run yuque-local -- format-article https://www.yuque.com/user/book/doc --html-file article.html --dry-run
```

确认无误后：

```bash
npm run yuque-local -- format-article https://www.yuque.com/user/book/doc --html-file article.html
```

## 11. 常用选项

忽略图片下载：

```bash
--ignore-img
```

忽略所有附件：

```bash
--ignore-attachments
```

只忽略指定附件后缀：

```bash
--ignore-attachments mp4,pdf,zip
```

为每篇 Markdown 添加 TOC：

```bash
--toc
```

隐藏页脚：

```bash
--hide-footer
```

把 Markdown 中的 mp4/mp3 链接转成 HTML 标签：

```bash
--convert-markdown-video-links
```

关闭下载过程中的逐篇进度，只保留最后 JSON：

```bash
--quiet
```

默认情况下，下载进度会写到 stderr，最终结果 JSON 会写到 stdout。这样人可以看到进度，AI 或脚本也可以稳定解析最后的 JSON。

如果需要严格的 JSON 输出，建议加 `--quiet`。

## 12. 安全规则

- 不要把真实 `_yuque_session` 或 `yuque_ctoken` 写入项目文件。
- 不要提交 `~/.config/yuque-cookie-plugin/config.json`。
- 线上写入必须先 dry-run。
- 批量写入前先对单篇文档做实验。
- 章节编号不要直接改标题文本硬塞编号，必须先做 snapshot before/after diff。

## 13. 当前已验证场景

已真实验证：

- 登录保存 Cookie。
- `inspect` 读取私有知识库。
- 下载 `https://www.yuque.com/xiaoxindexiaji/ydv5i5`。
- 15 篇 Markdown 文档下载成功。
- 第二次增量下载全部跳过。
- 导出文件名保留正常空格。

## 14. 当前未完全覆盖场景

仍需继续补齐：

- yuque-dl 全量测试用例迁移。
- 复杂 sheet 文档。
- 复杂音视频卡片。
- 公开密码访问的 `verified_books` / `verified_docs`。
- 企业私有语雀自定义 Cookie key。
