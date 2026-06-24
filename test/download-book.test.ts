import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { YuqueCookieClient } from '../src/client-cookie.ts'
import { downloadBook } from '../src/downloader.ts'
import type { DownloadOptions } from '../src/types.ts'

let cwd = ''
let client: YuqueCookieClient

describe('downloadBook list/summary coverage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(async () => {
    server.resetHandlers()
    if (cwd) await rm(cwd, { recursive: true, force: true })
  })
  afterAll(() => server.close())

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-download-book-'))
    client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
  })

  it('downloads a mocked book with title folders and docs', async () => {
    const result = await downloadBook(client, 'https://www.yuque.com/yuque/base1', options())
    expect(result).toMatchObject({
      ok: true,
      total: 4,
      docs: 2,
      downloaded: 2,
      skipped: 0,
      failures: []
    })
    const bookPath = String(result.book_path)
    const summary = await readFile(path.join(bookPath, 'index.md'), 'utf8')
    expect(summary).toContain('# 知识库TEST1')
    expect(summary).toContain('> 知识库 test desc')
    expect(summary).toContain('## Title1')
    expect(summary).toContain('- [文档1](Title1/文档1.md)')
    expect(summary).toContain('## Title2')
    expect(summary).toContain('- [文档2](Title2/文档2.md)')

    const doc1 = await readFile(path.join(bookPath, 'Title1/文档1.md'), 'utf8')
    expect(doc1).toContain('# 文档1')
    expect(doc1).toContain('## SubTitle')
    expect(doc1).toContain('img/002/')
    expect(doc1).toContain('> 更新: 2025-03-12 20:59:27')
    expect(doc1).toContain('> 原文: <https://www.yuque.com/yuque/base1/one>')
    const doc2 = await readFile(path.join(bookPath, 'Title2/文档2.md'), 'utf8')
    expect(doc2).toContain('# 文档2')
    expect(doc2).toContain('### Title2')
    expect(doc2).toContain('> 原文: <https://www.yuque.com/yuque/base1/two>')

    const progress = JSON.parse(await readFile(path.join(bookPath, 'progress.json'), 'utf8'))
    expect(progress).toHaveLength(4)
    expect(progress.map((item: { path: string }) => item.path)).toEqual([
      'Title1',
      'Title1/文档1.md',
      'Title2',
      'Title2/文档2.md'
    ])
    expect(progress[1]).toMatchObject({
      savePath: 'Title1',
      pathTitleList: ['Title1', '文档1'],
      pathIdList: ['001', '002'],
      contentUpdatedAt: '2025-03-12T12:59:27.000Z',
      toc: {
        type: 'DOC',
        title: '文档1',
        uuid: '002',
        url: 'one',
        parent_uuid: '001'
      }
    })

    const imageFiles = (await readdir(path.join(bookPath, 'Title1/img/002'))).sort()
    expect(imageFiles).toHaveLength(2)
    expect(await Promise.all(imageFiles.map((file) => stat(path.join(bookPath, 'Title1/img/002', file)).then((item) => item.size)))).toEqual([
      99892,
      81011
    ])
  })

  it('downloads a title-doc node as index.md and child docs below it', async () => {
    const result = await downloadBook(client, 'https://www.yuque.com/yuque/title-doc', options())
    expect(result).toMatchObject({
      ok: true,
      total: 2,
      docs: 2,
      downloaded: 2,
      skipped: 0,
      failures: []
    })
    const bookPath = String(result.book_path)
    expect(await readFile(path.join(bookPath, 'Title1 文档/index.md'), 'utf8')).toContain('# Title1 文档')
    expect(await readFile(path.join(bookPath, 'Title1 文档/文档1.md'), 'utf8')).toContain('# 文档1')
  })

  it('keeps TOC link nodes in the summary without downloading them', async () => {
    const result = await downloadBook(client, 'https://www.yuque.com/yuque/with-link', options())
    expect(result).toMatchObject({
      ok: true,
      total: 3,
      docs: 1,
      downloaded: 1,
      skipped: 0,
      failures: [],
      warnings: [
        {
          type: 'link',
          title: '外部资料',
          url: 'https://example.com/reference'
        }
      ]
    })
    const bookPath = String(result.book_path)
    const summary = await readFile(path.join(bookPath, 'index.md'), 'utf8')
    expect(summary).toContain('## [外部资料](https://example.com/reference)')
    const progress = JSON.parse(await readFile(path.join(bookPath, 'progress.json'), 'utf8'))
    expect(progress.map((item: { path: string }) => item.path)).toEqual([
      'Title1',
      'Title1/文档1.md',
      '外部资料'
    ])
  })

  it('includes retry plan when book docs fail', async () => {
    const result = await downloadBook(client, 'https://www.yuque.com/yuque/with-failure', options({ quiet: true }))
    expect(result).toMatchObject({
      ok: false,
      docs: 2,
      downloaded: 1,
      failures: [
        {
          title: '失败文档',
          url: 'faildoc',
          retry_url: 'https://www.yuque.com/yuque/with-failure/faildoc'
        }
      ],
      retry: {
        command: 'download-doc',
        urls: ['https://www.yuque.com/yuque/with-failure/faildoc'],
        count: 1
      }
    })
    expect((result.retry as { args: string[] }).args).toEqual([
      'download-doc',
      'https://www.yuque.com/yuque/with-failure/faildoc',
      '--dist-dir',
      cwd,
      '--quiet'
    ])
  })

  it('skips unchanged docs on a second incremental run', async () => {
    await downloadBook(client, 'https://www.yuque.com/yuque/base1', options({ incremental: true }))
    const result = await downloadBook(client, 'https://www.yuque.com/yuque/base1', options({ incremental: true }))
    expect(result).toMatchObject({
      ok: true,
      docs: 2,
      downloaded: 0,
      skipped: 2,
      failures: []
    })
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
