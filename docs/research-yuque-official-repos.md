# Yuque Official Repositories Research Notes

GitHub org: https://github.com/orgs/yuque/repositories

Checked on: 2026-06-24

The public GitHub organization currently lists 22 repositories. For our local cookie-based Yuque tool, the most relevant repos are:

- `yuque/yuque-ecosystem`
- `yuque/yuque-mcp-server`
- `yuque/yuque-cli`
- `yuque/yuque-chrome-extension`
- older SDK/OpenAPI metadata repos such as `yuque/sdk`

Local clones used during research:

- `/tmp/yuque-ecosystem`
- `/tmp/yuque-mcp-server`
- `/tmp/yuque-cli`
- `/tmp/yuque-chrome-extension`

## Summary

The official MCP and CLI projects are token/OpenAPI oriented. They are good references for tool schema, UX, and knowledge workflows, but they do not match the user's desired "cookie session, no MCP, no OpenAPI token limit" architecture.

The official Chrome extension is the most important technical reference. It uses browser cookies, reads `yuque_ctoken`, sends CSRF headers, calls Yuque web endpoints, uploads attachments, embeds the Lake editor, and serializes content as Lake.

## yuque-ecosystem

Repo: https://github.com/yuque/yuque-ecosystem

Important local paths:

- `/tmp/yuque-ecosystem/plugins/yuque-personal/.claude-plugin/plugin.json`
- `/tmp/yuque-ecosystem/plugins/yuque-personal/.mcp.json`
- `/tmp/yuque-ecosystem/plugins/yuque-personal/skills/`
- `/tmp/yuque-ecosystem/shared/mcp-config/`

What it is:

- A packaging and distribution repo for AI clients.
- Contains plugin metadata, skill instructions, MCP config templates, and website docs.
- The personal plugin advertises `16 MCP Tools + 8 Skills`.

Why it is useful:

- Good model for organizing installable AI behavior.
- Skills show the workflow layer: daily capture, note refinement, smart search, stale detection, etc.
- It separates "agent instructions" from "tool execution", which is a good design for our local CLI.

Why it is not enough:

- It depends on `yuque-mcp@latest`.
- `.mcp.json` injects `YUQUE_TOKEN` into an MCP server.
- It does not implement low-level cookie requests or Lake editor serialization.

Implication for our project:

- We can borrow the plugin layout idea, README style, and workflow decomposition.
- We should not depend on MCP as the runtime path.

## yuque-mcp-server

Repo: https://github.com/yuque/yuque-mcp-server

Important local paths:

- `/tmp/yuque-mcp-server/src/services/yuque-client.ts`
- `/tmp/yuque-mcp-server/src/tools/doc.ts`
- `/tmp/yuque-mcp-server/src/tools/book.ts`
- `/tmp/yuque-mcp-server/src/tools/toc.ts`
- `/tmp/yuque-mcp-server/src/tools/resource.ts`
- `/tmp/yuque-mcp-server/src/cli-install.ts`

What it is:

- An MCP server around Yuque OpenAPI.
- Uses personal tokens, client config installation, and MCP tool schemas.

Useful ideas:

- Tool naming and argument schemas.
- Error handling conventions.
- Book/doc/toc/resource boundaries.
- `include_lake` support exists because preserving Lake is necessary for diagrams and rich content.

Limitations for us:

- Token-based, so it can still hit the user's rate-limit concern.
- Requires MCP runtime/deployment or client config.
- OpenAPI does not behave exactly like the web editor for rich Lake documents.

Implication for our project:

- Reuse conceptual command names, not the transport.
- Our `inspect`, `snapshot`, `diff-lake`, and `update-lake` commands are aligned with the same domain boundaries but use web endpoints.

## yuque-cli

Repo: https://github.com/yuque/yuque-cli

Important local path:

- `/tmp/yuque-cli/src/api.js`

What it is:

- A simple Node CLI around Yuque `/api/v2`.
- Reads a token from config, sends `X-Auth-Token`, and provides commands for users, repos, docs, search, and create.

Useful ideas:

- Minimal CLI UX.
- Namespace encoding for `user/book`.
- A clean request wrapper.

Limitations for us:

- Uses `X-Auth-Token`.
- Uses `/api/v2`, not web `/api/docs`.
- It does not handle `body_asl`, drafts, publish flow, or editor-grade Lake serialization.

Implication for our project:

- Keep our CLI simple like this, but use cookie auth and web endpoints.

## yuque-chrome-extension

Repo: https://github.com/yuque/yuque-chrome-extension

This is the strongest reference for our architecture.

Important local paths:

- `/tmp/yuque-chrome-extension/src/background/core/httpClient.ts`
- `/tmp/yuque-chrome-extension/src/background/request.ts`
- `/tmp/yuque-chrome-extension/src/core/webProxy/base.ts`
- `/tmp/yuque-chrome-extension/src/core/webProxy/doc.ts`
- `/tmp/yuque-chrome-extension/src/core/webProxy/upload.ts`
- `/tmp/yuque-chrome-extension/src/components/lake-editor/editor.tsx`
- `/tmp/yuque-chrome-extension/src/components/lake-editor/helper.ts`
- `/tmp/yuque-chrome-extension/src/components/lake-editor/template-html.ts`
- `/tmp/yuque-chrome-extension/src/pages/editor/index.tsx`
- `/tmp/yuque-chrome-extension/src/injectscript/service/yuque.ts`

