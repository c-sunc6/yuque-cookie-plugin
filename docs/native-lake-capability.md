# 语雀原生 Lake 写入能力矩阵

## 目标

本项目允许 AI 输入 Markdown、HTML 或本地文件，但写入语雀后的最终形态应尽可能是语雀编辑器原生 Lake 结构，而不是把 Markdown 文本硬塞进文档。

核心判断标准：

- 最终文档 `format` 应为 `lake`。
- `body_asl` / `body_draft_asl` 应包含语雀 Lake 节点、`data-lake-id`、卡片元数据等结构。
- 对复杂结构必须先通过真实语雀文档 snapshot before/after 验证，再固化自动化逻辑。
- 不使用纯文本伪装编辑器功能。例如标题编号不能写成标题文本里的 `1. 标题`。

## 当前已真实验证

| 能力 | 当前状态 | 原生证据 | 说明 |
| --- | --- | --- | --- |
| 文档创建 | 已验证 | `create-doc` 真实创建并加入 TOC | 不传 `--slug` 时由语雀自动生成文档 slug |
| 最终 Lake 化 | 已验证 | 创建后读取 `body_asl` 并通过 `/api/docs/:id/content` 写回 `format: lake` | `create-doc` 默认执行，除非显式传 `--no-native-lake` |
| 标题 | 已验证 | `<h1 data-lake-id="..." id="...">` | 由语雀 Markdown 导入生成，再 Lake 写回 |
| 段落 | 已验证 | `<p data-lake-id="..." id="...">` | 普通正文是 Lake 原生段落 |
| 行内代码 | 已验证 | `<code data-lake-id="...">` | 快照中已出现 |
| 无序列表 | 已验证 | `<ul list="..."><li data-lake-id="...">` | 语雀会生成 list id 和连续 start |
| 有序列表 | 已验证 | `<ol list="...">`、`start="2"` | 真实快照显示语雀会拆成连续 Lake 列表节点 |
| 嵌套列表 | 已验证 | `data-lake-indent="1"` | 真实快照显示二级列表使用缩进属性 |
| 引用块 | 已验证 | `<blockquote data-lake-id="...">` | 由 Markdown `>` 导入生成 |
| 分隔线 | 已验证 | `<card type="block" name="hr" value="data:...">` | 语雀使用 hr card |
| 加粗/斜体/删除线 | 已验证 | `<strong>`、`<em>`、`<del>` | 行内结构保留为 Lake 原生节点 |
| 普通链接 | 已验证 | `<a href="..." target="_blank" data-lake-id="...">` | 普通外链可原生写入 |
| 表格 | 已验证 | `<table class="lake-table">`、`<colgroup>`、`td/p/span` | 当前真实快照已经是 Lake 表格 |
| 代码块 | 已验证 | `<card type="inline" name="codeblock" value="data:...">` | 语雀使用 codeblock card，而不是普通 `<pre>` |
| 标题章节编号 | 已验证 | 标题节点 `data-lake-index-type="2"` | 这是编辑器原生编号；渲染层的 `lake-read-ignore` 编号 span 不应写入正文 |

## 当前待真实验证

| 能力 | 当前判断 | 下一步验证方式 |
| --- | --- | --- |
| 下划线 | 未单独验收 | 创建含 HTML `<u>` 的样例并 snapshot |
| bookmark 链接卡片 | 未验收 | 验证普通链接何时升级为 bookmark card |
| 图片 | 已验证 | `POST /api/upload/attach` + `<card type="inline" name="image" value="data:...">` | 已真实上传本地 PNG，写入 Lake，下载回本地资源无 warning |
| 附件/PDF | 已验证 | `POST /api/upload/attach` + `<card type="inline" name="file" value="data:...">` | file card 必须包含 `src` 和 `name`；`src` 使用 `/office/...pdf?from=...` 预览 URL，否则阅读页点击会变成 `about:blank` |
| 音视频 | 下载侧已有部分兼容；写入侧未支持 | 需要真实文档 before/after，确认 card name/value 结构 |
| 思维导图 | 未支持写入 | 需要手动创建一篇含思维导图的文档，snapshot 分析 card/resource 结构 |
| 画板 | 未支持写入 | 需要手动创建一篇含画板的文档，snapshot 分析 board/card/resource 结构 |
| 语雀表格/数据表等复杂卡片 | 未支持写入 | 先只保留、解析、diff，不主动生成 |

