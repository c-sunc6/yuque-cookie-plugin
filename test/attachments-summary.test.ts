import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { localizeAttachments, writeSummary } from '../src/download-utils.ts'
import type { ProgressItem } from '../src/types.ts'

let cwd = ''

describe('attachments and summary migrated coverage', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(async () => {
    server.resetHandlers()
    if (cwd) await rm(cwd, { recursive: true, force: true })
  })
  afterAll(() => server.close())

  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-attachments-summary-'))
  })

  it('localizeAttachments downloads Yuque attachments and rewrites links', async () => {
    const markdown = '# test\n\n[test.pdf](https://www.yuque.com/attachments/test.pdf)\n'
    const result = await localizeAttachments(markdown, {
      savePath: cwd,
      attachmentsDir: 'attachments/123456789',
      headers: {},
      ignoreAttachments: false
    })
    expect(result).toContain('[附件: test.pdf](attachments/123456789/test.pdf)')
    expect((await readFile(path.join(cwd, 'attachments/123456789/test.pdf'))).length).toBe(46219)
  })

  it('localizeAttachments keeps original link when download fails', async () => {
    const markdown = '# test\n\n[error.pdf](https://www.yuque.com/attachments/error.pdf)\n'
    const result = await localizeAttachments(markdown, {
      savePath: cwd,
      attachmentsDir: 'attachments/123456789',
      headers: {},
      ignoreAttachments: false
    })
    expect(result).toContain('[error.pdf](https://www.yuque.com/attachments/error.pdf)')
  })

  it('localizeAttachments supports extension ignore lists', async () => {
    const markdown = '# test\n\n[test.pdf](https://www.yuque.com/attachments/test.pdf)\n'
    const result = await localizeAttachments(markdown, {
      savePath: cwd,
      attachmentsDir: 'attachments/123456789',
      headers: {},
      ignoreAttachments: 'pdf'
    })
    expect(result).toBe(markdown)
  })

  it('writeSummary generates nested index markdown', async () => {
    const content = await writeSummary({
      bookPath: cwd,
      bookName: 'Test Book',
      bookDesc: 'This is a test book',
      progressItems: [
        title('001', 'Title1', ''),
        doc('002', 'DOC1', '001', '002/doc.md'),
        title('003', 'Title2', ''),
        title('005', 'Title2-1', '003'),
        doc('006', 'DOC3', '005', '006/doc.md')
      ]
    })
    expect(content).toContain('# Test Book')
    expect(content).toContain('> This is a test book')
    expect(content).toContain('## Title1')
    expect(content).toContain('- [DOC1](002/doc.md)')
    expect(content).toContain('### Title2-1')
    expect(content).toContain('- [DOC3](006/doc.md)')
    expect(await readFile(path.join(cwd, 'index.md'), 'utf8')).toBe(content)
  })

  it('writeSummary links title-doc nodes', async () => {
    const content = await writeSummary({
      bookPath: cwd,
      bookName: 'Test Book',
      progressItems: [
        {
          ...doc('001', 'Title1', '', '001/index.md'),
          toc: {
            ...doc('001', 'Title1', '', '001/index.md').toc,
            child_uuid: '002'
          }
        },
        doc('002', 'DOC1', '001', '002/doc.md')
      ]
    })
    expect(content).toContain('## [Title1](001/index.md)')
    expect(content).toContain('- [DOC1](002/doc.md)')
  })
})

function title(uuid: string, name: string, parent: string): ProgressItem {
  return {
    path: name,
    pathIdList: [uuid],
    pathTitleList: [name],
    toc: {
      type: 'TITLE',
      title: name,
      uuid,
      parent_uuid: parent,
      child_uuid: ''
    }
  }
}

function doc(uuid: string, name: string, parent: string, file: string): ProgressItem {
  return {
    path: file,
    pathIdList: [uuid],
    pathTitleList: [name],
    toc: {
      type: 'DOC',
      title: name,
      uuid,
      parent_uuid: parent,
      child_uuid: '',
      url: uuid
    }
  }
}
