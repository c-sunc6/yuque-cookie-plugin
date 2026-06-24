import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
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
    expect(await readFile(path.join(bookPath, 'Title1/文档1.md'), 'utf8')).toContain('# 文档1')
    expect(await readFile(path.join(bookPath, 'Title2/文档2.md'), 'utf8')).toContain('# 文档2')
    expect(await readFile(path.join(bookPath, 'index.md'), 'utf8')).toContain('## Title1')
    expect((await readdir(path.join(bookPath, 'Title1/img/002'))).length).toBeGreaterThan(0)
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
    ...overrides
  }
}
