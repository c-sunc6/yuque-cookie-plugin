import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
let tempHome = ''

describe('CLI help', () => {
  afterEach(async () => {
    if (tempHome) await rm(tempHome, { recursive: true, force: true })
    tempHome = ''
  })

  it('lists Yuque cookie plugin commands', async () => {
    const { stdout } = await execFileAsync('node', ['--import', 'tsx', './src/cli.ts', '--help'], {
      cwd: process.cwd()
    })
    expect(stdout).toContain('auth-status')
    expect(stdout).toContain('download-book')
    expect(stdout).toContain('download-doc')
    expect(stdout).toContain('editor-serialize')
    expect(stdout).toContain('apply-lake')
    expect(stdout).toContain('--cookie-key')
    expect(stdout).toContain('--cookie-value')
    expect(stdout).toContain('--home-url')
    expect(stdout).toContain('--api-host')
    expect(stdout).toContain('--config-only')
  })

  it('does not require credentials for local diff-lake command errors', async () => {
    await expect(execFileAsync('node', ['--import', 'tsx', './src/cli.ts', 'diff-lake'], {
      cwd: process.cwd()
    })).rejects.toMatchObject({
      stderr: expect.stringContaining('Missing before/after snapshot path.')
    })
  })

  it('starts login flow when credentials are missing for Yuque web commands', async () => {
    tempHome = await mkdtemp(path.join(os.tmpdir(), 'yuque-cli-home-'))
    const child = execFile('node', ['--import', 'tsx', './src/cli.ts', 'inspect', 'https://www.yuque.com/yuque/base1', '--port', '45678'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: tempHome,
        YUQUE_SESSION: '',
        YUQUE_CTOKEN: ''
      },
      timeout: 2000
    })
    let stdout = ''
    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
      if (stdout.includes('Opening browser for Yuque cookie setup')) child.kill('SIGTERM')
    })
    await new Promise<void>((resolve) => child.on('exit', () => resolve()))
    expect(stdout).toContain('Missing Yuque credentials')
    expect(stdout).toContain('Opening browser for Yuque cookie setup')
  })

  it('generates serve-book config through the real CLI process without credentials', async () => {
    const bookDir = await mkdtemp(path.join(os.tmpdir(), 'yuque-cli-serve-book-'))
    try {
      await mkdir(path.join(bookDir, 'Section'), { recursive: true })
      await writeFile(path.join(bookDir, 'index.md'), '# Book\n')
      await writeFile(path.join(bookDir, 'Section/Doc.md'), '# Doc\n')
      await writeFile(path.join(bookDir, 'progress.json'), JSON.stringify([
        {
          path: 'Section/Doc.md',
          pathIdList: ['doc-1'],
          pathTitleList: ['Section', 'Doc'],
          toc: {
            type: 'DOC',
            title: 'Doc',
            uuid: 'doc-1',
            parent_uuid: '',
            child_uuid: '',
            url: 'doc'
          }
        }
      ], null, 2))

      const { stdout } = await execFileAsync('node', ['--import', 'tsx', './src/cli.ts', 'serve-book', bookDir, '--config-only'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          YUQUE_SESSION: '',
          YUQUE_CTOKEN: ''
        }
      })
      const result = JSON.parse(stdout)
      expect(result).toMatchObject({
        ok: true,
        root: bookDir,
        config: path.join(bookDir, '.vitepress/config.mjs'),
        generated: true
      })
      const config = await readFile(path.join(bookDir, '.vitepress/config.mjs'), 'utf8')
      expect(config).toContain('themeConfig')
      expect(config).toContain('"text": "Section"')
    } finally {
      await rm(bookDir, { recursive: true, force: true })
    }
  })
})
