import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { YuqueCookieClient } from './client-cookie.ts'
import { writeReport } from './reports.ts'
import type { DownloadOptions, DownloadWarning, DownloadWarningSummary, ProgressItem, YuqueTocItem } from './types.ts'
import {
  buildResourceManifest,
  buildTocMaps,
  fixInlineCode,
  fixLatex,
  fixMarkdownImage,
  fixPath,
  formatDate,
  getMarkdownImageList,
  handleMarkdownFooter,
  localizeAttachments,
  localizeFileCards,
  localizeImages,
  localizeMedia,
  parseSheet,
  readProgress,
  shouldSkipByIncremental,
  writeProgress,
  writeSummary
} from './download-utils.ts'

export async function downloadBook(client: YuqueCookieClient, url: string, options: DownloadOptions): Promise<Record<string, unknown>> {
  const book = await client.getBookInfo(url)
  if (!book.tocList.length) throw new Error('No found toc list')
  const bookPath = path.resolve(options.distDir, book.bookName ? fixPath(book.bookName) : String(book.bookId))
  await mkdir(bookPath, { recursive: true })

  const previous = new Map((await readProgress(bookPath)).map((item) => [item.toc.uuid, item]))
  const tocMap = buildTocMaps(book.tocList)
  const progressItems: ProgressItem[] = []
  const articleUrlPrefix = url.replace(new RegExp(`(.*?/${book.bookSlug}).*`), '$1')
  const failures: Array<{ title: string; url?: string; error: string; retry_url?: string }> = []
  const warnings: DownloadWarning[] = []
  let downloaded = 0
  let skipped = 0
  let handledDocs = 0
  const docTotal = book.tocList.filter((item) => item.type?.toLowerCase() !== 'title' && item.type?.toLowerCase() !== 'link' && item.url).length
  logProgress(options, `Downloading book "${book.bookName || book.bookId}" (${docTotal} docs) -> ${bookPath}`)

  for (const item of book.tocList) {
    const progressItem = buildProgressItem(item, tocMap)
    if (!progressItem) continue
    progressItems.push(progressItem)
    const itemType = item.type.toLowerCase()
    if (itemType === 'title' && !item.url) {
      await mkdir(path.resolve(bookPath, progressItem.path), { recursive: true })
      continue
    }
    if (itemType === 'link') {
      warnings.push({
        type: 'link',
        title: item.title,
        url: item.url,
        error: 'TOC link node is not a Yuque document and was not downloaded.'
      })
      continue
    }
    if (!item.url) continue

    try {
      const articleUrl = `${articleUrlPrefix}/${item.url}`
      logProgress(options, `[${handledDocs + 1}/${docTotal}] ${item.title}`)
      const articleResult = await downloadArticleForTest(client, {
        bookId: book.bookId,
        itemUrl: item.url,
        savePath: path.resolve(bookPath, progressItem.savePath || ''),
        saveFilePath: path.resolve(bookPath, progressItem.path),
        uuid: item.uuid,
        articleTitle: item.title,
        articleUrl,
        host: book.host,
        imageServiceDomains: book.imageServiceDomains,
        options,
        progressItem,
        previousProgressItem: previous.get(item.uuid),
        warnings
      })
      if (articleResult.skipped) {
        skipped += 1
        logProgress(options, `  skipped unchanged: ${progressItem.path}`)
      } else {
        downloaded += 1
        logProgress(options, `  saved: ${progressItem.path}`)
      }
    } catch (error) {
      logProgress(options, `  failed: ${item.title}`)
      failures.push({
        title: item.title,
        url: item.url,
        retry_url: `${articleUrlPrefix}/${item.url}`,
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      handledDocs += 1
    }
    await writeProgress(bookPath, progressItems)
  }

  await writeSummary({
    bookPath,
    bookName: book.bookName,
    bookDesc: book.bookDesc,
    progressItems
  })
  await writeProgress(bookPath, progressItems)
  const resourceManifest = await buildResourceManifest(bookPath)

  const summary = {
    ok: failures.length === 0,
    book_path: bookPath,
    total: progressItems.length,
    docs: progressItems.filter((item) => {
      const type = item.toc.type?.toLowerCase()
      return type !== 'title' && type !== 'link' && item.path.endsWith('.md')
    }).length,
    downloaded,
    skipped,
    incremental: options.incremental,
    options,
    resources: resourceManifest,
    warnings,
    warning_summary: buildWarningSummary(warnings),
    failures,
    retry: buildRetryPlan('download-doc', failures.map((item) => item.retry_url || item.url).filter(isString), options)
  }
  const report = await writeReport('download-book', summary)
  return {
    ...summary,
    report
  }
}

export async function downloadDocs(client: YuqueCookieClient, urls: string[], options: DownloadOptions): Promise<Record<string, unknown>> {
  const distPath = path.resolve(options.distDir)
  await mkdir(distPath, { recursive: true })
  const failures: Array<{ url: string; error: string }> = []
  const warnings: DownloadWarning[] = []
  const files: string[] = []
  let downloaded = 0
  logProgress(options, `Downloading ${urls.length} doc(s) -> ${distPath}`)

  for (const [index, url] of urls.entries()) {
    try {
      const doc = await client.getDocInfoFromUrl(url)
      if (!doc.docSlug || !doc.bookId) throw new Error('Failed to get document info from URL')
      const fileName = fixPath(doc.docTitle || doc.docSlug)
      const saveFilePath = path.resolve(distPath, `${fileName}.md`)
      logProgress(options, `[${index + 1}/${urls.length}] ${doc.docTitle || doc.docSlug}`)
      const progressItem: ProgressItem = {
        path: `${fileName}.md`,
        savePath: '',
        pathTitleList: [fileName],
        pathIdList: [String(doc.docId || doc.docSlug)],
        toc: {
          type: 'DOC',
          title: doc.docTitle || doc.docSlug,
          uuid: String(doc.docId || doc.docSlug),
          url: doc.docSlug,
          parent_uuid: '',
          child_uuid: ''
        }
      }
      await downloadArticleForTest(client, {
        bookId: doc.bookId,
        itemUrl: doc.docSlug,
        savePath: distPath,
        saveFilePath,
        uuid: String(doc.docId || doc.docSlug),
        articleTitle: doc.docTitle || doc.docSlug,
        articleUrl: url,
        host: doc.host,
        imageServiceDomains: doc.imageServiceDomains,
        options,
        progressItem,
        warnings
      })
      downloaded += 1
      files.push(saveFilePath)
      logProgress(options, `  saved: ${saveFilePath}`)
    } catch (error) {
      logProgress(options, `  failed: ${url}`)
      failures.push({
        url,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  const resourceManifest = await buildResourceManifest(distPath)
  const summary = {
    ok: failures.length === 0,
    dist_path: distPath,
    files,
    downloaded,
    options,
    resources: resourceManifest,
    warnings,
    warning_summary: buildWarningSummary(warnings),
    failures,
    retry: buildRetryPlan('download-doc', failures.map((item) => item.url).filter(isString), options)
  }
  const report = await writeReport('download-doc', summary)
  return {
    ...summary,
    report
  }
}

export async function downloadArticleForTest(client: YuqueCookieClient, params: {
  bookId: number
  itemUrl: string
  savePath: string
  saveFilePath: string
  uuid: string
  articleTitle: string
  articleUrl: string
  host?: string
  imageServiceDomains: string[]
  options: DownloadOptions
  progressItem: ProgressItem
  previousProgressItem?: ProgressItem
  warnings?: DownloadWarning[]
}): Promise<{ skipped: boolean }> {
  const { response, apiUrl, httpStatus } = await client.getDocMarkdownData({
    articleUrl: params.itemUrl,
    bookId: params.bookId,
    host: params.host,
    isMarkdown: true
  })
  const data = response?.data || {}
  params.progressItem.createAt = data.created_at || ''
  params.progressItem.contentUpdatedAt = data.content_updated_at || ''
  params.progressItem.publishedAt = data.published_at || ''
  params.progressItem.firstPublishedAt = data.first_published_at || ''

  if (shouldSkipByIncremental(params.progressItem, params.previousProgressItem, params.options.incremental)) {
    return { skipped: true }
  }

  let markdown = ''
  const type = String(data.type || '').toLowerCase()
  if (type === 'sheet') {
    const raw = await client.getDocMarkdownData({
      articleUrl: params.itemUrl,
      bookId: params.bookId,
      host: params.host,
      isMarkdown: false
    })
    const rawContent = raw.response?.data?.content
    const content = rawContent ? JSON.parse(rawContent) : {}
    markdown = content?.sheet ? parseSheet(content.sheet) : ''
  } else if (type === 'board' || type === 'table') {
    markdown = `[Unsupported Yuque document type: ${type}]\n`
  } else if (typeof data.sourcecode === 'string') {
    markdown = fixLatex(data.sourcecode)
  } else {
    throw new Error(`download article Error: ${apiUrl}, http status ${httpStatus}`)
  }

  const raw = await client.getDocMarkdownData({
    articleUrl: params.itemUrl,
    bookId: params.bookId,
    host: params.host,
    isMarkdown: false
  })
  const htmlData = raw.response?.data?.content || ''

  const imgList = getMarkdownImageList(markdown)
  if (imgList.length && !params.options.ignoreImg) {
    markdown = fixMarkdownImage(imgList, markdown, htmlData)
  }

  if (params.options.ignoreAttachments !== true) {
    markdown = await localizeAttachments(markdown, {
      savePath: params.savePath,
      attachmentsDir: `attachments/${fixPath(params.uuid)}`,
      headers: client.htmlHeaders(),
      ignoreAttachments: params.options.ignoreAttachments,
      warnings: params.warnings,
      title: params.articleTitle
    })
  }

  if (params.options.ignoreAttachments !== true) {
    markdown = await localizeFileCards(markdown, htmlData, {
      savePath: params.savePath,
      attachmentsDir: `attachments/${fixPath(params.uuid)}`,
      headers: client.htmlHeaders(),
      ignoreAttachments: params.options.ignoreAttachments,
      warnings: params.warnings,
      title: params.articleTitle
    })
  }

  if (params.options.ignoreAttachments !== true) {
    markdown = await localizeMedia(markdown, htmlData, {
      savePath: params.savePath,
      attachmentsDir: `attachments/${fixPath(params.uuid)}`,
      headers: client.htmlHeaders(),
      ignoreAttachments: params.options.ignoreAttachments,
      getVideoInfo: (videoId) => client.getVideoInfo(videoId),
      warnings: params.warnings,
      title: params.articleTitle
    })
  }

  if (!params.options.ignoreImg) {
    markdown = await localizeImages(markdown, {
      savePath: params.savePath,
      imageDir: `img/${fixPath(params.uuid)}`,
      referer: params.articleUrl,
      headers: client.htmlHeaders(),
      imageServiceDomains: params.imageServiceDomains,
      warnings: params.warnings,
      title: params.articleTitle
    })
  }

  markdown = fixInlineCode(markdown, htmlData)
  markdown = handleMarkdownFooter(markdown, {
    articleTitle: params.articleTitle,
    articleUrl: params.articleUrl,
    toc: params.options.toc,
    articleUpdateTime: formatDate(data.content_updated_at || ''),
    hideFooter: params.options.hideFooter,
    convertMarkdownVideoLinks: params.options.convertMarkdownVideoLinks
  })

  await mkdir(path.dirname(params.saveFilePath), { recursive: true })
  await writeFile(params.saveFilePath, markdown)
  return { skipped: false }
}

function buildProgressItem(item: YuqueTocItem, tocMap: Map<string, YuqueTocItem>): ProgressItem | null {
  if (!item.type) return null
  const pathItems = getPathItems(item, tocMap)
  const pathTitleList = pathItems.map((toc) => fixPath(toc.title))
  const pathIdList = pathItems.map((toc) => toc.uuid)
  const type = item.type.toLowerCase()
  if (type === 'title' && !item.url) {
    return {
      path: pathTitleList.join('/'),
      pathTitleList,
      pathIdList,
      toc: item
    }
  }
  if (!item.url) return null
  if (type === 'link') {
    return {
      path: pathTitleList.join('/'),
      savePath: pathTitleList.slice(0, -1).join('/'),
      pathTitleList,
      pathIdList,
      toc: item
    }
  }
  let mdPath = `${pathTitleList.join('/')}.md`
  let savePath = pathTitleList.slice(0, -1).join('/')
  if (type === 'doc' && item.child_uuid) {
    mdPath = `${pathTitleList.join('/')}/index.md`
    savePath = pathTitleList.join('/')
  }
  return {
    path: mdPath,
    savePath,
    pathTitleList,
    pathIdList,
    toc: item
  }
}

function getPathItems(item: YuqueTocItem, tocMap: Map<string, YuqueTocItem>): YuqueTocItem[] {
  const items = [item]
  let current = item
  while (current.parent_uuid && tocMap.has(current.parent_uuid)) {
    current = tocMap.get(current.parent_uuid)!
    items.unshift(current)
  }
  return items
}

function logProgress(options: DownloadOptions, message: string): void {
  if (options.quiet) return
  process.stderr.write(`${message}\n`)
}

function buildRetryPlan(command: 'download-doc', urls: string[], options: DownloadOptions): Record<string, unknown> {
  return {
    command,
    urls,
    count: urls.length,
    args: [
      command,
      ...urls,
      '--dist-dir',
      options.distDir,
      ...(options.ignoreImg ? ['--ignore-img'] : []),
      ...(options.ignoreAttachments === true ? ['--ignore-attachments'] : []),
      ...(typeof options.ignoreAttachments === 'string' ? ['--ignore-attachments', options.ignoreAttachments] : []),
      ...(options.toc ? ['--toc'] : []),
      ...(options.hideFooter ? ['--hide-footer'] : []),
      ...(options.quiet ? ['--quiet'] : [])
    ]
  }
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function buildWarningSummary(warnings: DownloadWarning[]): DownloadWarningSummary {
  const byType: Record<string, number> = {}
  for (const warning of warnings) {
    byType[warning.type] = (byType[warning.type] || 0) + 1
  }
  return {
    total: warnings.length,
    by_type: byType,
    retryable_resources: warnings
      .filter((warning) => warning.type !== 'link' && Boolean(warning.url))
      .map((warning) => ({
        type: warning.type,
        title: warning.title,
        url: warning.url!,
        file: warning.file,
        error: warning.error
      }))
  }
}
