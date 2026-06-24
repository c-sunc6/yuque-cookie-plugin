#!/usr/bin/env tsx

import { mkdtemp, readFile, stat } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { getCredentials } from '../src/auth.ts'
import { YuqueCookieClient } from '../src/client-cookie.ts'
import { downloadBook, downloadDocs } from '../src/downloader.ts'
import { writeJson } from '../src/fs-utils.ts'
import { normalizeDownloadOptions } from '../src/download-utils.ts'

interface AcceptanceFlags {
  bookUrl?: string
  docUrl?: string[]
  distDir?: string
  out?: string
  apiHost?: string
  cookieKey?: string
  cookieValue?: string
  keepOutput?: boolean
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  if (!flags.bookUrl && !flags.docUrl?.length) {
    throw new Error('Missing --book-url or --doc-url. This script is intentionally manual and requires a real Yuque URL.')
  }

  const credentials = getCredentials(flags)
  const client = new YuqueCookieClient({
    session: credentials.session,
    ctoken: credentials.ctoken,
    extraCookies: credentials.extraCookies,
    host: flags.apiHost
  })

  const distDir = flags.distDir || await mkdtemp(path.join(os.tmpdir(), 'yuque-real-acceptance-'))
  const startedAt = new Date().toISOString()
  const checks: Array<Record<string, unknown>> = []

  if (flags.bookUrl) {
    const inspect = await client.inspect(flags.bookUrl)
    checks.push({
      step: 'inspect-book',
      ok: Boolean(inspect.book_id),
      book_id: inspect.book_id,
      book_name: inspect.book_name,
      toc_count: inspect.toc_count
    })

    const first = await downloadBook(client, flags.bookUrl, normalizeDownloadOptions({
      distDir,
      incremental: true,
      quiet: true
    }))
    checks.push({
      step: 'download-book-first',
      ok: first.ok,
      docs: first.docs,
      downloaded: first.downloaded,
      skipped: first.skipped,
      failures: first.failures,
      warnings: first.warnings,
      warning_summary: first.warning_summary,
      resources: first.resources,
      report: first.report,
      book_path: first.book_path
    })

    const second = await downloadBook(client, flags.bookUrl, normalizeDownloadOptions({
      distDir,
      incremental: true,
      quiet: true
    }))
    checks.push({
      step: 'download-book-incremental',
      ok: second.ok,
      docs: second.docs,
      downloaded: second.downloaded,
      skipped: second.skipped,
      failures: second.failures,
      warnings: second.warnings,
      warning_summary: second.warning_summary,
      resources: second.resources,
      report: second.report,
      book_path: second.book_path
    })

    const bookPath = String(first.book_path || '')
    checks.push(await fileCheck('book-index', path.join(bookPath, 'index.md')))
    checks.push(await fileCheck('book-progress', path.join(bookPath, 'progress.json')))
    for (const [index, resource] of resourceFiles(first.resources).entries()) {
      checks.push(await fileCheck(`download-book-resource-${index + 1}`, path.join(bookPath, resource.path)))
    }
  }

  if (flags.docUrl?.length) {
    const docs = await downloadDocs(client, flags.docUrl, normalizeDownloadOptions({
      distDir,
      quiet: true
    }))
    const files = Array.isArray(docs.files) ? docs.files.filter(isString) : []
    checks.push({
      step: 'download-doc',
      ok: docs.ok,
      downloaded: docs.downloaded,
      files,
      failures: docs.failures,
      warnings: docs.warnings,
      warning_summary: docs.warning_summary,
      resources: docs.resources,
      retry: docs.retry,
      report: docs.report
    })
    for (const [index, file] of files.entries()) {
      checks.push(await fileCheck(`download-doc-file-${index + 1}`, file))
    }
    for (const [index, resource] of resourceFiles(docs.resources).entries()) {
      checks.push(await fileCheck(`download-doc-resource-${index + 1}`, path.join(distDir, resource.path)))
    }
  }

  const report = {
    ok: checks.every((item) => item.ok !== false),
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    dist_dir: distDir,
    source: credentials.source,
    keep_output: Boolean(flags.keepOutput || flags.distDir),
    checks
  }

  const out = flags.out || path.resolve('reports', `real-acceptance-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  await writeJson(out, report)
  console.log(JSON.stringify({ ...report, report: out }, null, 2))
  if (!report.ok) process.exitCode = 1
}

function parseFlags(argv: string[]): AcceptanceFlags {
  const flags: AcceptanceFlags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--book-url') flags.bookUrl = requireValue(argv, ++i, arg)
    else if (arg === '--doc-url') flags.docUrl = [...(flags.docUrl || []), requireValue(argv, ++i, arg)]
    else if (arg === '--dist-dir') flags.distDir = requireValue(argv, ++i, arg)
    else if (arg === '--out') flags.out = requireValue(argv, ++i, arg)
    else if (arg === '--api-host') flags.apiHost = requireValue(argv, ++i, arg)
    else if (arg === '--cookie-key') flags.cookieKey = requireValue(argv, ++i, arg)
    else if (arg === '--cookie-value') flags.cookieValue = requireValue(argv, ++i, arg)
    else if (arg === '--keep-output') flags.keepOutput = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return flags
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index]
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}.`)
  return value
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function resourceFiles(resources: unknown): Array<{ path: string }> {
  if (!resources || typeof resources !== 'object') return []
  const files = (resources as { files?: unknown }).files
  if (!Array.isArray(files)) return []
  return files.filter((item): item is { path: string } => {
    return Boolean(item) && typeof item === 'object' && isString((item as { path?: unknown }).path)
  })
}

async function fileCheck(step: string, file: string): Promise<Record<string, unknown>> {
  try {
    const info = await stat(file)
    const preview = await readFile(file, 'utf8').catch(() => '')
    return {
      step,
      ok: info.isFile() && info.size > 0,
      file,
      size: info.size,
      preview: preview.slice(0, 200)
    }
  } catch (error) {
    return {
      step,
      ok: false,
      file,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
