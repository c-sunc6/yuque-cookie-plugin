#!/usr/bin/env node
import process from 'node:process';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { YuqueCookieClient } from "./client-cookie.js";
import { diffLakeSnapshots } from "./lake-diff.js";
import { writeJson } from "./fs-utils.js";
import { getCredentialStatus, getCredentials, loginWithBrowser, recordCredentialValidation } from "./auth.js";
import { serializeHtmlToLake } from "./editor-bridge.js";
import { snapshotToMarkdown } from "./lake-markdown.js";
import { downloadBook, downloadDocs } from "./downloader.js";
import { normalizeDownloadOptions } from "./download-utils.js";
import { serveBook } from "./serve-book.js";
import { enableLakeHeadingNumbering } from "./lake-heading-numbering.js";
import { extractFirstImageParagraph, insertLakeBlock } from "./lake-insert.js";
function help() {
    console.log(`yuque-local

Usage:
  yuque-local inspect <doc-or-book-url>
  yuque-local auth-status <doc-or-book-url>
  yuque-local login
  yuque-local create-book --name <name> --slug <slug> [--description <text>] [--public]
  yuque-local create-doc <book-url> --title <title> --markdown-file <file> [--number-headings] [--slug <slug>] [--no-toc] [--no-native-lake]
  yuque-local upload-attach <doc-or-book-url> --file <file>
  yuque-local insert-image <doc-url> --file <image> [--after-text <text>] [--dry-run]
  yuque-local insert-attachment <doc-url> --file <file> [--after-text <text>] [--dry-run]
  yuque-local snapshot <doc-url> --out <file>
  yuque-local diff-lake <before.json> <after.json>
  yuque-local editor-serialize --html-file <file> --out <lake-file>
  yuque-local apply-lake <doc-url> --lake-file <body_asl.html> [--dry-run]
  yuque-local lake-to-markdown <snapshot.json> --out <file>
  yuque-local format-article <doc-url> --html-file <file> [--dry-run]
  yuque-local update-lake <doc-url> --lake-file <body_asl.html>
  yuque-local download-book <book-url> [--dist-dir download] [--incremental]
  yuque-local download-doc <...doc-urls> [--dist-dir download]
  yuque-local serve-book <book-path> [--port 5173]

Options:
  --out <file>           Output path
  --lake-file <file>     Lake body_asl HTML file
  --html-file <file>     HTML input file
  --markdown-file <file> Markdown input file for create-doc
  --file <file>          Local file for upload-attach / insert-image / insert-attachment
  --after-text <text>    Insert image/attachment after first block containing text; otherwise append
  --title <title>        Document title
  --name <name>          Book name
  --description <text>   Book description
  --slug <slug>          Optional custom slug; omit to let Yuque generate it
  --no-toc               Create doc without attaching it to book TOC
  --toc-action <action>  TOC action, default: appendByDocs
  --target-uuid <uuid>   TOC target uuid, default: root
  --number-headings      Enable Yuque native heading numbering in Lake
  --no-native-lake       Skip final Lake-native rewrite after Markdown import
  --public               Create public book when supported
  --dry-run              Build a plan/report without writing online content
  --keep-temp            Keep editor bridge temp files for debugging
  --session-env <name>   Env var for _yuque_session, default: YUQUE_SESSION
  --ctoken-env <name>    Env var for yuque_ctoken, default: YUQUE_CTOKEN
  --home-url <url>       Optional user/org Yuque home URL, e.g. https://www.yuque.com/your-login/
  --cookie-key <name>    Extra Yuque cookie key, e.g. verified_books
  --cookie-value <value> Extra Yuque cookie value for --cookie-key
  --api-host <url>       Override Yuque API host for tests or enterprise deployments
  --dist-dir <dir>       Download output dir, default: download
  --ignore-img           Do not download markdown images
  --ignore-attachments   Do not download attachments, or pass comma-separated extensions
  --toc                  Add markdown table of contents per document
  --incremental          Skip unchanged docs based on progress.json
  --hide-footer          Do not append update/original footer
  --quiet                Suppress downloader progress lines; final JSON remains
  --port <port>          serve-book port, default: 5173
  --host <host>          serve-book host, default: localhost
  --force                Recreate VitePress config
  --config-only          Generate serve-book VitePress config and exit
  -h, --help             Show help
`);
}
function parseArgs(argv) {
    const positional = [];
    const flags = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith('-')) {
            positional.push(arg);
            continue;
        }
        if (arg === '-h' || arg === '--help') {
            flags.help = true;
            continue;
        }
        const eq = arg.indexOf('=');
        if (eq !== -1) {
            flags[toCamel(arg.slice(0, eq).replace(/^--?/, ''))] = arg.slice(eq + 1);
            continue;
        }
        const key = toCamel(arg.replace(/^--?/, ''));
        const next = argv[i + 1];
        if (next && !next.startsWith('-')) {
            flags[key] = next;
            i += 1;
        }
        else {
            flags[key] = true;
        }
    }
    return { positional, flags };
}
function toCamel(value) {
    return value.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}
