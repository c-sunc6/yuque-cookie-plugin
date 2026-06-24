# Yuque Cookie Plugin Development Plan

## Summary

目标是在本地构建一个非 MCP、非 OpenAPI token 的语雀 CLI 插件，让 AI 通过 `_yuque_session` 和 `yuque_ctoken` 读取、整理、序列化、对比并安全写入语雀 Lake 文档。

第一原则：这个项目的核心目的，是让 AI 通过网页 Session 像人在浏览器中一样自由操作语雀，避开语雀专属 token / OpenAPI / MCP 路径可能带来的限流与部署摩擦。详细原则见 `docs/principles.md`。

核心约束：

- Web Session 是核心认证路径，不是兜底方案。
- 本地运行，不部署 MCP 服务。
- 不把 Yuque personal token 作为主链路。
- Cookie 只读环境变量或 `~/.config/yuque-cookie-plugin/config.json`。
- 不把真实 cookie 写入仓库。
- 所有线上写入前必须生成 snapshot 备份。
- 现有 Lake 文档优先保持编辑器语义，不用粗暴 Markdown 覆盖。
- 章节编号必须先通过手动编辑前后 snapshot diff 确认语雀编辑器表示方式。

## Roadmap

### Phase 1: Editor Bridge First

目标：打通 HTML 到 Lake 的本地序列化链路，让后续文章排版尽量接近语雀编辑器行为。

交付物：

- `editor-serialize --html-file <file> --out <lake-file>`
- Playwright 本地页面序列化流程。
- `vendor/lake-editor/` 存放来自 `ilimei/vscode-plugin-lake-editor/media/editor` 的 Lake editor 静态资源。
- 资源存在时使用 `window.Doc.createOpenEditor` 官方编辑器序列化，输出 `serializer: official-lake-editor`。
- 若官方资源缺失，使用可预测的本地 fallback serializer，并在输出中标记 `serializer: fallback`。

验收：

- 标题、段落、列表、代码块、分隔线、加粗、链接能序列化为非空 Lake-like 内容。
- 同一 HTML 输入重复输出稳定。
- 输出不会直接写入线上语雀文档。

### Phase 2: Safe Write Loop

目标：把写入变成可预览、可备份、可追踪的安全流程。

交付物：

- `apply-lake <doc-url> --lake-file <file> --dry-run`
- `apply-lake <doc-url> --lake-file <file>`
- 写入报告：doc id、slug、备份路径、写入时间、dry-run 状态、结果。
- `update-lake` 增加格式、空内容和体积变化校验。

验收：

- `--dry-run` 不调用线上写入接口。
- 真实写入前必定 snapshot。
- `format !== lake`、缺失 `draft_version`、空 Lake 文件时拒绝写入。

### Phase 3: Lake Parser And Diff

目标：让 AI 更可靠地理解语雀文档结构，减少人工判断成本。

交付物：

- DOM-based Lake parser。
- `lake-to-markdown <snapshot.json> --out <file>`
- 增强 `diff-lake`：heading、attrs、`data-lake-id`、cards、tables、lists、body 统计。

验收：

- 能从 snapshot 生成可读 Markdown。
- diff 输出能定位常见结构变化。
- 未知 card 不静默丢失。

### Phase 4: Article Formatting Workflow

目标：把本地文章整理、语雀 Lake 序列化、安全写入串成可重复流程。

交付物：

- `format-article <doc-url> --html-file <file> --dry-run`
- `format-article <doc-url> --html-file <file>`
- 针对文章排版的报告和备份路径。

验收：

- 本地 HTML 可转 Lake，再 dry-run 展示写入计划。
- apply 后能在语雀网页人工确认排版接近编辑器效果。
- 章节编号功能等待手动 before/after diff 后单独实现。

### Phase 5: Yuque-dl Downloader Parity

目标：不调用外部 `yuque-dl`，而是把其下载、批量备份、本地预览能力迁移到本项目，并改造成 Web Session 主链路。

交付物：

- `download-book <book-url>`：整库 TOC 遍历和本地目录生成。
- `download-doc <...doc-urls>`：单篇/多篇 Markdown 下载。
- 图片、附件本地化下载和链接改写。
- `progress.json` 增量下载。
- `index.md` summary 目录。
- `serve-book <book-path>` VitePress 本地预览。

验收：

- 私有知识库通过 `_yuque_session` 下载，不依赖 Yuque personal token。
- 中断后可复用 `progress.json` 增量跳过未变化文档。
- 下载结果可用 VitePress 预览。
- 表格、音视频、复杂附件继续补齐到 yuque-dl parity。

## Technical Design

CLI 层：

- `bin/yuque-local.mjs` 是 thin executable wrapper。
- `src/cli.ts` 负责参数解析、命令路由、错误提示。
- 写入类命令必须走 Cookie Client 的安全方法。

Cookie Client：

- `src/client-cookie.ts` 负责 Yuque web endpoints。
- 使用 cookie header、`x-csrf-token`、`x-requested-with`。
- 线上写入统一生成 snapshot 和 report。

