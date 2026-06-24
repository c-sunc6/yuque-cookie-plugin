#!/usr/bin/env node

import process from 'node:process'
import { readFile, writeFile } from 'node:fs/promises'
import { YuqueCookieClient } from './client-cookie.ts'
import { diffLakeSnapshots } from './lake-diff.ts'
import { writeJson } from './fs-utils.ts'
import { getCredentials, loginWithBrowser } from './auth.ts'
import { serializeHtmlToLake } from './editor-bridge.ts'
import { snapshotToMarkdown } from './lake-markdown.ts'
import { downloadBook, downloadDocs } from './downloader.ts'
import { normalizeDownloadOptions } from './download-utils.ts'
import { serveBook } from './serve-book.ts'
import type { CliArgs, CliFlags, YuqueCredentials, YuqueSnapshot } from './types.ts'

function help(): void {
  console.log(`yuque-local

Usage:
  yuque-local inspect <doc-or-book-url>
  yuque-local login
  yuque-local snapshot <doc-url> --out <file>
  yuque-local diff-lake <before.json> <after.json>
  yuque-local editor-serialize --html-file <file> --out <lake-file>
  yuque-local apply-lake <doc-url> --lake-file <body_asl.html> [--dry-run]
  yuque-local lake-to-markdown <snapshot.json> --out <file>
  yuque-local format-article <doc-url> --html-file <file> [--dry-run]
  yuque-local update-lake <doc-url> --lake-file <body_asl.html>
  yuque-local download-book <book-url> [--dist-dir download] [--incremental]
  yuque-local download-doc <...doc-urls> [--dist-dir download]
  yuque-local serve-book <book-path> [--port 5173]

Options:
  --out <file>           Output path
  --lake-file <file>     Lake body_asl HTML file
  --html-file <file>     HTML input file
  --dry-run              Build a plan/report without writing online content
  --keep-temp            Keep editor bridge temp files for debugging
  --session-env <name>   Env var for _yuque_session, default: YUQUE_SESSION
  --ctoken-env <name>    Env var for yuque_ctoken, default: YUQUE_CTOKEN
  --dist-dir <dir>       Download output dir, default: download
  --ignore-img           Do not download markdown images
  --ignore-attachments   Do not download attachments, or pass comma-separated extensions
  --toc                  Add markdown table of contents per document
  --incremental          Skip unchanged docs based on progress.json
  --hide-footer          Do not append update/original footer
  --port <port>          serve-book port, default: 5173
  --host <host>          serve-book host, default: localhost
  --force                Recreate VitePress config
  -h, --help             Show help
`)
}

function parseArgs(argv: string[]): CliArgs {
  const positional: string[] = []
  const flags: CliFlags = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (!arg.startsWith('-')) {
      positional.push(arg)
      continue
    }
    if (arg === '-h' || arg === '--help') {
      flags.help = true
      continue
    }
    const eq = arg.indexOf('=')
    if (eq !== -1) {
      flags[toCamel(arg.slice(0, eq).replace(/^--?/, ''))] = arg.slice(eq + 1)
      continue
    }
    const key = toCamel(arg.replace(/^--?/, ''))
    const next = argv[i + 1]
    if (next && !next.startsWith('-')) {
      flags[key] = next
      i += 1
    } else {
      flags[key] = true
    }
  }
  return { positional, flags }
}

function toCamel(value: string): string {
  return value.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase())
}

