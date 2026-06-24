import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createVitePressConfigForTest } from '../src/serve-book.ts'
import type { ProgressItem } from '../src/types.ts'

let cwd = ''

describe('serve-book VitePress config', () => {
  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-serve-book-'))
    await mkdir(path.join(cwd, 'A'), { recursive: true })
    await mkdir(path.join(cwd, 'B'), { recursive: true })
    await mkdir(path.join(cwd, 'img'), { recursive: true })
    await mkdir(path.join(cwd, 'attachments'), { recursive: true })
    await writeFile(path.join(cwd, 'index.md'), '# Root\n')
    await writeFile(path.join(cwd, 'A.md'), '# A\n')
    await writeFile(path.join(cwd, 'B/index.md'), '# B\n')
    await writeFile(path.join(cwd, 'B/C.md'), '# C\n')
    await writeFile(path.join(cwd, 'img/ignore.md'), '# Ignore\n')
    await writeFile(path.join(cwd, 'attachments/ignore.md'), '# Ignore\n')
    await writeFile(path.join(cwd, 'progress.json'), JSON.stringify([
      progress('B/index.md', 'B', '1', ''),
      progress('B/C.md', 'C', '2', '1'),
      progress('A.md', 'A', '3', '')
    ], null, 2))
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('generates sidebar ordered by progress.json', async () => {
    await createVitePressConfigForTest(cwd)
    const config = await readFile(path.join(cwd, '.vitepress/config.mjs'), 'utf8')
    expect(config).toContain('search: { provider: \'local\' }')
    expect(config).toContain('"text": "B"')
    expect(config).toContain('"link": "/B/"')
    expect(config).toContain('"text": "A"')
    expect(config.indexOf('"text": "B"')).toBeLessThan(config.indexOf('"text": "A"'))
    expect(config).not.toContain('ignore')
  })
})

function progress(file: string, title: string, uuid: string, parent: string): ProgressItem {
  return {
    path: file,
    pathIdList: [uuid],
    pathTitleList: [title],
    toc: {
      type: 'DOC',
      title,
      uuid,
      parent_uuid: parent,
      child_uuid: file.endsWith('index.md') ? 'child' : '',
      url: file.replace(/\.md$/, '')
    }
  }
}