### Cookie And CSRF Pattern

`httpClient.ts` prepares request headers by:

- reading `yuque_ctoken` from browser cookies
- sending the CSRF header
- sending JSON `Content-Type` and `Accept`
- using Yuque web host as the base URL

This validates our local design:

- `_yuque_session` authenticates the browser session.
- `yuque_ctoken` should also be sent as `x-csrf-token`.
- Web endpoints under `/api/...` are appropriate for editor-like operations.

Our current `src/client-cookie.ts` already follows this shape.

### Create Document Pattern

`core/webProxy/doc.ts` creates docs with:

- `POST /api/docs`
- `type: "Doc"`
- `format: "lake"`
- `status: 1`
- `body_draft_asl`
- `body_asl`
- `body`
- `insert_to_catalog`

This is more relevant than OpenAPI document creation when we want Lake-native documents.

### Upload Pattern

`core/webProxy/upload.ts` and `httpClient.ts` upload attachments through:

- `POST /api/upload/attach`
- multipart `FormData`
- query params including `attachable_type`, `attachable_id`, `type`, and `ctoken`

This is the right model when our local tool needs to preserve or insert images.

### Lake Editor Pattern

`components/lake-editor/editor.tsx` embeds the official Lake editor in an iframe and uses:

- `createOpenEditor`
- `editor.setDocument(type, content)`
- `editor.getDocument('text/lake', { includeMeta: true })`
- `editor.getDocument('text/html')`
- image upload hooks

`components/lake-editor/helper.ts` builds document params:

- `body_draft_asl`: serialized Lake
- `body_asl`: serialized Lake
- `body`: serialized HTML
- `insert_to_catalog: true`

This is critical: for high-fidelity formatting, the safest path is not to invent Lake strings by hand. We should eventually use the editor serialization path, possibly through a local browser automation command.

### Reading Rendered Page Content

`injectscript/service/yuque.ts` calls the page viewer internals:

- selects `.ne-viewer-body`
- uses `_neRef.document.viewer.execCommand('getNodeContent', id, 'text/html')`

This is useful for future browser-side extraction, but less important than edit-mode snapshots for writing.

## Direct Guidance For Our Tool

1. Keep cookie auth as the primary transport.

   It is aligned with the official browser extension and avoids the OpenAPI token path.

2. Treat Lake as the source of truth.

   Markdown is a convenient view, not a safe write format for existing Lake documents.

3. Add an optional "editor bridge" later.

   A future command can launch a local browser, load the official editor bundle or Yuque page context, set HTML/Markdown/Lake content, then ask the editor to serialize proper Lake.

4. Implement uploads before batch rich-content writes.

   Images and files need `/api/upload/attach` parity; otherwise transformations can break cards.

5. Keep every write snapshot-backed.

   The current `update-lake` backup behavior should stay mandatory.

6. Do not retry heading numbering by modifying text.

   The manual-editor diff must tell us the actual representation first.

## Recommended Next Commands To Build

- `create-lake <book-url> --title ... --html-file ...`
- `lake-to-markdown <snapshot.json>`
- `snapshot-book <book-url>`
- `upload-attach <file>`
- `editor-serialize --html-file ... --out lake.html`
- `apply-transform <doc-url> --transform heading-numbering`

## Bottom Line

For this project:

- `yuque-chrome-extension` is the main engineering reference.
- `ilimei/vscode-plugin-lake-editor` is the most useful packaged runtime reference because it vendors the Lake editor static assets needed by our Playwright bridge.
- `YuqueExportToMarkdown` is the read/parse reference.
- `yuque-mcp-server` and `yuque-ecosystem` are workflow/schema references.
- `yuque-cli` is a UX and small-client reference.

The architecture we are building is reasonable: a local CLI/plugin that uses Yuque browser cookies and web endpoints, stores no secrets in the repo, snapshots before writes, and gradually grows a Lake-aware transform layer.

## ilimei/vscode-plugin-lake-editor

Repo: https://github.com/ilimei/vscode-plugin-lake-editor

Local clone used during research: `/tmp/vscode-plugin-lake-editor`

Why it matters:

- It is a VS Code custom editor for local `.lake` files.
- It vendors the exact static assets our Playwright editor bridge needs:
  - `media/editor/doc.umd.js`
  - `media/editor/doc.css`
  - `media/editor/react.production.min.js`
  - `media/editor/react-dom.production.min.js`
  - `media/editor/CodeMirror.js`
  - `media/editor/katex.js`
  - `media/editor/lake-editor-icon.js`
- It demonstrates the editor message flow:
  - `updateContent` calls `editor.setDocument(docScheme, lake)`.
  - `getContent` calls `editor.getDocument(type, { includeMeta: true })`.
  - `contentchange` emits serialized Lake back to the host.
- `scripts/preset-editor.js` documents where the assets come from: `@alipay_lakex-doc` UMD assets, version `1.64.0`.

How we use it:

- Copy `media/editor/*` into this project under `vendor/lake-editor/`.
- The Playwright bridge loads those assets and uses `window.Doc.createOpenEditor`.
- `editor-serialize` now returns `serializer: "official-lake-editor"` when these assets are present.

This is better than the previous fallback serializer because the output includes native Yuque editor details such as `<!doctype lake>`, `data-lake-id`, card metadata, list IDs, and real `codeblock` card values.