## 当前写入策略

`create-doc` 的默认策略是：

1. 使用 Web Session 创建 Markdown 文档，让语雀服务器先做一次 Markdown 到编辑器内容的转换。
2. 立即 snapshot 新文档，读取语雀生成的 `body_asl`。
3. 必要时只做经过真实验证的 Lake 变换，例如标题编号 `data-lake-index-type="2"`。
4. 通过安全 Lake 写入链路写回，生成备份和报告。

这样做的原因是：语雀自己的 Markdown 导入器比手写 Lake 更接近编辑器原生结构，尤其是表格、代码块、列表等结构。

## 禁止策略

- 禁止直接把章节编号写进标题文本。
- 禁止在未做 snapshot diff 前手写复杂 card。
- 禁止用 Markdown 覆盖已有 Lake 文档来做批量排版。
- 禁止静默丢弃图片、附件、思维导图、画板等资源。

## 图片和附件探索路线

图片、附件要达到原生写入，需要补齐上传链路：

1. 用真实测试文档手动插入一张图片和一个附件。
2. 分别 snapshot before/after，记录 `body_asl` card 结构。
3. 探索 Web Session 接口，重点参考已调研到的 `/api/upload/attach`。
4. 实现并真实验证 `upload-attach <doc-url> --file <file>`，只上传并输出返回 JSON，不先写入正文。
5. `insert-image` 已支持 dry-run 和真实写入。`insert-attachment` 已支持 PDF 附件真实写入，并保留 `downloadUrl/download_url` 供本地下载器使用。
6. 单篇真实文档 apply 后人工检查。

## 思维导图和画板探索路线

思维导图、画板属于复杂资源，不应直接猜结构。

1. 用户或 AI 在测试知识库中创建包含思维导图/画板的真实文档。
2. 使用 `snapshot` 保存原始 Lake。
3. 使用 `diff-lake` 和人工阅读 `body_asl` 分析 card name、value、resource id。
4. 先实现“识别和保留”，再考虑“创建和更新”。
5. 如果资源本体不在 `body_asl` 中，需要继续探索资源接口，不能只写 card 壳。

## 真实验收记录

- `reports/real-ai-use-numbered/snapshot-default-native-lake.json`
  - 验证标题、段落、列表、表格、代码块为 Lake 原生结构。
- `reports/real-ai-use-numbered/snapshot-lake-native-heading-number.json`
  - 验证标题编号原生写法为 `data-lake-index-type="2"`。
- `reports/real-ai-use-native-rich/snapshot-native-rich.json`
  - 验证有序列表、嵌套列表、引用、分隔线、加粗、斜体、删除线、普通链接均为 Lake 原生结构。
- `reports/real-ai-use-native-image/snapshot-after-image.json`
  - 验证本地 PNG 可通过 `/api/upload/attach` 上传，并以原生 image card 写入 Lake。
- `reports/real-ai-use-native-attachment/snapshot-after-a99-src-attachment.json`
  - 验证本地 PDF 可通过 `/api/upload/attach` 上传，并以 file card 写入 Lake。
  - 关键结论：语雀阅读页 file card 渲染读取 `src + name`，不是 `url/previewUrl`。`src` 必须是 `https://www.yuque.com/office/<filekey>?from=<doc-url>` 形式，才能打开语雀内置 PDF 预览。
  - `downloadUrl/download_url` 仍保留为附件下载地址，供 `download-doc` 资源落盘使用。

后续每补齐一种复杂内容，都必须在本文件追加真实验收记录。