async function createClient(flags: CliFlags): Promise<YuqueCookieClient> {
  let credentials: YuqueCredentials
  try {
    credentials = getCredentials(flags)
  } catch (error) {
    console.log(error instanceof Error ? error.message : String(error))
    await loginWithBrowser(flags)
    credentials = getCredentials(flags)
  }
  return new YuqueCookieClient({
    session: credentials.session,
    ctoken: credentials.ctoken
  })
}

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const { positional, flags } = parseArgs(rest)
  if (!command || command === 'help' || command === '--help' || flags.help) {
    help()
    return
  }

  if (command === 'diff-lake') {
    const [beforePath, afterPath] = positional
    if (!beforePath || !afterPath) throw new Error('Missing before/after snapshot path.')
    const before = JSON.parse(await readFile(beforePath, 'utf8')) as YuqueSnapshot
    const after = JSON.parse(await readFile(afterPath, 'utf8')) as YuqueSnapshot
    console.log(JSON.stringify(diffLakeSnapshots(before, after), null, 2))
    return
  }

  if (command === 'editor-serialize') {
    if (!flags.htmlFile || typeof flags.htmlFile !== 'string') throw new Error('Missing --html-file.')
    if (!flags.out || typeof flags.out !== 'string') throw new Error('Missing --out.')
    const html = await readFile(flags.htmlFile, 'utf8')
    const result = await serializeHtmlToLake({ html, out: flags.out, keepTemp: Boolean(flags.keepTemp) })
    console.log(JSON.stringify({
      ok: true,
      serializer: result.serializer,
      out: flags.out,
      length: result.lake.length
    }, null, 2))
    return
  }

  if (command === 'lake-to-markdown') {
    const [snapshotPath] = positional
    if (!snapshotPath) throw new Error('Missing snapshot path.')
    if (!flags.out || typeof flags.out !== 'string') throw new Error('Missing --out.')
    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as YuqueSnapshot
    const markdown = snapshotToMarkdown(snapshot)
    await writeFile(flags.out, markdown, 'utf8')
    console.log(`Markdown written: ${flags.out}`)
    return
  }

  if (command === 'login') {
    await loginWithBrowser(flags)
    return
  }

  if (command === 'serve-book') {
    const [bookPath] = positional
    if (!bookPath) throw new Error('Missing book path.')
    await serveBook(bookPath, {
      port: typeof flags.port === 'string' ? Number(flags.port) : undefined,
      host: typeof flags.host === 'string' ? flags.host : undefined,
      force: Boolean(flags.force)
    })
    return
  }

  const client = await createClient(flags)

  if (command === 'inspect') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque URL.')
    const info = await client.inspect(url)
    console.log(JSON.stringify(info, null, 2))
    return
  }

  if (command === 'snapshot') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque doc URL.')
    if (!flags.out || typeof flags.out !== 'string') throw new Error('Missing --out.')
    const snapshot = await client.snapshotDoc(url)
    await writeJson(flags.out, snapshot)
    console.log(`Snapshot written: ${flags.out}`)
    return
  }

  if (command === 'update-lake') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque doc URL.')
    if (!flags.lakeFile || typeof flags.lakeFile !== 'string') throw new Error('Missing --lake-file.')
    const lake = await readFile(flags.lakeFile, 'utf8')
    const result = await client.updateLakeDoc(url, lake)
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'apply-lake') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque doc URL.')
    if (!flags.lakeFile || typeof flags.lakeFile !== 'string') throw new Error('Missing --lake-file.')
    const lake = await readFile(flags.lakeFile, 'utf8')
    const result = await client.applyLakeDoc(url, lake, {
      dryRun: Boolean(flags.dryRun),
      command: 'apply-lake'
    })
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'format-article') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque doc URL.')
    if (!flags.htmlFile || typeof flags.htmlFile !== 'string') throw new Error('Missing --html-file.')
    const html = await readFile(flags.htmlFile, 'utf8')
    const serialized = await serializeHtmlToLake({ html, keepTemp: Boolean(flags.keepTemp) })
    const result = await client.applyLakeDoc(url, serialized.lake, {
      dryRun: Boolean(flags.dryRun),
      command: 'format-article'
    })
    console.log(JSON.stringify({
      serializer: serialized.serializer,
      lake_length: serialized.lake.length,
      ...result
    }, null, 2))
    return
  }

  if (command === 'download-book') {
    const [url] = positional
    if (!url) throw new Error('Missing Yuque book URL.')
    const result = await downloadBook(client, url, normalizeDownloadOptions(flags))
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (command === 'download-doc') {
    if (!positional.length) throw new Error('Missing Yuque doc URL.')
    const result = await downloadDocs(client, positional, normalizeDownloadOptions(flags))
    console.log(JSON.stringify(result, null, 2))
    return
  }

  throw new Error(`Unknown command: ${command}`)
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`yuque-local error: ${message}`)
  process.exitCode = 1
})
