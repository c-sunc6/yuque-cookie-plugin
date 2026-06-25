import { mkdir, stat, writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import path from 'node:path';
import { openAsBlob } from 'node:fs';
import { timestampForFile } from "./fs-utils.js";
import { writeReport } from "./reports.js";
const DEFAULT_HOST = 'https://www.yuque.com';
export class YuqueCookieClient {
    session;
    ctoken;
    extraCookies;
    host;
    constructor({ session, ctoken, extraCookies = {}, host = DEFAULT_HOST }) {
        if (!session)
            throw new Error('Missing YUQUE_SESSION.');
        if (!ctoken)
            throw new Error('Missing YUQUE_CTOKEN.');
        this.session = session;
        this.ctoken = ctoken;
        this.extraCookies = extraCookies;
        this.host = host;
    }
    cookieHeader() {
        const cookies = {
            _yuque_session: this.session,
            yuque_ctoken: this.ctoken,
            ...this.extraCookies
        };
        return Object.entries(cookies)
            .filter(([, value]) => value)
            .map(([key, value]) => `${key}=${value};`)
            .join(' ');
    }
    htmlHeaders(extra = {}) {
        return {
            cookie: this.cookieHeader(),
            'user-agent': 'Mozilla/5.0',
            accept: 'text/html,application/xhtml+xml',
            ...extra
        };
    }
    jsonHeaders(extra = {}) {
        return {
            cookie: this.cookieHeader(),
            'user-agent': 'Mozilla/5.0',
            accept: 'application/json',
            'content-type': 'application/json',
            'x-csrf-token': this.ctoken,
            'x-requested-with': 'XMLHttpRequest',
            ...extra
        };
    }
    async inspect(url) {
        const appData = await this.fetchAppData(url);
        return summarizeAppData(appData);
    }
    async getBookInfo(url) {
        const appData = await this.fetchAppData(url);
        if (!appData.book?.id)
            throw new Error('No found book id');
        return {
            bookId: appData.book.id,
            bookSlug: appData.book.slug,
            tocList: appData.book.toc || [],
            bookName: appData.book.name || '',
            bookDesc: appData.book.description || '',
            host: appData.space?.host || DEFAULT_HOST,
            imageServiceDomains: appData.imageServiceDomains || []
        };
    }
    async getDocInfoFromUrl(url) {
        const appData = await this.fetchAppData(url);
        if (!appData.doc)
            throw new Error('Failed to get document info from URL');
        return {
            docId: appData.doc.id,
            docSlug: appData.doc.slug,
            docTitle: appData.doc.title || '',
            bookId: appData.doc.book_id,
            bookSlug: appData.book?.slug || '',
            bookName: appData.book?.name || '',
            host: appData.space?.host || DEFAULT_HOST,
            imageServiceDomains: appData.imageServiceDomains || []
        };
    }
    async getDocMarkdownData(params) {
        const { articleUrl, bookId, host = DEFAULT_HOST, isMarkdown = true } = params;
        const queryParams = {
            book_id: String(bookId),
            merge_dynamic_data: String(false)
        };
        if (isMarkdown)
            queryParams.mode = 'markdown';
        const query = new URLSearchParams(queryParams).toString();
        const apiUrl = `${host}/api/docs/${articleUrl}?${query}`;
        const res = await fetch(apiUrl, {
            headers: this.jsonHeaders()
        });
        const text = await res.text();
        return {
            apiUrl,
            httpStatus: res.status,
            response: text ? JSON.parse(text) : undefined
        };
    }
    async getVideoInfo(videoId) {
        const apiUrl = `${this.host}/api/video?${new URLSearchParams({ video_id: videoId }).toString()}`;
        const res = await fetch(apiUrl, {
            headers: this.jsonHeaders()
        });
        if (!res.ok)
            return false;
        const data = await res.json();
        if (data?.data?.status === 'success')
            return data.data.info || false;
        return false;
    }
    async createBook(params) {
        const referer = `${this.host}/dashboard`;
        const payload = {
            name: params.name,
            slug: params.slug,
            description: params.description || '',
            public: params.public ? 1 : 0,
            type: 'Book',
            repo_type: 'Book'
        };
        const created = await this.requestJson('POST', '/api/books', payload, referer);
        const book = created.data || created;
        const url = book.user?.login && book.slug ? `${this.host}/${book.user.login}/${book.slug}` : `${this.host}/${book.slug || ''}`;
        const report = await writeReport('create-book', {
            ok: true,
            book: {
                id: book.id,
                slug: book.slug,
                name: book.name,
                public: book.public
            },
            url
        });
        return {
            ok: true,
            book_id: book.id,
            slug: book.slug,
            name: book.name,
            public: book.public,
            url,
            report
        };
    }
    async createMarkdownDoc(bookUrl, params) {
        const appData = await this.fetchAppData(bookUrl);
        const book = appData.book;
        if (!book?.id)
            throw new Error('URL is not a readable Yuque book page.');
        if (!book.abilities?.create_doc)
            throw new Error(`Current account cannot create docs in book "${book.name || book.slug || book.id}".`);
        const payload = {
            book_id: book.id,
            title: params.title,
            format: 'markdown',
            body: params.body,
            body_draft: params.body,
            public: 0
        };
        if (params.slug)
            payload.slug = params.slug;
        if (params.attachToToc !== false) {
            payload.insert_to_catalog = true;
            payload.action = params.tocAction || 'appendByDocs';
            payload.target_uuid = params.targetUuid || '';
        }
        const created = await this.requestJson('POST', '/api/docs', payload, bookUrl);
        const doc = created.data || created;
        const toc = Array.isArray(created.toc) ? created.toc : [];
        const tocAttached = toc.some((item) => Number(item.doc_id || item.id) === Number(doc.id));
        const docUrl = buildDocUrl(this.host, appData, book, doc);
        const report = await writeReport('create-doc', {
            ok: true,
            book: {
                id: book.id,
                slug: book.slug,
                name: book.name
            },
            doc: {
                id: doc.id,
                slug: doc.slug,
                title: doc.title,
                format: doc.format
            },
            url: docUrl,
            toc_attached: tocAttached,
            toc
        });
        return {
            ok: true,
            book_id: book.id,
            doc_id: doc.id,
            slug: doc.slug,
            title: doc.title,
            format: doc.format,
            url: docUrl,
            toc_attached: tocAttached,
            toc,
            report
        };
    }
    async uploadAttach(refererUrl, filePath) {
        const appData = await this.fetchAppData(refererUrl);
        const me = appData.me;
        if (!me?.id)
            throw new Error('Failed to resolve current Yuque user id for upload.');
        const absolutePath = path.resolve(filePath);
        const info = await stat(absolutePath);
        if (!info.isFile())
            throw new Error(`Upload path is not a file: ${filePath}`);
        const fileName = basename(absolutePath);
        const contentType = guessContentType(fileName);
        const blob = await openAsBlob(absolutePath, { type: contentType });
        const form = new FormData();
        form.append('file', new File([blob], fileName, { type: contentType }));
        const query = new URLSearchParams({
            attachable_type: 'User',
            attachable_id: String(me.id),
            type: contentType.startsWith('image/') ? 'image' : 'attachment',
            ctoken: this.ctoken
        }).toString();
        const endpoint = `/api/upload/attach?${query}`;
        const safeEndpoint = `/api/upload/attach?${new URLSearchParams({
            attachable_type: 'User',
            attachable_id: String(me.id),
            type: contentType.startsWith('image/') ? 'image' : 'attachment',
            ctoken: '<redacted>'
        }).toString()}`;
        const res = await fetch(`${this.host}${endpoint}`, {
            method: 'POST',
            headers: {
                cookie: this.cookieHeader(),
                'user-agent': 'Mozilla/5.0',
                accept: 'application/json',
                'x-csrf-token': this.ctoken,
                'x-requested-with': 'XMLHttpRequest',
                referer: refererUrl
            },
            body: form
        });
        const text = await res.text();
        const response = text ? JSON.parse(text) : {};
        const upload = sanitizeUploadResponse(response.data || response);
        const report = await writeReport('upload-attach', {
            ok: res.ok,
            url: refererUrl,
            endpoint: safeEndpoint,
            file: {
                name: fileName,
                size: info.size,
                type: contentType
            },
            upload
        });
        if (!res.ok)
            throw new Error(`POST ${safeEndpoint} failed: ${res.status} ${text.slice(0, 500)}. Report: ${report}`);
        return {
            ok: true,
            file: {
                name: fileName,
                size: info.size,
                type: contentType
            },
            upload,
            report
        };
    }
    async fetchAppData(url) {
        const res = await fetch(url, { headers: this.htmlHeaders() });
        const html = await res.text();
        const match = /decodeURIComponent\("(.+)"\)\);/m.exec(html);
        if (!match)
            throw new Error(`Failed to parse appData from ${url}; HTTP ${res.status}`);
        return JSON.parse(decodeURIComponent(match[1]));
    }
    async snapshotDoc(url) {
        const appData = await this.fetchAppData(url);
        const doc = appData.doc;
        const book = appData.book;
        if (!doc?.id || !book?.id)
            throw new Error('URL is not a readable Yuque document page.');
        const edit = await this.getDocById(doc.id, book.id, 'edit', url);
        const markdown = await this.getDocById(doc.id, book.id, 'markdown', url);
        const lake = await this.getDocById(doc.id, book.id, 'lake', url);
        return {
            captured_at: new Date().toISOString(),
            url,
            book: {
                id: book.id,
                slug: book.slug,
                name: book.name
            },
            doc: {
                id: doc.id,
                slug: doc.slug,
                title: doc.title,
                format: doc.format
            },
            edit: pickDocFields(edit.data),
            markdown: pickDocFields(markdown.data),
            lake: pickDocFields(lake.data)
        };
    }
    async getDocById(docId, bookId, mode, referer) {
        const endpoint = `${this.host}/api/docs/${docId}?book_id=${bookId}&mode=${mode}`;
        const res = await fetch(endpoint, {
            headers: this.jsonHeaders({ referer })
        });
        const text = await res.text();
        if (!res.ok)
            throw new Error(`GET ${endpoint} failed: ${res.status} ${text.slice(0, 500)}`);
        return JSON.parse(text);
    }
    async updateLakeDoc(url, bodyAsl) {
        return this.applyLakeDoc(url, bodyAsl, { dryRun: false, command: 'update-lake' });
    }
    async planLakeApply(url, bodyAsl) {
        const snapshot = await this.snapshotDoc(url);
        const validation = validateLakeApply(snapshot, bodyAsl);
        return buildApplyPlan(snapshot, bodyAsl, validation);
    }
    async applyLakeDoc(url, bodyAsl, { dryRun = false, command = 'apply-lake' } = {}) {
        const snapshot = await this.snapshotDoc(url);
        const validation = validateLakeApply(snapshot, bodyAsl);
        if (!validation.ok) {
            const report = await writeReport(command, {
                ok: false,
                dry_run: dryRun,
                url,
                validation
            });
            throw new Error(`Refusing to apply Lake document: ${validation.errors.join('; ')}. Report: ${report}`);
        }
        const plan = buildApplyPlan(snapshot, bodyAsl, validation);
        if (dryRun) {
            const report = await writeReport(command, {
                ok: true,
                dry_run: true,
                ...plan
            });
            return {
                ok: true,
                dry_run: true,
                report,
                plan
            };
        }
        const backupPath = await writeSnapshotBackup(snapshot);
        const { id } = snapshot.doc;
        await this.requestJson('PUT', `/api/docs/${id}/content`, {
            id,
            body_asl: bodyAsl,
            body_draft_asl: bodyAsl,
            format: 'lake',
            save_type: 'user',
            draft_version: snapshot.edit.draft_version
        }, url);
        await this.requestJson('PUT', `/api/docs/${id}/publish`, { id }, url);
        const report = await writeReport(command, {
            ok: true,
            dry_run: false,
            backup: backupPath,
            ...plan
        });
        return {
            ok: true,
            dry_run: false,
            doc_id: id,
            book_id: snapshot.book.id,
            backup: backupPath,
            report
        };
    }
    async requestJson(method, pathName, body, referer) {
        const res = await fetch(`${this.host}${pathName}`, {
            method,
            headers: this.jsonHeaders({ referer }),
            body: body ? JSON.stringify(body) : undefined
        });
        const text = await res.text();
        if (!res.ok)
            throw new Error(`${method} ${pathName} failed: ${res.status} ${text.slice(0, 500)}`);
        return text ? JSON.parse(text) : {};
    }
}
function validateLakeApply(snapshot, bodyAsl) {
    const errors = [];
    const warnings = [];
    const current = snapshot.edit?.body_asl || '';
    if (snapshot.doc?.format !== 'lake')
        errors.push(`document format is "${snapshot.doc?.format}", expected "lake"`);
    if (snapshot.edit?.draft_version === undefined || snapshot.edit?.draft_version === null)
        errors.push('missing draft_version');
    if (!bodyAsl?.trim())
        errors.push('lake file is empty');
    if (bodyAsl && bodyAsl.length < 20)
        errors.push('lake file is suspiciously short');
    if (current && bodyAsl) {
        const ratio = bodyAsl.length / current.length;
        if (ratio < 0.25 || ratio > 4)
            warnings.push(`large body size change: ${current.length} -> ${bodyAsl.length}`);
    }
    return {
        ok: errors.length === 0,
        errors,
        warnings
    };
}
function buildApplyPlan(snapshot, bodyAsl, validation) {
    const current = snapshot.edit?.body_asl || '';
    return {
        captured_at: new Date().toISOString(),
        url: snapshot.url,
        doc: snapshot.doc,
        book: snapshot.book,
        validation,
        stats: {
            current_lake_length: current.length,
            next_lake_length: bodyAsl.length,
            length_delta: bodyAsl.length - current.length,
            changed: current !== bodyAsl
        }
    };
}
async function writeSnapshotBackup(snapshot) {
    const backupDir = path.resolve('backups');
    await mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `${snapshot.doc.id}-${timestampForFile()}.snapshot.json`);
    await writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`);
    return backupPath;
}
function summarizeAppData(appData) {
    return {
        book: appData.book && {
            id: appData.book.id,
            slug: appData.book.slug,
            name: appData.book.name,
            toc_count: appData.book.toc?.length,
            abilities: appData.book.abilities
        },
        doc: appData.doc && {
            id: appData.doc.id,
            slug: appData.doc.slug,
            title: appData.doc.title,
            book_id: appData.doc.book_id,
            format: appData.doc.format
        },
        me: appData.me && {
            id: appData.me.id,
            login: appData.me.login,
            name: appData.me.name
        },
        space: appData.space && {
            host: appData.space.host,
            login: appData.space.login
        }
    };
}
function pickDocFields(doc = {}) {
    return {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        format: doc.format,
        draft_version: doc.draft_version,
        content_updated_at: doc.content_updated_at,
        updated_at: doc.updated_at,
        published_at: doc.published_at,
        body: doc.body,
        body_draft: doc.body_draft,
        body_asl: doc.body_asl,
        body_draft_asl: doc.body_draft_asl,
        sourcecode: doc.sourcecode,
        serializer: doc.serializer
    };
}
function buildDocUrl(host, appData, book, doc) {
    const spaceLogin = appData.space?.login || appData.me?.login;
    const bookSlug = book.slug;
    const docSlug = doc.slug || doc.id;
    if (spaceLogin && bookSlug && docSlug)
        return `${host}/${spaceLogin}/${bookSlug}/${docSlug}`;
    if (bookSlug && docSlug)
        return `${host}/${bookSlug}/${docSlug}`;
    return `${host}/api/docs/${doc.id || ''}`;
}
function guessContentType(fileName) {
    const ext = extname(fileName).toLowerCase();
    const types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.pdf': 'application/pdf',
        '.zip': 'application/zip',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    return types[ext] || 'application/octet-stream';
}
function sanitizeUploadResponse(upload) {
    const attachment = upload.attachment && typeof upload.attachment === 'object'
        ? {
            id: upload.attachment.id,
            filename: upload.attachment.filename,
            ext: upload.attachment.ext,
            filesize: upload.attachment.filesize,
            filekey: upload.attachment.filekey,
            filemd5: upload.attachment.filemd5,
            mode: upload.attachment.mode,
            attachable_type: upload.attachment.attachable_type,
            attachable_id: upload.attachment.attachable_id,
            user_id: upload.attachment.user_id,
            created_at: upload.attachment.created_at,
            updated_at: upload.attachment.updated_at
        }
        : undefined;
    return {
        filekey: upload.filekey,
        extname: upload.extname,
        mode: upload.mode,
        url: upload.url,
        etag: upload.etag,
        size: upload.size,
        filename: upload.filename,
        filemd5: upload.filemd5,
        element_id: upload.element_id,
        attachment_id: upload.attachment_id,
        attachable_type: upload.attachable_type,
        attachable_id: upload.attachable_id,
        ...(upload.symlink === undefined ? {} : { symlink: upload.symlink }),
        ...(upload.isCopy === undefined ? {} : { isCopy: upload.isCopy }),
        ...(attachment ? { attachment } : {})
    };
}
