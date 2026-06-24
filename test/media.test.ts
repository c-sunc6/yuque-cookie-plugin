import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, afterEach, beforeEach } from 'vitest'
import { localizeMedia } from '../src/download-utils.ts'

let cwd = ''

describe('media card localization', () => {
  beforeEach(async () => {
    cwd = await mkdtemp(path.join(os.tmpdir(), 'yuque-media-'))
  })

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true })
  })

  it('downloads markdown video lake cards and rewrites links', async () => {
    const lakeCard = encodeURIComponent(JSON.stringify({
      name: '测试视频.mp4',
      videoId: 'inputs/prod/video.mp4'
    }))
    const markdown = `[测试视频](https://www.yuque.com/book/doc?_lake_card=${lakeCard})`
    const result = await localizeMedia(markdown, '', {
      savePath: cwd,
      attachmentsDir: 'attachments/media',
      headers: {},
      ignoreAttachments: false,
      getVideoInfo: async () => ({
        video: dataUrl('video-content'),
        name: '测试视频.mp4'
      })
    })
    expect(result).toContain('[音视频附件: 测试视频.mp4](attachments/media/测试视频.mp4)')
    expect(await readFile(path.join(cwd, 'attachments/media/测试视频.mp4'), 'utf8')).toBe('video-content')
  })

  it('appends html audio cards when markdown has no matching link', async () => {
    const htmlData = `<card name="audio" value="data:${encodeURIComponent(JSON.stringify({
      audioId: 'inputs/prod/audio.mp3',
      fileName: '测试音频.mp3'
    }))}"></card>`
    const result = await localizeMedia('# 文档\n', htmlData, {
      savePath: cwd,
      attachmentsDir: 'attachments/media',
      headers: {},
      ignoreAttachments: false,
      getVideoInfo: async () => ({
        audio: dataUrl('audio-content'),
        fileName: '测试音频.mp3'
      })
    })
    expect(result).toContain('[音视频附件: 测试音频.mp3](attachments/media/测试音频.mp3)')
    expect(await readFile(path.join(cwd, 'attachments/media/测试音频.mp3'), 'utf8')).toBe('audio-content')
  })

  it('honors ignoreAttachments extension lists for media', async () => {
    const lakeCard = encodeURIComponent(JSON.stringify({
      name: '测试视频.mp4',
      videoId: 'inputs/prod/video.mp4'
    }))
    const markdown = `[测试视频](https://www.yuque.com/book/doc?_lake_card=${lakeCard})`
    const result = await localizeMedia(markdown, '', {
      savePath: cwd,
      attachmentsDir: 'attachments/media',
      headers: {},
      ignoreAttachments: 'mp4',
      getVideoInfo: async () => ({
        video: dataUrl('video-content'),
        name: '测试视频.mp4'
      })
    })
    expect(result).toBe(markdown)
    await expect(stat(path.join(cwd, 'attachments/media/测试视频.mp4'))).rejects.toThrow()
  })
})

function dataUrl(content: string): string {
  return `data:text/plain;base64,${Buffer.from(content).toString('base64')}`
}
