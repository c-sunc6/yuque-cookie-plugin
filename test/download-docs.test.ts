import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { YuqueCookieClient } from '../src/client-cookie.ts'
import { downloadDocs } from '../src/downloader.ts'
import type { DownloadOptions } from '../src/types.ts'

let cwd = ''
let client: YuqueCookieClient

describe('downloadDocs migrated doc command coverage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(async () => {
    server.resetHandlers()
    if (cwd) await rm(cwd, { recursive: true, force: true })
  })
  afterAll(() => server.close())

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-download-docs-'))
    client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
  })

  it('downloads one or more document URLs', async () => {
    const result = await downloadDocs(client, [
      'https://www.yuque.com/yuque/testbook/testdoc',
      'https://www.yuque.com/yuque/testbook/testdoc2'
    ], options())

    expect(result.ok).toBe(true)
    expect(result.downloaded).toBe(2)
    expect(result.failures).toEqual([])
    expect(result.files).toHaveLength(2)
    expect(await readFile(path.join(cwd, '测试文档.md'), 'utf8')).toContain('# 测试文档')
    expect(await readFile(path.join(cwd, '测试文档2.md'), 'utf8')).toContain('# 测试文档2')
  })

  it('keeps successful downloads when one URL fails', async () => {
    const result = await downloadDocs(client, [
      'https://www.yuque.com/yuque/testbook/testdoc',
      'https://www.yuque.com/yuque/testbook/notfound'
    ], options())

    expect(result.ok).toBe(false)
    expect(result.downloaded).toBe(1)
    expect(result.failures).toMatchObject([
      {
        url: 'https://www.yuque.com/yuque/testbook/notfound'
      }
    ])
    expect(await readFile(path.join(cwd, '测试文档.md'), 'utf8')).toContain('# 测试文档')
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