Editor Bridge：

- `src/editor-bridge.ts` 使用 Playwright 启动本地 HTML 页面。
- 优先加载 `vendor/lake-editor/doc.umd.js`、`doc.css`、React、CodeMirror、KaTeX 等官方编辑器资源。
- fallback serializer 负责基础 HTML 到 Lake-like 的稳定转换。

Transform Pipeline：

- `src/lake-parser.ts` 解析 Lake-like HTML。
- `src/lake-markdown.ts` 输出 AI 可读 Markdown。
- `src/lake-diff.ts` 输出结构化 diff。

Reports：

- `reports/` 存放 dry-run 和 apply 报告。
- `backups/` 存放写入前 snapshot。

## Iteration Log

| Date | Goal | Done | Verification | Risks | Next |
| --- | --- | --- | --- | --- | --- |
| 2026-06-24 | Create implementation roadmap | Planned editor bridge, safe apply, parser, workflow | README links plan | Official Lake editor runtime assets are not vendored yet | Implement bridge and safe CLI commands |
| 2026-06-24 | Vendor Lake editor runtime | Copied assets from `ilimei/vscode-plugin-lake-editor/media/editor` into `vendor/lake-editor` | `editor-serialize` returns `official-lake-editor` | Asset license/version should be tracked when upgrading | Use official bridge for article formatting tests |
| 2026-06-24 | Migrate yuque-dl downloader core | Added native `download-book`, `download-doc`, `serve-book`, TOC folder generation, `progress.json`, image/attachment/media localization, Markdown image URL repair, downloader reports, and VitePress sidebar ordering from progress data | `npm run typecheck`, `npm run yuque-local -- --help`; later real validation downloaded private book `工控` successfully | Sheet/audio/video parity still needs real Yuque fixture validation | Continue migrating yuque-dl tests and complex media fixtures |
| 2026-06-24 | Replace regex Lake parser with DOM parser | Added `node-html-parser` and changed `parseLake` to traverse headings, cards, lists, tables, and paragraphs structurally | Local official-Lake snapshot passed `diff-lake` and `lake-to-markdown` checks | Markdown rendering still only supports common Lake cards | Extend unknown card reporting after real snapshots |
| 2026-06-24 | Real cookie login and private book download validation | Verified saved web-session credentials, fixed login server shutdown, downloaded `https://www.yuque.com/xiaoxindexiaji/ydv5i5` to `/tmp/yuque-download-test/工控`, and clarified downloader counters as `docs/downloaded/skipped` | `inspect` returned book `工控`; first `download-book` succeeded with 15 docs and 0 failures; second incremental run reported `downloaded: 0`, `skipped: 15`; `npm run typecheck` passed | Filename normalization currently removes spaces because it follows yuque-dl `fixPath` behavior | Decide whether to preserve spaces in exported filenames and add progress output during long downloads |
| 2026-06-24 | Improve downloader usability | Preserved normal spaces in exported filenames and added per-document progress output for saved/skipped/failed states | Real `download-book` exported readable filenames such as `Visual Studio 2026 完整安装、激活与 Copilot 配置指南.md`; second incremental run reported every doc as skipped and final `downloaded: 0`, `skipped: 15` | Progress currently writes plain lines, not a rich progress bar | Add retry summary and optional quiet/json mode if script consumers need pure stdout |
| 2026-06-24 | Start yuque-dl test migration | Added Vitest/MSW, copied core mock assets/data, and migrated first tests for download utils, sheet parsing, cookie client API mocks, Lake parser, and CLI help | `npm test` passes with 5 test files and 17 tests | Full yuque-dl test suite is not migrated yet | Continue with `download/article`, `attachments`, `list`, `summary`, and CLI subprocess tests |
| 2026-06-24 | Expand yuque-dl downloader tests | Added tests for article download, local images, unsupported doc placeholders, sheet docs, sanitized asset dirs, incremental article skip, attachment localization, summary generation, book list paths, title-doc `index.md`, and incremental book skip | `npm run test:unit` passes with 8 test files and 31 tests | CLI subprocess and some yuque-dl edge parity tests still pending | Add CLI/download-doc/serve-book subprocess tests and index-level tests |
| 2026-06-24 | Add download-doc and CLI behavior tests | Added `downloadDocs` tests for multi-doc success and partial failure, plus CLI subprocess tests for help, local command errors, and missing-credential login flow | `npm test` passes with 9 test files and 35 tests | True CLI download subprocess tests need a mock server reachable across processes | Build a standalone test server or route CLI tests through function-level coverage |
| 2026-06-24 | Add quiet downloader mode | Added `--quiet` / `DownloadOptions.quiet` to suppress progress lines while preserving final JSON, and enabled it in downloader tests | `npm test` passes with clean Vitest output and 35 tests | Real users still need default progress output, so quiet remains opt-in | Add a JSON-only mode only if downstream automation needs stricter stdout/stderr behavior |
| 2026-06-24 | Validate quiet mode against real Yuque | Ran real `download-book` for `https://www.yuque.com/xiaoxindexiaji/ydv5i5` with `--quiet` into `/tmp/yuque-quiet-real-test` | Result JSON reported `ok: true`, `docs: 15`, `downloaded: 15`, `failures: []`, `quiet: true` | npm still prints its own warning lines before script output | Direct bin execution can avoid npm warning noise when strict JSON output is needed |
| 2026-06-24 | Add serve-book config tests | Exported `createVitePressConfigForTest` and added tests for VitePress sidebar ordering, directory index links, and ignored runtime folders | `npm run test:unit` passes with 10 test files and 36 tests | Test covers config generation, not a live VitePress server process | Add CLI/server smoke test if needed |
| 2026-06-24 | Add extra cookie compatibility | Added `--cookie-key` / `--cookie-value`, env support, and `YuqueCookieClient.extraCookies` for enterprise/private-password compatibility while preserving `_yuque_session + yuque_ctoken` as the main route | Unit tests cover extra cookie header composition and CLI help | Special access scenarios still need real-world validation when available | Test with `verified_books` or enterprise Yuque sample if provided |
| 2026-06-24 | Expand utility and API branch tests | Added yuque-dl-inspired complex `fixInlineCode` cases plus client tests for missing doc appData and unparseable pages | Targeted tests pass; full suite expected to reach 43 tests | ProgressBar parity remains intentionally different | Continue with CLI server/download subprocess or media card edge tests |
| 2026-06-24 | Add media card tests | Added tests for Markdown video `_lake_card`, HTML audio card localization, and extension ignore behavior; fixed ignore matching for plain file paths like `inputs/prod/video.mp4` | Media tests pass; full suite expected to reach 46 tests | Complex real video API responses still need real fixtures | Validate against real docs containing audio/video cards when available |
| 2026-06-24 | Add CLI download subprocess tests | Added `--api-host`, a cross-process local Yuque mock HTTP server, and CLI tests for `download-book` and `download-doc` with `--quiet` | Targeted CLI download tests pass; full suite expected to reach 48 tests | `--api-host` is mostly for tests/enterprise deployments and should stay secondary to normal Yuque URLs | Keep docs clear that normal users do not need `--api-host` |
| 2026-06-24 | Add download warning reports | Added optional warnings collection for image, attachment, and media localization failures; `download-book` and `download-doc` now include warnings in JSON results and reports | Full suite passes with 49 tests | Warnings are not yet summarized in CLI prose because final JSON remains the primary interface | Add real fixture coverage for complex audio/video failures |
| 2026-06-24 | Expand serve-book tests | Made `serveBook` return the VitePress server and accept an injectable server factory, then added tests for host/port, existing config preservation, `force` regeneration, and missing paths | Targeted serve-book tests and typecheck pass; full suite expected to reach 54 tests | Tests intentionally avoid launching a long-running real VitePress process | Add CLI-level serve-book smoke only if it can exit cleanly |
| 2026-06-24 | Add CLI failure parity | Added real CLI tests for `download-doc` partial failure and invalid URL failure; adjusted `download-doc` so all-failed runs exit with code 1 while keeping structured JSON output | Targeted CLI download tests pass; full suite expected to reach 56 tests | JSON-first failure output differs from yuque-dl's prose output but is better for automation | Continue converting snapshot expectations into structural assertions |
| 2026-06-24 | Add manual real acceptance | Added `scripts/real-acceptance.ts`, `npm run real:acceptance`, and `docs/real-acceptance.md` to replace skipped yuque-dl realRequest tests with explicit manual validation | Script fails fast without `--book-url` or `--doc-url`; full test suite remains independent of real network/cookies | Real acceptance still depends on the user's current Yuque session and network state | Run against private book periodically after major downloader changes |
| 2026-06-24 | Decide progress output strategy | Chose stderr line progress plus stdout final JSON instead of copying yuque-dl's dynamic ProgressBar; added CLI test for non-quiet progress routing | Targeted CLI download tests pass; full suite expected to reach 57 tests | Less visually rich than yuque-dl's progress bar | Keep stdout machine-readable and use `--quiet` for strict automation |
| 2026-06-24 | Add TOC link parity | Added handling for Yuque TOC `LINK` nodes: do not download them as docs, keep external links in `index.md`, and record link warnings in download reports | Targeted book download tests pass; full suite expected to reach 58 tests | Real Yuque link node variants may include additional fields beyond current fixture | Validate against a real knowledge base containing external links |
| 2026-06-24 | Add retry report plans | Added structured `retry` plans to `download-book` and `download-doc` reports so failed docs can be retried via `download-doc` with preserved options | Targeted book/doc download tests and typecheck pass; full suite expected to reach 60 tests | Retry plans cover failed documents, not failed media resources yet | Consider media retry/report grouping after complex real fixtures |

## Safety Notes

- 不要提交真实 `_yuque_session` 或 `yuque_ctoken`。
- 不要把核心工作流退回 token/OpenAPI/MCP 路线。
- 不要再用“直接改标题文本”的方式实现章节编号。
- 不确定 Lake 语义时，先 snapshot、diff、单文档实验。
