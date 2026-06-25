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

- 语雀个人/团队主页 URL，例如 `https://www.yuque.com/your-login/`
- `_yuque_session`
- `yuque_ctoken`

保存后页面会显示 `Saved`，CLI 会自动退出。

配置文件会记录：

- `saved_at`
- `updated_at`
- `homeUrl`
- `last_validated_at`
- `last_failed_at`
- `last_validation_error`

验证配置是否可用：

```bash
npm run yuque-local -- auth-status https://www.yuque.com/<your-login>/<your-book>
```

成功时会输出 `valid: true`，并更新 `last_validated_at`。失败时会输出 `valid: false`，记录失败时间，并提示重新运行登录命令。

也可以只查看本地配置状态：

```bash
npm run yuque-local -- auth-status
```

正常执行 `inspect`、`snapshot`、`download-book`、`download-doc` 等真实语雀命令成功后，也会刷新 `last_validated_at`。如果检测到 401、403、页面无法解析等登录态问题，CLI 会提示重新登录。

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
npm run yuque-local -- download-book https://www.yuque.com/<your-login>/<your-book> --dist-dir /tmp/yuque-download-test --incremental
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

如果文档下载成功，但图片、附件或音视频资源下载失败，最终 JSON 和报告会包含 `warning_summary`：

```json
{
  "warning_summary": {
    "total": 1,
    "by_type": {
      "attachment": 1
    },
    "retryable_resources": [
      {
        "type": "attachment",
        "url": "https://www.yuque.com/attachments/error.pdf"
      }
    ]
  }
}
```

这表示主文档已经保存，但资源需要后续人工检查或单独补救。

下载成功后，最终 JSON 和报告还会包含 `resources`，用于让 AI 或脚本确认图片、附件、音视频等资源实际落盘情况：

```json
{
  "resources": {
    "total": 2,
    "by_type": {
      "image": 1,
      "attachment": 1
    },
    "total_size": 146111,
    "files": [
      {
        "type": "attachment",
        "path": "attachments/123459/test.pdf",
        "size": 46219
      }
    ]
  }
}
```

`resources.files` 只记录本地相对路径和大小，不保存 Cookie。

## 4.1 创建知识库和文档

创建私密测试知识库：

```bash
npm run yuque-local -- create-book \
  --name AI真实测试知识库 \
  --slug ai-real-test-book
```

在已有知识库中创建 Markdown 文档：

```bash
npm run yuque-local -- create-doc https://www.yuque.com/<your-login>/<your-book> \
  --title AI真实测试文档 \
  --markdown-file article.md
```

默认行为：

- 不传 `--slug`，由语雀自动生成文档 slug。
- 自动挂载到知识库目录根节点，返回值中 `toc_attached: true`。
- 输入文件可以是 Markdown。
- 创建后会立即读取语雀生成的 `body_asl`，再写回为 Lake，确保最终文档进入语雀原生 Lake 格式。
- 不默认修改标题文本。
- 返回 JSON 中 `format` 表示语雀创建接口的初始格式；如果默认 Lake 写回成功，会额外返回 `final_format: "lake"`。

## 4.2 上传和插入附件

只上传文件，不写入正文：

```bash
npm run yuque-local -- upload-attach <doc-or-book-url> --file ./example.pdf
```

上传并插入到文档正文：

```bash
npm run yuque-local -- insert-attachment <doc-url> \
  --file ./example.pdf \
  --after-text 图片位置
```

PDF 附件的原生写入规则：

- 文件先通过语雀 Web Session 上传，返回 `filekey`、`attachment_id` 和附件下载 URL。
- 正文写入 `file` card。
- `src` 必须是 `https://www.yuque.com/office/<filekey>?from=<doc-url>`，这是语雀阅读页打开 PDF 预览所需字段。
- `downloadUrl/download_url` 保留原始附件地址，供 `download-doc` 落盘资源使用。
- 如果 file card 只有 `url/previewUrl` 但没有 `src`，阅读页点击可能打开 `about:blank`。

