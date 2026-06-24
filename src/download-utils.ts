import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream, existsSync } from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import markdownToc from 'markdown-toc'
import pako from 'pako'
import type { DownloadOptions, ProgressItem, YuqueTocItem } from './types.ts'

const IMAGE_SIGN_KEY = 'UXO91eVnUveQn8suOJaYMvBcWs9KptS8N5HoP8ezSeU4vqApZpy1CkPaTpkpQEx2W2mlhxL8zwS8UePwBgksUM0CTtAODbTTTDFD'

export function normalizeDownloadOptions(flags: Record<string, unknown>): DownloadOptions {
  return {
    distDir: typeof flags.distDir === 'string' ? flags.distDir : 'download',
    ignoreImg: Boolean(flags.ignoreImg),
    ignoreAttachments: normalizeIgnoreAttachments(flags.ignoreAttachments),
    toc: Boolean(flags.toc),
    incremental: Boolean(flags.incremental),
    convertMarkdownVideoLinks: Boolean(flags.convertMarkdownVideoLinks),
    hideFooter: Boolean(flags.hideFooter),
    quiet: Boolean(flags.quiet)
  }
}

export function fixPath(value: string): string {
  return removeEmojis(value)
    .replace(/[\\/:*?"<>|\n\r]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
}

export function removeEmojis(value: string): string {
  return value.replace(/[\ud800-\udbff][\udc00-\udfff]/g, '')
}

export function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

export function getMarkdownImageList(markdown: string): string[] {
  const mdImgReg = /!\[(.*?)\]\((.*?)\)/gm
  return Array.from(markdown.match(mdImgReg) || [])
    .map((item) => item.replace(mdImgReg, '$2'))
    .filter((url) => /^https?:\/\//.test(url))
}

export function fixLatex(markdown: string): string {
  const latexReg = /!\[(.*?)\]\((http.*?latex.*?)\)/gm
  const list = markdown.match(latexReg)
  let fixed = markdown
  try {
    list?.forEach((latexMd) => {
      latexReg.lastIndex = 0
      const url = latexReg.exec(latexMd)?.[2] ?? ''
      const { pathname, search } = new URL(url)
      if (!pathname.endsWith('.svg') && search) {
        fixed = fixed.replace(latexMd, decodeURIComponent(search).slice(1))
      }
    })
  } catch {
    return markdown
  }
  return fixed
}

export function fixMarkdownImage(imgList: string[], markdown: string, htmlData: string): string {
  if (!htmlData) return markdown
  const htmlDataImgReg = /<card.*?name="image".*?value="data:(.*?)">(.*?)<\/card>/gm
  const htmlImgDataList: string[] = []
  for (const match of htmlData.matchAll(htmlDataImgReg)) {
    if (!match[1]) continue
    try {
      const cardData = JSON.parse(decodeURIComponent(match[1])) as { src?: string }
      htmlImgDataList.push(cardData.src || '')
    } catch {
      htmlImgDataList.push('')
    }
  }

  const replaceURLCountMap = new Map<string, number>()
  let fixed = markdown
  for (const imgUrl of imgList) {
    let matchURL = ''
    try {
      const { origin, pathname } = new URL(imgUrl)
      matchURL = `${origin}${pathname}`
    } catch {
      continue
    }

    const targetURL = htmlImgDataList.find((item, index) => {
      const isFind = item.startsWith(matchURL)
      if (isFind) htmlImgDataList.splice(index, 1)
      return isFind
    })
    if (!targetURL) continue

    const count = replaceURLCountMap.get(imgUrl) || 0
    let current = 0
    fixed = fixed.replace(new RegExp(escapeRegExp(imgUrl), 'g'), (match) => {
      const result = current === count ? targetURL : match
      current += 1
      return result
    })
    replaceURLCountMap.set(imgUrl, count + 1)
  }
  return fixed
}

export function fixInlineCode(markdown: string, htmlData: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      if (/^\s*```/.test(line)) return line
      return line.replace(/`([^`\n]+)`/g, (raw, value: string) => {
        const hasHtmlTags = /<([a-z][\s\S]*?)>/i.test(value)
        const hasMarkdownLabel = /(~~|\*\*|_)/g.test(value)
        if (!hasHtmlTags && !hasMarkdownLabel) return raw
        const escaped = value.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        if (htmlData.includes(escaped)) return raw
        return `<code>${value}</code>`
      })
    })
    .join('\n')
}

export function parseSheet(sheetStr: string): string {
  if (!sheetStr) return ''
  const input = sheetInflateInput(sheetStr)
  const parseStr = pako.inflate(input, { to: 'string' })
  const sheetList = JSON.parse(parseStr) as Array<{ name: string; data: Record<string, Record<string, { v: unknown }>> }>
  let markdown = ''
  for (const item of sheetList) {
    markdown += `\n## ${item.name}\n\n${genMarkdownTable(item.data)}`
  }
  return markdown
}

function sheetInflateInput(sheetStr: string): Uint8Array {
  if (/^[\x00-\xff]*$/.test(sheetStr)) {
    return Uint8Array.from(sheetStr, (char) => char.charCodeAt(0))
  }
  try {
    return Buffer.from(sheetStr, 'base64')
  } catch {
    return Buffer.from(sheetStr)
  }
}

export function genMarkdownTable(data: Record<string, Record<string, { v: unknown }>>): string {
  let rowList = Object.keys(data)
  rowList = rowList.filter((rowKey) => {
    const colList = Object.keys(data[rowKey] || {})
    return colList.some((col) => data?.[rowKey]?.[col]?.v)
  })
  let colList: string[] = []
  rowList.forEach((rowKey) => {
    colList = colList.concat(Object.keys(data[rowKey] || {}))
  })
  const rowMax = Math.max(...rowList.map((row) => Number(row)))
  const colMax = Math.max(...colList.map((col) => Number(col)))
  if (rowMax < 0 || colMax < 0 || !Number.isFinite(rowMax) || !Number.isFinite(colMax)) return ''
  const title = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const header = `| |${Array(colMax + 1).fill(' ').map((_v, i) => title[i % title.length]).join(' | ')}|`
  const divider = `|${Array(colMax + 2).fill('---').join(' |')}|`
  let table = `${header}\n${divider}\n`
  for (let row = 0; row < rowMax + 1; row += 1) {
    const values: string[] = []
    for (let col = 0; col < colMax + 1; col += 1) {
      values.push(sheetValueToMarkdown(data?.[row]?.[col]?.v))
    }
    table += `| ${row + 1} | ${values.join(' | ')}|\n`
  }
  return table
}

function sheetValueToMarkdown(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value.replace(/\|/g, '\\|')
  if (typeof value !== 'object') return String(value)
  const data = value as Record<string, any>
  if (data.class === 'image' && data.src) return `![${data.name || 'image'}](${data.src})`
  if (data.class === 'checkbox') return data.value ? '[x]' : '[ ]'
  if (data.class === 'link') return `[${data.text || data.url}](${data.url})`
  if (data.class === 'select' && Array.isArray(data.value)) return data.value.join(',')
  return ''
}

export function handleMarkdownFooter(markdown: string, options: {
  articleTitle: string
  articleUrl: string
  toc: boolean
  articleUpdateTime: string
  hideFooter: boolean
  convertMarkdownVideoLinks: boolean
}): string {
  let data = markdown.replace(/<a\b[^>]*?>(\s*?)<\/a>/gm, '')
  const header = options.articleTitle ? `# ${options.articleTitle}\n\n` : ''
  const tocData = options.toc ? markdownToc(data).content : ''
  const tocBlock = tocData ? `${tocData}\n\n---\n\n` : ''
  let footer = ''
  if (!options.hideFooter) {
    footer = '\n\n'
    if (options.articleUpdateTime) footer += `> 更新: ${options.articleUpdateTime}  \n`
    if (options.articleUrl) footer += `> 原文: <${options.articleUrl}>`
  }
  data = data.replace(/^# .*?\n+/, '')
  const result = `${header}${tocBlock}${data}${footer}`
  return options.convertMarkdownVideoLinks ? convertMarkdownVideoLinks(result) : result
}

function convertMarkdownVideoLinks(markdown: string): string {
  return markdown.replace(/\[(.*?)\]\((.*?)\.(mp4|mp3)\)/gm, (_match, alt: string, url: string, extType: string) => {
    const htmlTag = extType === 'mp3' ? 'audio' : 'video'
    return `<${htmlTag} controls width="800" alt="${alt}" src="${url}.${extType}"></${htmlTag}>`
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function readProgress(bookPath: string): Promise<ProgressItem[]> {
  const file = path.join(bookPath, 'progress.json')
  if (!existsSync(file)) return []
  try {
    return JSON.parse(await readFile(file, 'utf8')) as ProgressItem[]
  } catch {
    return []
  }
}

export async function writeProgress(bookPath: string, items: ProgressItem[]): Promise<void> {
  await mkdir(bookPath, { recursive: true })
  await writeFile(path.join(bookPath, 'progress.json'), `${JSON.stringify(items, null, 2)}\n`)
}

export function shouldSkipByIncremental(current: ProgressItem, previous: ProgressItem | undefined, incremental: boolean): boolean {
  if (!incremental || !previous) return false
  return current.contentUpdatedAt !== undefined && previous.contentUpdatedAt === current.contentUpdatedAt
}

export async function downloadFile(params: { url: string; file: string; headers: Record<string, string> }): Promise<void> {
  await mkdir(path.dirname(params.file), { recursive: true })
  const res = await fetch(params.url, { headers: params.headers })
  if (!res.ok || !res.body) throw new Error(`download failed: ${res.status} ${params.url}`)
  const body = res.body
  const writer = createWriteStream(params.file)
  await new Promise<void>((resolve, reject) => {
    body.pipeTo(new WritableStream({
      write(chunk) {
        writer.write(Buffer.from(chunk))
      },
      close() {
        writer.end(resolve)
      },
      abort(reason) {
        writer.destroy()
        reject(reason)
      }
    })).catch(reject)
  })
}

export async function localizeImages(markdown: string, params: {
  savePath: string
  imageDir: string
  referer: string
  headers: Record<string, string>
  imageServiceDomains: string[]
}): Promise<string> {
  let data = markdown
  const urls = getMarkdownImageList(markdown)
  for (const [index, rawUrl] of urls.entries()) {
    const url = captureImageUrl(rawUrl, params.imageServiceDomains)
    const ext = extensionFromUrl(rawUrl) || '.png'
    const fileName = `${index + 1}${ext}`
    const relPath = `${params.imageDir}/${fileName}`
    const fullPath = path.resolve(params.savePath, relPath)
    try {
      await downloadFile({
        url,
        file: fullPath,
        headers: {
          ...params.headers,
          referer: params.referer
        }
      })
      data = data.replace(rawUrl, relPath)
    } catch {
      // Keep remote URL if download fails.
    }
  }
  return data
}

export async function localizeAttachments(markdown: string, params: {
  savePath: string
  attachmentsDir: string
  headers: Record<string, string>
  ignoreAttachments: boolean | string
}): Promise<string> {
  if (params.ignoreAttachments === true) return markdown
  const attachmentReg = /\[(.*?)\]\((https?:\/\/.*?\.yuque\.com\/attachments.*?)\)/g
  let data = markdown
  const matches = Array.from(markdown.matchAll(attachmentReg))
  for (const match of matches) {
    const raw = match[0]
    const label = match[1] || 'attachment'
    const url = match[2]
    if (!url || shouldIgnoreAttachment(url, params.ignoreAttachments)) continue
    const fileName = fixPath(label || path.basename(new URL(url).pathname) || 'attachment')
    const relPath = `${params.attachmentsDir}/${fileName}`
    const fullPath = path.resolve(params.savePath, relPath)
    try {
      await downloadFile({ url, file: fullPath, headers: params.headers })
      data = data.replace(raw, `[附件: ${fileName}](${relPath})`)
    } catch {
      // Keep original URL if download fails.
    }
  }
  return data
}

export async function localizeMedia(markdown: string, htmlData: string, params: {
  savePath: string
  attachmentsDir: string
  headers: Record<string, string>
  ignoreAttachments: boolean | string
  getVideoInfo: (videoId: string) => Promise<Record<string, any> | false>
}): Promise<string> {
  if (params.ignoreAttachments === true) return markdown
  let data = markdown
  const mediaItems = [
    ...parseMarkdownVideoCards(markdown),
    ...parseHtmlMediaCards(htmlData, 'audio'),
    ...parseHtmlMediaCards(htmlData, 'video')
  ].filter((item) => !shouldIgnoreAttachment(item.name || item.id, params.ignoreAttachments))

  for (const item of mediaItems) {
    const info = await params.getVideoInfo(item.id)
    if (!info) continue
    const url = item.type === 'audio' ? info.audio : info.video
    const fileName = fixPath(item.name || info.name || info.fileName || path.basename(item.id))
    if (!url || !fileName) continue
    const relPath = `${params.attachmentsDir}/${fileName}`
    const fullPath = path.resolve(params.savePath, relPath)
    try {
      await downloadFile({ url, file: fullPath, headers: params.headers })
      if (item.raw) data = data.replace(item.raw, `[音视频附件: ${fileName}](${relPath})`)
      else data += `\n\n[音视频附件: ${fileName}](${relPath})\n`
    } catch {
      // Keep original if download fails.
    }
  }
  return data
}

export async function writeSummary(params: {
  bookPath: string
  bookName?: string
  bookDesc?: string
  progressItems: ProgressItem[]
}): Promise<string> {
  let content = `# ${params.bookName || path.basename(params.bookPath)}\n\n`
  if (params.bookDesc) content += `> ${params.bookDesc}\n\n`
  const byParent = new Map<string, ProgressItem[]>()
  for (const item of params.progressItems) {
    const parent = item.toc.parent_uuid || ''
    byParent.set(parent, [...(byParent.get(parent) || []), item])
  }
  content += renderSummaryTree(byParent, '', 2)
  await writeFile(path.join(params.bookPath, 'index.md'), content)
  return content
}

export function buildTocMaps(tocList: YuqueTocItem[]): Map<string, YuqueTocItem> {
  return new Map(tocList.map((toc) => [toc.uuid, toc]))
}

function renderSummaryTree(byParent: Map<string, ProgressItem[]>, parent: string, level: number): string {
  let content = ''
  for (const item of byParent.get(parent) || []) {
    const title = fixPath(item.toc.title)
    const type = item.toc.type?.toLowerCase()
    if (type === 'title' && !item.path.endsWith('.md')) {
      content += `\n${'#'.repeat(level)} ${title}\n\n`
    } else {
      const link = item.path.replace(/\s/g, '%20')
      content += `${level <= 2 ? '\n##' : '-'} [${title}](${link})\n`
    }
    content += renderSummaryTree(byParent, item.toc.uuid, level + 1)
  }
  return content
}

function normalizeIgnoreAttachments(value: unknown): boolean | string {
  if (value === undefined || value === false) return false
  if (value === true) return true
  return String(value)
}

function shouldIgnoreAttachment(url: string, ignore: boolean | string): boolean {
  if (ignore === true) return true
  if (typeof ignore !== 'string') return false
  const ext = extensionFromUrl(url).replace(/^\./, '')
  return ignore.split(',').map((item) => item.trim()).includes(ext)
}

function parseMarkdownVideoCards(markdown: string): Array<{ type: 'video'; id: string; name: string; raw: string }> {
  const result: Array<{ type: 'video'; id: string; name: string; raw: string }> = []
  const linkReg = /\[([^\]]*)\]\(([^)]*_lake_card[^)]*)\)/g
  for (const match of markdown.matchAll(linkReg)) {
    try {
      const url = new URL(match[2])
      const encoded = url.searchParams.get('_lake_card')
      if (!encoded) continue
      const data = JSON.parse(decodeURIComponent(encoded))
      if (data.videoId) result.push({ type: 'video', id: data.videoId, name: data.name || match[1], raw: match[0] })
    } catch {
      // ignore
    }
  }
  return result
}

function parseHtmlMediaCards(htmlData: string, type: 'audio' | 'video'): Array<{ type: 'audio' | 'video'; id: string; name: string; raw: string }> {
  const reg = new RegExp(`name="${type}" value="data:(.*?${type}Id.*?)".*?><\\/card>`, 'gm')
  const result: Array<{ type: 'audio' | 'video'; id: string; name: string; raw: string }> = []
  for (const match of htmlData.matchAll(reg)) {
    try {
      const data = JSON.parse(decodeURIComponent(match[1]))
      const id = type === 'audio' ? data.audioId : data.videoId
      if (id) result.push({ type, id, name: data.name || data.fileName || path.basename(id), raw: '' })
    } catch {
      // ignore
    }
  }
  return result
}

export function captureImageUrl(url: string, imageServiceDomains: string[]): string {
  try {
    const { host, pathname } = new URL(url)
    if (imageServiceDomains.includes(host) || !pathname) return url
  } catch {
    return url
  }
  const hash = crypto.createHash('sha256')
  hash.update(`${IMAGE_SIGN_KEY}${url}`)
  const sign = hash.digest('hex')
  return `https://www.yuque.com/api/filetransfer/images?url=${encodeURIComponent(url)}&sign=${sign}`
}

function extensionFromUrl(url: string): string {
  try {
    const ext = path.extname(new URL(url).pathname)
    return ext.slice(0, 12)
  } catch {
    return ''
  }
}

function pad(num: number): string {
  return num.toString().padStart(2, '0')
}
