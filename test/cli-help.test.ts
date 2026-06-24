import { mkdtemp, rm } from 'node:fs/promises'
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
    expect(stdout).toContain('download-book')
    expect(stdout).toContain('download-doc')
    expect(stdout).toContain('editor-serialize')
    expect(stdout).toContain('apply-lake')
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
})
