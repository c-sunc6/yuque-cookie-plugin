import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import type { Socket } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import type { CliFlags, YuqueCredentials } from './types.ts'

const CONFIG_DIR = path.join(os.homedir(), '.config', 'yuque-cookie-plugin')
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json')

export function getCredentials(flags: CliFlags = {}): YuqueCredentials {
  const envSession = process.env[String(flags.sessionEnv || 'YUQUE_SESSION')]
  const envCtoken = process.env[String(flags.ctokenEnv || 'YUQUE_CTOKEN')]
  if (envSession && envCtoken) {
    return { session: envSession, ctoken: envCtoken, source: 'env' }
  }

  const saved = readSavedCredentials()
  if (saved?.session && saved?.ctoken) {
    return { ...saved, source: CONFIG_FILE }
  }

  throw new Error('Missing Yuque credentials. Run "yuque-local login" to configure them in your browser.')
}

export async function loginWithBrowser(flags: CliFlags = {}): Promise<void> {
  const port = Number(flags.port || 0)
  const result = await startLoginServer(port)
  console.log(`Opening browser for Yuque cookie setup: ${result.url}`)
  await openBrowser(result.url)
  const credentials = await result.done
  await saveCredentials(credentials)
  console.log(`Saved Yuque credentials to ${CONFIG_FILE}`)
}

function readSavedCredentials(): YuqueCredentials | null {
  if (!existsSync(CONFIG_FILE)) return null
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) as YuqueCredentials
  } catch {
    return null
  }
}

async function saveCredentials(credentials: YuqueCredentials): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 })
  await writeFile(CONFIG_FILE, `${JSON.stringify(credentials, null, 2)}\n`, { mode: 0o600 })
  await chmod(CONFIG_FILE, 0o600)
}

async function startLoginServer(port: number): Promise<{ url: string; done: Promise<YuqueCredentials> }> {
  let resolveDone!: (credentials: YuqueCredentials) => void
  let rejectDone!: (error: unknown) => void
  const done = new Promise<YuqueCredentials>((resolve, reject) => {
    resolveDone = resolve
    rejectDone = reject
  })
  const sockets = new Set<Socket>()

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/') {
        sendHtml(res, loginPage())
        return
      }
      if (req.method === 'POST' && req.url === '/save') {
        const body = await readRequestBody(req)
        const params = new URLSearchParams(body)
        const session = params.get('session')?.trim()
        const ctoken = params.get('ctoken')?.trim()
        if (!session || !ctoken) {
          sendHtml(res, loginPage('Both _yuque_session and yuque_ctoken are required.'), 400)
          return
        }
        sendHtml(res, successPage())
        res.on('finish', () => {
          resolveDone({ session, ctoken, saved_at: new Date().toISOString() })
          closeLoginServer(server, sockets)
        })
        return
      }
      res.writeHead(404)
      res.end('Not found')
    } catch (error) {
      rejectDone(error)
      res.writeHead(500)
      res.end('Internal error')
      closeLoginServer(server, sockets)
    }
  })

  server.on('connection', (socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
  })

  server.listen(port, '127.0.0.1')
  return new Promise((resolve) => {
    server.on('listening', () => {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('Unable to determine login server address.')
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        done
      })
    })
  })
}

function closeLoginServer(server: ReturnType<typeof createServer>, sockets: Set<Socket>): void {
  server.close()
  server.closeIdleConnections?.()
  setTimeout(() => {
    for (const socket of sockets) socket.destroy()
  }, 250).unref()
}

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      body += chunk
      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large.'))
        req.destroy()
      }
    })
    req.on('end', () => resolve(body))
    req.on('error', reject)
  })
}

async function openBrowser(url: string): Promise<void> {
  const candidates: Array<[string, string[]]> = process.platform === 'darwin'
    ? [['open', [url]]]
    : process.platform === 'win32'
      ? [['cmd', ['/c', 'start', '', url]]]
      : [['xdg-open', [url]], ['gio', ['open', url]]]

  for (const [command, args] of candidates) {
    try {
      await execFilePromise(command, args)
      return
    } catch {
      // Try the next opener.
    }
  }
  console.log(`Could not open a browser automatically. Open this URL manually: ${url}`)
}

function execFilePromise(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
}

function sendHtml(res: ServerResponse, html: string, status = 200): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store'
  })
  res.end(html)
}

function loginPage(error = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yuque Cookie Setup</title>
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #202124; }
    main { width: min(680px, calc(100vw - 32px)); background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 28px; box-shadow: 0 12px 40px rgba(15, 23, 42, .08); }
    h1 { margin: 0 0 8px; font-size: 24px; }
    p { line-height: 1.65; color: #4b5563; }
    label { display: block; margin: 18px 0 8px; font-weight: 650; }
    input { width: 100%; box-sizing: border-box; height: 42px; padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 6px; font: inherit; }
    button { margin-top: 22px; height: 42px; padding: 0 18px; border: 0; border-radius: 6px; background: #16a34a; color: white; font-weight: 700; cursor: pointer; }
    .error { color: #b91c1c; background: #fee2e2; padding: 10px 12px; border-radius: 6px; }
    code { background: #f3f4f6; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <h1>Yuque Cookie Setup</h1>
    <p>填写浏览器 Cookie 中的 <code>_yuque_session</code> 和 <code>yuque_ctoken</code>。凭据只会保存到本机配置文件，不会上传到其他服务。</p>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="post" action="/save" autocomplete="off">
      <label for="session">_yuque_session</label>
      <input id="session" name="session" required autofocus />
      <label for="ctoken">yuque_ctoken</label>
      <input id="ctoken" name="ctoken" required />
      <button type="submit">Save Credentials</button>
    </form>
  </main>
</body>
</html>`
}

function successPage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8" /><title>Saved</title></head>
<body style="font-family: sans-serif; display: grid; place-items: center; min-height: 100vh;">
  <main>
    <h1>Saved</h1>
    <p>Yuque credentials have been saved locally. You can close this page and return to the terminal.</p>
  </main>
</body>
</html>`
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
