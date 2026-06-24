import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { startMockYuqueHttpServer } from './helpers/mock-yuque-http.ts'

const execFileAsync = promisify(execFile)
let tempDir = ''
let mockServer: Awaited<ReturnType<typeof startMockYuqueHttpServer>>

describe('CLI download commands with cross-process mock server', () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'yuque-cli-download-'))
    mockServer = await startMockYuqueHttpServer()
  })

  afterEach(async () => {
    await mockServer.close()
    await rm(tempDir, { recursive: true, force: true })
  })

  it('downloads a book through the real CLI process', async () => {
    const { stdout } = await runCli([
      'download-book',
      `${mockServer.origin}/yuque/base1`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--quiet'
    ])
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({ ok: true, docs: 2, downloaded: 2, failures: [] })
    expect(await readFile(path.join(tempDir, '知识库TEST1/Title1/文档1.md'), 'utf8')).toContain('# 文档1')
  })

  it('prints progress to stderr while keeping final JSON on stdout', async () => {
    const { stdout, stderr } = await runCli([
      'download-book',
      `${mockServer.origin}/yuque/base1`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir
    ])
    expect(stderr).toContain('Downloading book "知识库TEST1"')
    expect(stderr).toContain('[1/2] 文档1')
    expect(stderr).toContain('saved: Title1/文档1.md')
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({ ok: true, docs: 2, downloaded: 2, failures: [] })
  })

  it('honors --ignore-img through the real CLI process', async () => {
    const { stdout } = await runCli([
      'download-book',
      `${mockServer.origin}/yuque/base1`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--ignore-img',
      '--quiet'
    ])
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({ ok: true, docs: 2, downloaded: 2, failures: [] })
    const markdown = await readFile(path.join(tempDir, '知识库TEST1/Title1/文档1.md'), 'utf8')
    expect(markdown).toContain('https://gxr404.com/1.jpeg')
    await expect(access(path.join(tempDir, '知识库TEST1/Title1/img'))).rejects.toThrow()
  })

  it('honors --toc through the real CLI process', async () => {
    const { stdout } = await runCli([
      'download-book',
      `${mockServer.origin}/yuque/base1`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--toc',
      '--ignore-img',
      '--quiet'
    ])
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({ ok: true, docs: 2, downloaded: 2, failures: [] })
    const markdown = await readFile(path.join(tempDir, '知识库TEST1/Title1/文档1.md'), 'utf8')
    expect(markdown).toContain('- [DOC1](#doc1)')
    expect(markdown).toContain('  * [SubTitle](#subtitle)')
    expect(markdown).toContain('---')
  })

  it('downloads multiple docs through the real CLI process', async () => {
    const { stdout } = await runCli([
      'download-doc',
      `${mockServer.origin}/yuque/testbook/testdoc`,
      `${mockServer.origin}/yuque/testbook/testdoc2`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--quiet'
    ])
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({ ok: true, downloaded: 2, failures: [] })
    expect(await readFile(path.join(tempDir, '测试文档.md'), 'utf8')).toContain('# 测试文档')
    expect(await readFile(path.join(tempDir, '测试文档2.md'), 'utf8')).toContain('# 测试文档2')
  })

  it('keeps successful doc downloads when one CLI URL fails', async () => {
    const { stdout } = await runCli([
      'download-doc',
      `${mockServer.origin}/yuque/testbook/testdoc`,
      `${mockServer.origin}/yuque/testbook/notfound`,
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--quiet'
    ])
    const result = JSON.parse(stdout.slice(stdout.indexOf('{')))
    expect(result).toMatchObject({
      ok: false,
      downloaded: 1,
      failures: [
        {
          url: `${mockServer.origin}/yuque/testbook/notfound`
        }
      ]
    })
    expect(await readFile(path.join(tempDir, '测试文档.md'), 'utf8')).toContain('# 测试文档')
  })

  it('fails the CLI for invalid doc URLs', async () => {
    await expect(runCli([
      'download-doc',
      'invalid-url',
      '--api-host',
      mockServer.origin,
      '--dist-dir',
      tempDir,
      '--quiet'
    ])).rejects.toMatchObject({
      code: 1,
      stdout: expect.stringContaining('"ok": false')
    })
  })
})

function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync('node', ['--import', 'tsx', './src/cli.ts', ...args], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      YUQUE_SESSION: 'session',
      YUQUE_CTOKEN: 'ctoken'
    },
    maxBuffer: 1024 * 1024
  })
}
