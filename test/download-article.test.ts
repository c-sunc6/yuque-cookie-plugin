import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { YuqueCookieClient } from '../src/client-cookie.ts'
import { downloadArticleForTest } from '../src/downloader.ts'
import type { DownloadOptions, DownloadWarning, ProgressItem } from '../src/types.ts'

let cwd = ''
let client: YuqueCookieClient

describe('downloadArticle migrated coverage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(async () => {
    server.resetHandlers()
    if (cwd) await rm(cwd, { recursive: true, force: true })
  })
  afterAll(() => server.close())

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-download-article-'))
    client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
  })

  it('downloads a normal markdown article with local images and footer', async () => {
    const progressItem = progress('one')
    const saveFilePath = path.join(cwd, 'test.md')
    const result = await downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'one',
      savePath: cwd,
      saveFilePath,
      uuid: 'img_dir_uuid',
      articleTitle: 'downloadArticle Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/one',
      host: 'https://www.yuque.com',
      imageServiceDomains: ['gxr404.com'],
      options: options(),
      progressItem
    })

    expect(result.skipped).toBe(false)
    const markdown = await readFile(saveFilePath, 'utf8')
    expect(markdown).toContain('# downloadArticle Title')
    expect(markdown).toContain('> 原文: <https://www.yuque.com/yuque/base1/one>')
    expect(markdown).toContain('img/img_dir_uuid/')
    expect((await readdir(path.join(cwd, 'img/img_dir_uuid'))).length).toBeGreaterThan(0)
    expect(progressItem.contentUpdatedAt).toBe('2025-03-12T12:59:27.000Z')
  })

  it('throws when markdown sourcecode is missing', async () => {
    await expect(downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'sourcecodeNull',
      savePath: cwd,
      saveFilePath: path.join(cwd, 'test.md'),
      uuid: 'uuid',
      articleTitle: 'Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/sourcecodeNull',
      host: 'https://www.yuque.com',
      imageServiceDomains: [],
      options: options(),
      progressItem: progress('sourcecodeNull')
    })).rejects.toThrow(/download article Error/)
  })

  it('writes unsupported placeholders for board and table documents', async () => {
    for (const itemUrl of ['board', 'table']) {
      const saveFilePath = path.join(cwd, `${itemUrl}.md`)
      await downloadArticleForTest(client, {
        bookId: 1111,
        itemUrl,
        savePath: cwd,
        saveFilePath,
        uuid: itemUrl,
        articleTitle: itemUrl,
        articleUrl: `https://www.yuque.com/yuque/base1/${itemUrl}`,
        host: 'https://www.yuque.com',
        imageServiceDomains: [],
        options: options(),
        progressItem: progress(itemUrl)
      })
      expect(await readFile(saveFilePath, 'utf8')).toContain(`[Unsupported Yuque document type: ${itemUrl}]`)
    }
  })

  it('downloads sheet documents as markdown tables', async () => {
    const saveFilePath = path.join(cwd, 'sheet.md')
    await downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'sheet',
      savePath: cwd,
      saveFilePath,
      uuid: 'sheet',
      articleTitle: 'Sheet Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/sheet',
      host: 'https://www.yuque.com',
      imageServiceDomains: [],
      options: options(),
      progressItem: progress('sheet')
    })
    const markdown = await readFile(saveFilePath, 'utf8')
    expect(markdown).toContain('# Sheet Title')
    expect(markdown).toContain('## Sheet1')
    expect(markdown).toContain('GSSSAPPAP')
  })

  it('uses sanitized uuid directories for attachments and images', async () => {
    const saveFilePath = path.join(cwd, 'attachments.md')
    await downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'attachments',
      savePath: cwd,
      saveFilePath,
      uuid: 'img:dir/uuid',
      articleTitle: 'Attachments Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/attachments',
      host: 'https://www.yuque.com',
      imageServiceDomains: ['gxr404.com'],
      options: options(),
      progressItem: progress('attachments')
    })
    const markdown = await readFile(saveFilePath, 'utf8')
    expect(markdown).toContain('img/img_dir_uuid/')
    expect(markdown).toContain('attachments/img_dir_uuid/')
  })

  it('collects attachment download warnings without failing the article', async () => {
    const saveFilePath = path.join(cwd, 'attachments-error.md')
    const warnings: DownloadWarning[] = []
    const result = await downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'attachments-error',
      savePath: cwd,
      saveFilePath,
      uuid: 'attachments-error',
      articleTitle: 'Attachments Error Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/attachments-error',
      host: 'https://www.yuque.com',
      imageServiceDomains: [],
      options: options(),
      progressItem: progress('attachments-error'),
      warnings
    })
    expect(result.skipped).toBe(false)
    expect(await readFile(saveFilePath, 'utf8')).toContain('[error.pdf](https://www.yuque.com/attachments/error.pdf)')
    expect(warnings).toEqual([
      expect.objectContaining({
        type: 'attachment',
        title: 'Attachments Error Title',
        url: 'https://www.yuque.com/attachments/error.pdf',
        error: expect.stringContaining('download failed: 404')
      })
    ])
  })

  it('skips unchanged documents in incremental mode', async () => {
    const progressItem = progress('one')
    const previousProgressItem = {
      ...progressItem,
      contentUpdatedAt: '2025-03-12T12:59:27.000Z'
    }
    const result = await downloadArticleForTest(client, {
      bookId: 1111,
      itemUrl: 'one',
      savePath: cwd,
      saveFilePath: path.join(cwd, 'test.md'),
      uuid: 'uuid',
      articleTitle: 'Title',
      articleUrl: 'https://www.yuque.com/yuque/base1/one',
      host: 'https://www.yuque.com',
      imageServiceDomains: [],
      options: options({ incremental: true }),
      progressItem,
      previousProgressItem
    })
    expect(result.skipped).toBe(true)
  })
})

function options(overrides: Partial<DownloadOptions> = {}): DownloadOptions {
  return {
    distDir: cwd,
    ignoreImg: false,
    ignoreAttachments: false,
    toc: false,
    incremental: false,
    convertMarkdownVideoLinks: false,
    hideFooter: false,
    quiet: true,
    ...overrides
  }
}

function progress(uuid: string): ProgressItem {
  return {
    path: `${uuid}.md`,
    pathIdList: [uuid],
    pathTitleList: [uuid],
    toc: {
      type: 'DOC',
      title: uuid,
      uuid,
      url: uuid,
      parent_uuid: '',
      child_uuid: ''
    }
  }
}
