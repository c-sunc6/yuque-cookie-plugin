# Yuque Cookie Plugin Project Memory

Project path: `/home/mi/文档/yuque-cookie-plugin`

Workspace path: `/home/mi/文档/yuquebk`

Goal: build a local Yuque Web Session Automation Toolkit so AI can freely inspect, organize, format, diff, and safely update Yuque documents through `_yuque_session` and `yuque_ctoken`, avoiding Yuque personal-token rate limits and MCP deployment friction.

First principle: this project exists to let AI operate Yuque through the same web-session path a human browser uses. See `docs/principles.md`.

## User Intent

The user wants to avoid:

- MCP deployment/config overhead.
- Yuque OpenAPI token rate limits.
- crude Markdown rewrites that lose Yuque editor formatting.

The user's core purpose is not just import/export. The purpose is to let AI continuously operate Yuque with fewer limits, using web-session auth as the primary route.

The preferred auth path is:

- `_yuque_session`
- `yuque_ctoken`

The preferred edit model is:

- read and write Yuque web `body_asl` / `body_draft_asl`
- snapshot before writing
- learn editor behavior from before/after diffs
- avoid blind text hacks

## Current CLI Commands

```bash
cd /home/mi/文档/yuque-cookie-plugin
npm run yuque-local -- login
npm run yuque-local -- inspect <doc-or-book-url>
npm run yuque-local -- snapshot <doc-url> --out <file>
npm run yuque-local -- diff-lake <before.json> <after.json>
npm run yuque-local -- editor-serialize --html-file <file> --out <lake-file>
npm run yuque-local -- apply-lake <doc-url> --lake-file <body_asl.html> [--dry-run]
npm run yuque-local -- lake-to-markdown <snapshot.json> --out <file>
npm run yuque-local -- format-article <doc-url> --html-file <file> [--dry-run]
npm run yuque-local -- update-lake <doc-url> --lake-file <body_asl.html>
npm run yuque-local -- download-book <book-url> [--dist-dir download] [--incremental]
npm run yuque-local -- download-doc <...doc-urls> [--dist-dir download]
npm run yuque-local -- serve-book <book-path> [--port 5173]
```

`login` opens a local web form where the user can paste cookies. Credentials are saved outside the repo:

```text
~/.config/yuque-cookie-plugin/config.json
```

Do not write cookies into project files.

## Verified Web Flow

For Lake docs:

1. Fetch the Yuque document page and parse app data.
2. Get edit document:

   ```http
   GET /api/docs/{doc_id}?book_id={book_id}&mode=edit
   ```

3. Read:

   - `body_asl`
   - `body_draft_asl`
   - `draft_version`

4. Save content:

   ```http
   PUT /api/docs/{doc_id}/content
   ```

   Payload:

   ```json
   {
     "id": 123,
     "body_asl": "...",
     "body_draft_asl": "...",
     "format": "lake",
     "save_type": "user",
     "draft_version": 1
   }
   ```

5. Publish:

   ```http
   PUT /api/docs/{doc_id}/publish
   ```

This flow was verified against:

```text
https://www.yuque.com/xiaoxindexiaji/ydv5i5/ia2025-csharp-004
```

The inspected document was Lake format with:

- document id: `274994361`
- slug: `ia2025-csharp-004`
- book id: `75919861`

## Important Lesson From Heading Numbering

A previous experiment inserted heading numbers directly into heading text spans, such as:

```markdown
### 1. title
#### 2.1. title
```

In the Yuque editor this displayed as duplicate numbering, such as `1. 1.`. The change was reverted.

Conclusion:

- Do not implement heading numbering by editing heading text.
- Yuque editor likely stores numbering through attributes, generated structure, or editor behavior.
- We need a before/after diff from a manual editor edit.

Recommended experiment:

```bash
cd /home/mi/文档/yuque-cookie-plugin
npm run yuque-local -- snapshot <doc-url> --out /tmp/before-numbering.json
# user manually edits numbering in Yuque web editor
npm run yuque-local -- snapshot <doc-url> --out /tmp/after-numbering.json
npm run yuque-local -- diff-lake /tmp/before-numbering.json /tmp/after-numbering.json
```

## Research Conclusions

See:

- `docs/research-yuque-export-to-markdown.md`
- `docs/research-yuque-official-repos.md`

Short version:

- `PZh101/YuqueExportToMarkdown` teaches Lake parsing and Lakebook export structure.
- `yuque/yuque-chrome-extension` validates cookie + CSRF + web API usage and shows official Lake editor serialization.
- `yuque/yuque-mcp-server` is useful for schemas but uses token/MCP.
- `yuque/yuque-ecosystem` is useful for plugin/skill organization but uses MCP.
- `yuque/yuque-cli` is useful for minimal CLI UX but uses OpenAPI token.

## Next Development Priorities

1. Continue yuque-dl parity migration and test coverage.

   Current native downloader covers whole-book download, multi-doc download, image/attachment/media localization, `progress.json`, `index.md`, incremental skip, VitePress config generation, quiet mode, CLI subprocess tests, and download warning reports. Remaining work is mainly CLI/server edge coverage, stable replacements for old snapshot tests, complex real audio/video fixtures, and deciding the final ProgressBar strategy.

2. Keep improving Lake/editor workflows.

   DOM-based parsing, `lake-to-markdown`, `diff-lake`, `editor-serialize`, `apply-lake`, and `format-article` already exist. Continue validating them against real Yuque snapshots before encoding formatting transforms.

3. Add upload support.

   Follow `yuque-chrome-extension`'s `/api/upload/attach` pattern.

4. Add a safe batch workflow.

   Batch write commands should:

   - snapshot every doc first
   - apply one transform
   - write one doc at a time
   - publish
   - create a local report

## Safety Rules

- Never echo or commit `_yuque_session` or `yuque_ctoken`.
- Snapshot before every write.
- Prefer single-document experiments before batch edits.
- If a transform changes unknown cards, stop and inspect.
- Do not assume Markdown preview equals Lake editor state.
- Do not move the core workflow back to Yuque personal tokens, OpenAPI, or MCP unless explicitly building an optional compatibility path.
