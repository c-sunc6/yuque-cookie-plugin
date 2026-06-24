import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

describe('CLI help', () => {
  it('lists Yuque cookie plugin commands', async () => {
    const { stdout } = await execFileAsync('node', ['--import', 'tsx', './src/cli.ts', '--help'], {
      cwd: process.cwd()
    })
    expect(stdout).toContain('download-book')
    expect(stdout).toContain('download-doc')
    expect(stdout).toContain('editor-serialize')
    expect(stdout).toContain('apply-lake')
  })
})