如果需要符合“标题带层级编号”的阅读习惯，创建时加 `--number-headings`：

```bash
npm run yuque-local -- create-doc https://www.yuque.com/<your-login>/<your-book> \
  --title AI真实测试文档 \
  --markdown-file article.md \
  --number-headings
```

该参数不会把 `1.` 写进 Markdown 标题文本，而是在语雀生成 Lake 后给标题节点加语雀原生属性：

```html
<h1 data-lake-index-type="2">一级标题</h1>
```

这和在语雀编辑器里手动开启标题编号后的 Lake 结构一致。阅读页面会渲染出 `1.`、`1.1.`、`1.1.1.`，但编号不会混进标题正文。

调试时如果只想停留在语雀 Markdown 导入结果，不做最终 Lake 写回，可以加：

```bash
--no-native-lake
```

只有确实需要固定 URL 时才传 `--slug`：

```bash
npm run yuque-local -- create-doc https://www.yuque.com/<your-login>/<your-book> \
  --title AI真实测试文档 \
  --slug custom-doc-slug \
  --markdown-file article.md
```

如果只想创建可通过 URL 访问、但不加入目录的文档：

```bash
npm run yuque-local -- create-doc https://www.yuque.com/<your-login>/<your-book> \
  --title AI真实测试文档 \
  --markdown-file article.md \
  --no-toc
```

真实验收结论：

- `create-book` 已通过真实语雀验证，可以创建私密知识库。
- `create-doc` 已通过真实语雀验证，可以创建真实文档，默认让语雀生成 slug，并自动加入知识库 TOC。
- 语雀会把 Markdown 创建结果自动转换成 Lake 文档，工具随后会默认写回 Lake，后续修改应按 Lake 链路处理。
- 当前原生写入能力矩阵见 `docs/native-lake-capability.md`。图片、附件、思维导图、画板属于下一阶段真实探索项，不能在未验证前手写 card。

## 4.2 上传图片或附件探索

只上传本地文件，不写入正文：

```bash
npm run yuque-local -- upload-attach https://www.yuque.com/user/book/doc \
  --file /path/to/image.png
```

该命令使用 Web Session 调用语雀网页端上传接口：

```text
POST /api/upload/attach
```

当前用途是探索图片/附件的原生返回结构。上传成功后会输出 `upload` 返回体和本地报告路径，但不会自动生成 Lake card，也不会修改线上文档正文。

上传并插入本地图片到语雀文档：

```bash
npm run yuque-local -- insert-image https://www.yuque.com/user/book/doc \
  --file /path/to/image.png \
  --dry-run
```

确认 dry-run 后实际写入：

```bash
npm run yuque-local -- insert-image https://www.yuque.com/user/book/doc \
  --file /path/to/image.png
```

默认追加到文档末尾。如果要插入到包含某段文字的块后面：

```bash
npm run yuque-local -- insert-image https://www.yuque.com/user/book/doc \
  --file /path/to/image.png \
  --after-text "图片应插入在这里。"
```

注意：`insert-image --dry-run` 会真实上传图片以获得语雀 CDN URL，但不会修改文档正文。

上传并插入附件到语雀文档：

```bash
npm run yuque-local -- insert-attachment https://www.yuque.com/user/book/doc \
  --file /path/to/file.pdf \
  --dry-run
```

确认 dry-run 后实际写入：

```bash
npm run yuque-local -- insert-attachment https://www.yuque.com/user/book/doc \
  --file /path/to/file.pdf
```

和图片一样，`insert-attachment --dry-run` 会真实上传附件以获得语雀附件 URL，但不会修改文档正文。

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

只生成或检查 VitePress 配置，不启动长驻服务：

```bash
npm run yuque-local -- serve-book /tmp/yuque-download-test/工控 --config-only
```

该命令会输出 JSON，包含：

- `root`
- `config`
- `generated`

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
- 下载 `https://www.yuque.com/<your-login>/<your-book>`。
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
