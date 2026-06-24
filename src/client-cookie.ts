import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { timestampForFile } from './fs-utils.ts'
import { writeReport } from './reports.ts'
import type { BookInfo, DocInfo, LakeApplyPlan, LakeApplyValidation, YuqueDocFields, YuqueSnapshot } from './types.ts'

const DEFAULT_HOST = 'https://www.yuque.com'

interface YuqueCookieClientOptions {
  session: string
  ctoken: string
  host?: string
}

interface YuqueApiResponse<T = unknown> {
  data?: T
}

export class YuqueCookieClient {
  private session: string
  private ctoken: string
  private host: string

  constructor({ session, ctoken, host = DEFAULT_HOST }: YuqueCookieClientOptions) {
    if (!session) throw new Error('Missing YUQUE_SESSION.')
    if (!ctoken) throw new Error('Missing YUQUE_CTOKEN.')
    this.session = session
    this.ctoken = ctoken
    this.host = host
  }

  cookieHeader(): string {
    return `_yuque_session=${this.session}; yuque_ctoken=${this.ctoken};`
  }

  htmlHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      cookie: this.cookieHeader(),
      'user-agent': 'Mozilla/5.0',
      accept: 'text/html,application/xhtml+xml',
      ...extra
    }
  }

  jsonHeaders(extra: Record<string, string> = {}): Record<string, string> {
    return {
      cookie: this.cookieHeader(),
      'user-agent': 'Mozilla/5.0',
      accept: 'application/json',
      'content-type': 'application/json',
      'x-csrf-token': this.ctoken,
      'x-requested-with': 'XMLHttpRequest',
      ...extra
    }
  }

  async inspect(url: string): Promise<Record<string, unknown>> {
    const appData = await this.fetchAppData(url)
    return summarizeAppData(appData)
  }

  async getBookInfo(url: string): Promise<BookInfo> {
    const appData = await this.fetchAppData(url)
    if (!appData.book?.id) throw new Error('No found book id')
    return {
      bookId: appData.book.id,
      bookSlug: appData.book.slug,
      tocList: appData.book.toc || [],
      bookName: appData.book.name || '',
      bookDesc: appData.book.description || '',
      host: appData.space?.host || DEFAULT_HOST,
      imageServiceDomains: appData.imageServiceDomains || []
    }
  }

  async getDocInfoFromUrl(url: string): Promise<DocInfo> {
    const appData = await this.fetchAppData(url)
    if (!appData.doc) throw new Error('Failed to get document info from URL')
    return {
      docId: appData.doc.id,
      docSlug: appData.doc.slug,
      docTitle: appData.doc.title || '',
      bookId: appData.doc.book_id,
      bookSlug: appData.book?.slug || '',
      bookName: appData.book?.name || '',
      host: appData.space?.host || DEFAULT_HOST,
      imageServiceDomains: appData.imageServiceDomains || []
    }
  }

  async getDocMarkdownData(params: { articleUrl: string; bookId: number; host?: string; isMarkdown?: boolean }): Promise<{ apiUrl: string; httpStatus: number; response: any }> {
    const { articleUrl, bookId, host = DEFAULT_HOST, isMarkdown = true } = params
    const queryParams: Record<string, string> = {
      book_id: String(bookId),
      merge_dynamic_data: String(false)
    }
    if (isMarkdown) queryParams.mode = 'markdown'
    const query = new URLSearchParams(queryParams).toString()
    const apiUrl = `${host}/api/docs/${articleUrl}?${query}`
    const res = await fetch(apiUrl, {
      headers: this.jsonHeaders()
    })
    const text = await res.text()
    return {
      apiUrl,
      httpStatus: res.status,
      response: text ? JSON.parse(text) : undefined
    }
  }

  async getVideoInfo(videoId: string): Promise<Record<string, any> | false> {
    const apiUrl = `${this.host}/api/video?${new URLSearchParams({ video_id: videoId }).toString()}`
    const res = await fetch(apiUrl, {
      headers: this.jsonHeaders()
    })
    if (!res.ok) return false
    const data = await res.json() as any
    if (data?.data?.status === 'success') return data.data.info || false
    return false
  }

  async fetchAppData(url: string): Promise<Record<string, any>> {
    const res = await fetch(url, { headers: this.htmlHeaders() })
    const html = await res.text()
    const match = /decodeURIComponent\("(.+)"\)\);/m.exec(html)
    if (!match) throw new Error(`Failed to parse appData from ${url}; HTTP ${res.status}`)
    return JSON.parse(decodeURIComponent(match[1])) as Record<string, any>
  }

  async snapshotDoc(url: string): Promise<YuqueSnapshot> {
    const appData = await this.fetchAppData(url)
    const doc = appData.doc
    const book = appData.book
    if (!doc?.id || !book?.id) throw new Error('URL is not a readable Yuque document page.')

    const edit = await this.getDocById<YuqueDocFields>(doc.id, book.id, 'edit', url)
    const markdown = await this.getDocById<YuqueDocFields>(doc.id, book.id, 'markdown', url)
    const lake = await this.getDocById<YuqueDocFields>(doc.id, book.id, 'lake', url)

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
    }
  }

  async getDocById<T>(docId: number, bookId: number, mode: string, referer: string): Promise<YuqueApiResponse<T>> {
    const endpoint = `${this.host}/api/docs/${docId}?book_id=${bookId}&mode=${mode}`
    const res = await fetch(endpoint, {
      headers: this.jsonHeaders({ referer })
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`GET ${endpoint} failed: ${res.status} ${text.slice(0, 500)}`)
    return JSON.parse(text) as YuqueApiResponse<T>
  }

  async updateLakeDoc(url: string, bodyAsl: string): Promise<Record<string, unknown>> {
    return this.applyLakeDoc(url, bodyAsl, { dryRun: false, command: 'update-lake' })
  }

  async planLakeApply(url: string, bodyAsl: string): Promise<LakeApplyPlan> {
    const snapshot = await this.snapshotDoc(url)
    const validation = validateLakeApply(snapshot, bodyAsl)
    return buildApplyPlan(snapshot, bodyAsl, validation)
  }

  async applyLakeDoc(
    url: string,
    bodyAsl: string,
    { dryRun = false, command = 'apply-lake' }: { dryRun?: boolean; command?: string } = {}
  ): Promise<Record<string, unknown>> {
    const snapshot = await this.snapshotDoc(url)
    const validation = validateLakeApply(snapshot, bodyAsl)
    if (!validation.ok) {
      const report = await writeReport(command, {
        ok: false,
        dry_run: dryRun,
        url,
        validation
      })
      throw new Error(`Refusing to apply Lake document: ${validation.errors.join('; ')}. Report: ${report}`)
    }

    const plan = buildApplyPlan(snapshot, bodyAsl, validation)
    if (dryRun) {
      const report = await writeReport(command, {
        ok: true,
        dry_run: true,
        ...plan
      })
      return {
        ok: true,
        dry_run: true,
        report,
        plan
      }
    }

    const backupPath = await writeSnapshotBackup(snapshot)
    const { id } = snapshot.doc
    await this.requestJson('PUT', `/api/docs/${id}/content`, {
      id,
      body_asl: bodyAsl,
      body_draft_asl: bodyAsl,
      format: 'lake',
      save_type: 'user',
      draft_version: snapshot.edit.draft_version
    }, url)
    await this.requestJson('PUT', `/api/docs/${id}/publish`, { id }, url)

    const report = await writeReport(command, {
      ok: true,
      dry_run: false,
      backup: backupPath,
      ...plan
    })

    return {
      ok: true,
      dry_run: false,
      doc_id: id,
      book_id: snapshot.book.id,
      backup: backupPath,
      report
    }
  }

  async requestJson(method: string, pathName: string, body: unknown, referer: string): Promise<unknown> {
    const res = await fetch(`${this.host}${pathName}`, {
      method,
      headers: this.jsonHeaders({ referer }),
      body: body ? JSON.stringify(body) : undefined
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${method} ${pathName} failed: ${res.status} ${text.slice(0, 500)}`)
    return text ? JSON.parse(text) : {}
  }
}

function validateLakeApply(snapshot: YuqueSnapshot, bodyAsl: string): LakeApplyValidation {
  const errors: string[] = []
  const warnings: string[] = []
  const current = snapshot.edit?.body_asl || ''
  if (snapshot.doc?.format !== 'lake') errors.push(`document format is "${snapshot.doc?.format}", expected "lake"`)
  if (snapshot.edit?.draft_version === undefined || snapshot.edit?.draft_version === null) errors.push('missing draft_version')
  if (!bodyAsl?.trim()) errors.push('lake file is empty')
  if (bodyAsl && bodyAsl.length < 20) errors.push('lake file is suspiciously short')
  if (current && bodyAsl) {
    const ratio = bodyAsl.length / current.length
    if (ratio < 0.25 || ratio > 4) warnings.push(`large body size change: ${current.length} -> ${bodyAsl.length}`)
  }
  return {
    ok: errors.length === 0,
    errors,
    warnings
  }
}

function buildApplyPlan(snapshot: YuqueSnapshot, bodyAsl: string, validation: LakeApplyValidation): LakeApplyPlan {
  const current = snapshot.edit?.body_asl || ''
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
  }
}

async function writeSnapshotBackup(snapshot: YuqueSnapshot): Promise<string> {
  const backupDir = path.resolve('backups')
  await mkdir(backupDir, { recursive: true })
  const backupPath = path.join(backupDir, `${snapshot.doc.id}-${timestampForFile()}.snapshot.json`)
  await writeFile(backupPath, `${JSON.stringify(snapshot, null, 2)}\n`)
  return backupPath
}

function summarizeAppData(appData: Record<string, any>): Record<string, unknown> {
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
  }
}

function pickDocFields(doc: YuqueDocFields = {}): YuqueDocFields {
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
  }
}
