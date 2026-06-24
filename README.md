# yuque-cookie-plugin

Local Yuque Web Session Automation Toolkit for AI agents.

The first principle of this project is to let AI operate Yuque freely through the same web-session path a human browser uses. It uses `_yuque_session` and `yuque_ctoken` against Yuque web endpoints as the primary route, because Yuque personal tokens and OpenAPI/MCP-style access can hit rate limits or deployment friction.

This is not a token-based OpenAPI wrapper. It is a local command surface for AI to continuously inspect, organize, format, diff, and safely update Yuque documents with behavior close to the Yuque web editor.

The local editor bridge uses Playwright and vendored Lake editor assets in `vendor/lake-editor/`, sourced from `ilimei/vscode-plugin-lake-editor`, to serialize HTML into editor-native Lake when available.

## Setup

```bash
cd /home/mi/文档/yuque-cookie-plugin
npm install
npm run yuque-local -- login
```

`login` opens a local browser page where you can paste `_yuque_session` and `yuque_ctoken`.
Credentials are saved to `~/.config/yuque-cookie-plugin/config.json` with `0600` permissions.
If a command needs credentials and none are configured yet, the CLI opens this page automatically.

Environment variables still override saved credentials:

```bash
export YUQUE_SESSION='your _yuque_session'
export YUQUE_CTOKEN='your yuque_ctoken'
```

## Commands

```bash
npm run yuque-local -- inspect https://www.yuque.com/user/book/doc
npm run yuque-local -- login
npm run yuque-local -- snapshot https://www.yuque.com/user/book/doc --out /tmp/doc.snapshot.json
npm run yuque-local -- diff-lake before.json after.json
npm run yuque-local -- editor-serialize --html-file article.html --out article.lake.html
npm run yuque-local -- apply-lake https://www.yuque.com/user/book/doc --lake-file article.lake.html --dry-run
npm run yuque-local -- lake-to-markdown /tmp/doc.snapshot.json --out /tmp/doc.md
npm run yuque-local -- format-article https://www.yuque.com/user/book/doc --html-file article.html --dry-run
npm run yuque-local -- update-lake https://www.yuque.com/user/book/doc --lake-file changed.body_asl.html
npm run yuque-local -- download-book https://www.yuque.com/user/book --dist-dir download --incremental
npm run yuque-local -- download-doc https://www.yuque.com/user/book/doc --dist-dir download
npm run yuque-local -- serve-book download/知识库 --port 5173
```

`editor-serialize` prints `serializer: "official-lake-editor"` when the real Lake editor runtime is available. If the vendored assets are missing, it falls back to a simpler local serializer.

## Workflow For Editor Parity

1. `snapshot` a document before manual editing.
2. Manually edit in Yuque web editor.
3. `snapshot` again.
4. Run `diff-lake` to discover exactly what the editor changed.
5. Implement a focused transform in `src/lake-transform.ts`.

## Development

Core implementation lives in TypeScript under `src/`. The `bin/yuque-local.mjs` file is only a thin executable wrapper.

```bash
npm run typecheck
npm run yuque-local -- --help
npm run real:acceptance -- --book-url https://www.yuque.com/user/book --dist-dir /tmp/yuque-real-acceptance
```

## Yuque-dl Migration

This project now includes native TypeScript downloader commands inspired by `gxr404/yuque-dl`. They are not external shell calls; the capabilities are being migrated into this codebase and adapted to the web-session auth path.

Current migrated downloader capabilities:

- download a whole knowledge base with TOC folder structure
- download one or more documents as Markdown
- generate `index.md` summary
- keep `progress.json` for incremental runs
- download Markdown images locally when possible
- repair Markdown image URLs from Yuque's raw HTML image cards before localizing images
- download Yuque attachment links locally when possible
- download Yuque audio/video cards locally when possible
- write local downloader reports under `reports/`
- start a VitePress preview server for a downloaded book, with sidebar order based on `progress.json`

Still being improved:

- full sheet conversion parity across real Yuque sheet variants
- richer retry/progress UI parity
- complex real audio/video fixture validation

## Research Memory

- `docs/usage-zh.md` is the Chinese usage guide for installing, logging in, downloading, previewing, snapshotting, serializing, and safely writing Yuque documents.
- `docs/real-acceptance.md` explains the manual real-Yuque acceptance flow that uses saved cookies but stays out of default tests.
- `docs/yuque-dl-test-migration.md` tracks the yuque-dl test migration status and remaining parity gaps.
- `docs/principles.md` is the project constitution: why web-session automation exists and what design tradeoffs are non-negotiable.
- `docs/project-memory.md` keeps the current project direction, verified Yuque web flow, and safety rules.
- `docs/development-plan.md` keeps the phased development roadmap, technical design, and iteration log.
- `docs/research-yuque-export-to-markdown.md` summarizes `PZh101/YuqueExportToMarkdown` and its Lake parsing lessons.
- `docs/research-yuque-official-repos.md` summarizes official Yuque repos, especially the cookie/web-api and Lake editor patterns in `yuque-chrome-extension`.

## Safety

- Secrets are read from environment variables or `~/.config/yuque-cookie-plugin/config.json`; they are never written into the project directory.
- `update-lake` creates a local backup before writing.
- Prefer one-document experiments before batch updates.