async function createClient(flags) {
    let credentials;
    try {
        credentials = getCredentials(flags);
    }
    catch (error) {
        console.log(error instanceof Error ? error.message : String(error));
        await loginWithBrowser(flags);
        credentials = getCredentials(flags);
    }
    return new YuqueCookieClient({
        session: credentials.session,
        ctoken: credentials.ctoken,
        extraCookies: credentials.extraCookies,
        host: typeof flags.apiHost === 'string' ? flags.apiHost : undefined
    });
}
function isAuthLikeError(error) {
    const message = error instanceof Error ? error.message : String(error);
    return /401|403|Failed to parse appData|Missing Yuque credentials|登录|login|unauthorized|forbidden/i.test(message);
}
function withReloginHint(error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAuthLikeError(error))
        return error instanceof Error ? error : new Error(message);
    return new Error(`${message}\nYuque credentials may be expired. Run "npm run yuque-local -- login" and paste fresh _yuque_session + yuque_ctoken.`);
}
async function main() {
    const [command, ...rest] = process.argv.slice(2);
    const { positional, flags } = parseArgs(rest);
    if (!command || command === 'help' || command === '--help' || flags.help) {
        help();
        return;
    }
    if (command === 'diff-lake') {
        const [beforePath, afterPath] = positional;
        if (!beforePath || !afterPath)
            throw new Error('Missing before/after snapshot path.');
        const before = JSON.parse(await readFile(beforePath, 'utf8'));
        const after = JSON.parse(await readFile(afterPath, 'utf8'));
        console.log(JSON.stringify(diffLakeSnapshots(before, after), null, 2));
        return;
    }
    if (command === 'editor-serialize') {
        if (!flags.htmlFile || typeof flags.htmlFile !== 'string')
            throw new Error('Missing --html-file.');
        if (!flags.out || typeof flags.out !== 'string')
            throw new Error('Missing --out.');
        const html = await readFile(flags.htmlFile, 'utf8');
        const result = await serializeHtmlToLake({ html, out: flags.out, keepTemp: Boolean(flags.keepTemp) });
        console.log(JSON.stringify({
            ok: true,
            serializer: result.serializer,
            out: flags.out,
            length: result.lake.length
        }, null, 2));
        return;
    }
    if (command === 'lake-to-markdown') {
        const [snapshotPath] = positional;
        if (!snapshotPath)
            throw new Error('Missing snapshot path.');
        if (!flags.out || typeof flags.out !== 'string')
            throw new Error('Missing --out.');
        const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
        const markdown = snapshotToMarkdown(snapshot);
        await writeFile(flags.out, markdown, 'utf8');
        console.log(`Markdown written: ${flags.out}`);
        return;
    }
    if (command === 'login') {
        await loginWithBrowser(flags);
        return;
    }
    if (command === 'auth-status') {
        const [url] = positional;
        const status = getCredentialStatus(flags);
        if (!url) {
            console.log(JSON.stringify(status, null, 2));
            return;
        }
        const client = await createClient(flags);
        try {
            const inspect = await client.inspect(url);
            await recordCredentialValidation(true);
            console.log(JSON.stringify({
                ...getCredentialStatus(flags),
                valid: true,
                checked_at: new Date().toISOString(),
                inspect
            }, null, 2));
        }
        catch (error) {
            await recordCredentialValidation(false, error);
            console.log(JSON.stringify({
                ...getCredentialStatus(flags),
                valid: false,
                checked_at: new Date().toISOString(),
                error: error instanceof Error ? error.message : String(error),
                relogin: 'npm run yuque-local -- login'
            }, null, 2));
            process.exitCode = 1;
        }
        return;
    }
    if (command === 'serve-book') {
        const [bookPath] = positional;
        if (!bookPath)
            throw new Error('Missing book path.');
        const result = await serveBook(bookPath, {
            port: typeof flags.port === 'string' ? Number(flags.port) : undefined,
            host: typeof flags.host === 'string' ? flags.host : undefined,
            force: Boolean(flags.force),
            configOnly: Boolean(flags.configOnly)
        });
        if (flags.configOnly)
            console.log(JSON.stringify({ ok: true, ...result }, null, 2));
        return;
    }
    const client = await createClient(flags);
    try {
        if (command === 'inspect') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque URL.');
            const info = await client.inspect(url);
            await recordCredentialValidation(true);
            console.log(JSON.stringify(info, null, 2));
            return;
        }
        if (command === 'snapshot') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.out || typeof flags.out !== 'string')
                throw new Error('Missing --out.');
            const snapshot = await client.snapshotDoc(url);
            await writeJson(flags.out, snapshot);
            await recordCredentialValidation(true);
            console.log(`Snapshot written: ${flags.out}`);
            return;
        }
        if (command === 'create-book') {
            if (!flags.name || typeof flags.name !== 'string')
                throw new Error('Missing --name.');
            if (!flags.slug || typeof flags.slug !== 'string')
                throw new Error('Missing --slug.');
            const result = await client.createBook({
                name: flags.name,
                slug: flags.slug,
                description: typeof flags.description === 'string' ? flags.description : undefined,
                public: Boolean(flags.public)
            });
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'create-doc') {
            const [bookUrl] = positional;
            if (!bookUrl)
                throw new Error('Missing Yuque book URL.');
            if (!flags.title || typeof flags.title !== 'string')
                throw new Error('Missing --title.');
            if (!flags.markdownFile || typeof flags.markdownFile !== 'string')
                throw new Error('Missing --markdown-file.');
            let body = await readFile(flags.markdownFile, 'utf8');
            if (!body.trim())
                throw new Error('Markdown file is empty.');
            const result = await client.createMarkdownDoc(bookUrl, {
                title: flags.title,
                body,
                slug: typeof flags.slug === 'string' ? flags.slug : undefined,
                attachToToc: !flags.noToc,
                tocAction: typeof flags.tocAction === 'string' ? flags.tocAction : undefined,
                targetUuid: typeof flags.targetUuid === 'string' ? flags.targetUuid : undefined
            });
            if (!flags.noNativeLake && typeof result.url === 'string') {
                const snapshot = await client.snapshotDoc(result.url);
                const lake = snapshot.edit?.body_asl || snapshot.lake?.sourcecode || '';
                const nativeLake = flags.numberHeadings ? enableLakeHeadingNumbering(lake) : lake;
                const applyResult = await client.applyLakeDoc(result.url, nativeLake, {
                    command: flags.numberHeadings ? 'native-lake-number-headings' : 'native-lake'
                });
                Object.assign(result, {
                    final_format: 'lake',
                    native_lake: {
                        ok: true,
                        source: 'yuque-generated-body_asl',
                        apply: applyResult
                    },
                    ...(flags.numberHeadings
                        ? {
                            heading_numbering: {
                                ok: true,
                                mode: 'lake-native',
                                data_lake_index_type: '2'
                            }
                        }
                        : {})
                });
            }
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'upload-attach') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque URL.');
            if (!flags.file || typeof flags.file !== 'string')
                throw new Error('Missing --file.');
            const result = await client.uploadAttach(url, flags.file);
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'insert-image') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.file || typeof flags.file !== 'string')
                throw new Error('Missing --file.');
            const uploaded = await client.uploadAttach(url, flags.file);
            const uploadData = uploaded.upload;
            const imageUrl = typeof uploadData?.url === 'string' ? uploadData.url : '';
            if (!imageUrl)
                throw new Error('Upload succeeded but response did not include upload.url.');
            const imageHtml = `<p><img src="${escapeHtmlAttr(imageUrl)}" alt="${escapeHtmlAttr(String(uploadData?.filename || path.basename(flags.file)))}"></p>`;
            const serialized = await serializeHtmlToLake({ html: imageHtml, keepTemp: Boolean(flags.keepTemp) });
            const imageBlock = extractFirstImageParagraph(serialized.lake);
            const snapshot = await client.snapshotDoc(url);
            const currentLake = snapshot.edit?.body_asl || snapshot.lake?.sourcecode || '';
            const nextLake = insertLakeBlock(currentLake, imageBlock, typeof flags.afterText === 'string' ? flags.afterText : undefined);
            const applyResult = await client.applyLakeDoc(url, nextLake, {
                dryRun: Boolean(flags.dryRun),
                command: 'insert-image'
            });
            await recordCredentialValidation(true);
            console.log(JSON.stringify({
                ok: true,
                dry_run: Boolean(flags.dryRun),
                uploaded,
                serializer: serialized.serializer,
                image_block_length: imageBlock.length,
                inserted_after_text: typeof flags.afterText === 'string' ? flags.afterText : null,
                apply: applyResult
            }, null, 2));
            return;
        }
        if (command === 'insert-attachment') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.file || typeof flags.file !== 'string')
                throw new Error('Missing --file.');
            const uploaded = await client.uploadAttach(url, flags.file);
            const uploadData = uploaded.upload;
            if (!uploadData?.url)
                throw new Error('Upload succeeded but response did not include upload.url.');
            const attachmentBlock = buildAttachmentBlock(uploadData, flags.file, url);
            const snapshot = await client.snapshotDoc(url);
            const currentLake = snapshot.edit?.body_asl || snapshot.lake?.sourcecode || '';
            const nextLake = insertLakeBlock(currentLake, attachmentBlock, typeof flags.afterText === 'string' ? flags.afterText : undefined);
            const applyResult = await client.applyLakeDoc(url, nextLake, {
                dryRun: Boolean(flags.dryRun),
                command: 'insert-attachment'
            });
            await recordCredentialValidation(true);
            console.log(JSON.stringify({
                ok: true,
                dry_run: Boolean(flags.dryRun),
                uploaded,
                attachment_block_length: attachmentBlock.length,
                inserted_after_text: typeof flags.afterText === 'string' ? flags.afterText : null,
                apply: applyResult
            }, null, 2));
            return;
        }
        if (command === 'update-lake') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.lakeFile || typeof flags.lakeFile !== 'string')
                throw new Error('Missing --lake-file.');
            const lake = await readFile(flags.lakeFile, 'utf8');
            const result = await client.updateLakeDoc(url, lake);
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'apply-lake') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.lakeFile || typeof flags.lakeFile !== 'string')
                throw new Error('Missing --lake-file.');
            const lake = await readFile(flags.lakeFile, 'utf8');
            const result = await client.applyLakeDoc(url, lake, {
                dryRun: Boolean(flags.dryRun),
                command: 'apply-lake'
            });
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'format-article') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque doc URL.');
            if (!flags.htmlFile || typeof flags.htmlFile !== 'string')
                throw new Error('Missing --html-file.');
            const html = await readFile(flags.htmlFile, 'utf8');
            const serialized = await serializeHtmlToLake({ html, keepTemp: Boolean(flags.keepTemp) });
            const result = await client.applyLakeDoc(url, serialized.lake, {
                dryRun: Boolean(flags.dryRun),
                command: 'format-article'
            });
            console.log(JSON.stringify({
                serializer: serialized.serializer,
                lake_length: serialized.lake.length,
                ...result
            }, null, 2));
            await recordCredentialValidation(true);
            return;
        }
        if (command === 'download-book') {
            const [url] = positional;
            if (!url)
                throw new Error('Missing Yuque book URL.');
            const result = await downloadBook(client, url, normalizeDownloadOptions(flags));
            await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            return;
        }
        if (command === 'download-doc') {
            if (!positional.length)
                throw new Error('Missing Yuque doc URL.');
            const result = await downloadDocs(client, positional, normalizeDownloadOptions(flags));
            if (result.ok !== false || Number(result.downloaded || 0) > 0)
                await recordCredentialValidation(true);
            console.log(JSON.stringify(result, null, 2));
            if (result.ok === false && Number(result.downloaded || 0) === 0)
                process.exitCode = 1;
            return;
        }
    }
    catch (error) {
        await recordCredentialValidation(false, error);
        throw withReloginHint(error);
    }
    throw new Error(`Unknown command: ${command}`);
}
main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`yuque-local error: ${message}`);
    process.exitCode = 1;
});
function escapeHtmlAttr(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
function buildAttachmentBlock(upload, filePath, docUrl) {
    const filename = String(upload.filename || path.basename(filePath));
    const ext = String(upload.extname || path.extname(filename).replace(/^\./, '') || '');
    const downloadUrl = typeof upload.url === 'string' ? upload.url : '';
    const previewUrl = buildOfficePreviewUrl(upload, docUrl) || downloadUrl;
    const data = {
        id: upload.attachment_id,
        attachmentId: upload.attachment_id,
        name: filename,
        filename,
        size: upload.size,
        filesize: upload.size,
        ext,
        filekey: upload.filekey,
        src: previewUrl,
        url: previewUrl,
        previewUrl,
        preview_url: previewUrl,
        downloadUrl,
        download_url: downloadUrl,
        status: 'done',
        mode: upload.mode || 'private'
    };
    return `<p><card type="inline" name="file" value="data:${encodeURIComponent(JSON.stringify(data))}"></card></p>`;
}
function buildOfficePreviewUrl(upload, docUrl) {
    if (typeof upload.filekey !== 'string' || !upload.filekey.trim())
        return '';
    try {
        const origin = new URL(docUrl).origin;
        return `${origin}/office/${upload.filekey}?from=${encodeURIComponent(docUrl)}`;
    }
    catch {
        return '';
    }
}
