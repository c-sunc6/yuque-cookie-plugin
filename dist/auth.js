import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
const CONFIG_DIR = path.join(os.homedir(), '.config', 'yuque-cookie-plugin');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
export function getCredentials(flags = {}) {
    const envSession = process.env[String(flags.sessionEnv || 'YUQUE_SESSION')];
    const envCtoken = process.env[String(flags.ctokenEnv || 'YUQUE_CTOKEN')];
    const extraCookies = getExtraCookies(flags);
    if (envSession && envCtoken) {
        return {
            session: envSession,
            ctoken: envCtoken,
            homeUrl: getConfiguredHomeUrl(flags),
            extraCookies,
            source: 'env'
        };
    }
    const saved = readSavedCredentials();
    if (saved?.session && saved?.ctoken) {
        return { ...saved, extraCookies: { ...(saved.extraCookies || {}), ...extraCookies }, source: CONFIG_FILE };
    }
    throw new Error('Missing Yuque credentials. Run "yuque-local login" to configure them in your browser.');
}
export function getCredentialStatus(flags = {}) {
    const envSession = process.env[String(flags.sessionEnv || 'YUQUE_SESSION')];
    const envCtoken = process.env[String(flags.ctokenEnv || 'YUQUE_CTOKEN')];
    if (envSession && envCtoken) {
        return {
            configured: true,
            source: 'env',
            home_url: getConfiguredHomeUrl(flags) || null,
            saved_at: null,
            age_hours: null,
            last_validated_at: null,
            last_failed_at: null
        };
    }
    const saved = readSavedCredentials();
    if (!saved?.session || !saved?.ctoken) {
        return {
            configured: false,
            source: CONFIG_FILE
        };
    }
    return {
        configured: true,
        source: CONFIG_FILE,
        home_url: saved.homeUrl || null,
        saved_at: saved.saved_at || null,
        updated_at: saved.updated_at || null,
        age_hours: ageHours(saved.saved_at),
        last_validated_at: saved.last_validated_at || null,
        last_failed_at: saved.last_failed_at || null,
        last_validation_error: saved.last_validation_error || null
    };
}
export async function recordCredentialValidation(ok, error) {
    const saved = readSavedCredentials();
    if (!saved?.session || !saved?.ctoken)
        return;
    const now = new Date().toISOString();
    if (ok) {
        await saveCredentials({
            ...saved,
            last_validated_at: now,
            last_failed_at: undefined,
            last_validation_error: undefined
        });
        return;
    }
    await saveCredentials({
        ...saved,
        last_failed_at: now,
        last_validation_error: error instanceof Error ? error.message : String(error || 'Unknown validation error')
    });
}
function getExtraCookies(flags) {
    const fromFlag = typeof flags.cookieKey === 'string' && typeof flags.cookieValue === 'string'
        ? { [flags.cookieKey]: flags.cookieValue }
        : {};
    const envKey = process.env.YUQUE_EXTRA_COOKIE_KEY;
    const envValue = process.env.YUQUE_EXTRA_COOKIE_VALUE;
    const fromEnv = envKey && envValue ? { [envKey]: envValue } : {};
    return { ...fromEnv, ...fromFlag };
}
export async function loginWithBrowser(flags = {}) {
    const port = Number(flags.port || 0);
    const result = await startLoginServer(port);
    console.log(`Opening browser for Yuque cookie setup: ${result.url}`);
    await openBrowser(result.url);
    const credentials = await result.done;
    await saveCredentials(credentials);
    console.log(`Saved Yuque credentials to ${CONFIG_FILE}`);
}
function readSavedCredentials() {
    if (!existsSync(CONFIG_FILE))
        return null;
    try {
        return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
    }
    catch {
        return null;
    }
}
async function saveCredentials(credentials) {
    const now = new Date().toISOString();
    const data = {
        ...credentials,
        saved_at: credentials.saved_at || now,
        updated_at: now
    };
    await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
    await writeFile(CONFIG_FILE, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
    await chmod(CONFIG_FILE, 0o600);
}
function ageHours(value) {
    if (!value)
        return null;
    const time = new Date(value).getTime();
    if (Number.isNaN(time))
        return null;
    return Math.max(0, Math.round(((Date.now() - time) / 3_600_000) * 10) / 10);
}
function getConfiguredHomeUrl(flags) {
    const value = typeof flags.homeUrl === 'string' ? flags.homeUrl : process.env.YUQUE_HOME_URL;
    return value ? normalizeYuqueHomeUrl(value) : undefined;
}
function normalizeYuqueHomeUrl(value) {
    const input = value.trim();
    try {
        const url = new URL(input);
        if (url.hostname !== 'www.yuque.com' && !url.hostname.endsWith('.yuque.com')) {
            throw new Error('Yuque home URL must be a yuque.com URL.');
        }
        const login = url.pathname.split('/').filter(Boolean)[0];
        if (!login)
            throw new Error('Yuque home URL must include your login or organization path.');
        url.hash = '';
        url.search = '';
        url.pathname = `/${login}/`;
        return url.toString();
    }
    catch (error) {
        if (error instanceof Error && error.message.startsWith('Yuque home URL'))
            throw error;
        throw new Error('Yuque home URL must look like https://www.yuque.com/<your-login>/');
    }
}
async function startLoginServer(port) {
    let resolveDone;
    let rejectDone;
    const done = new Promise((resolve, reject) => {
        resolveDone = resolve;
        rejectDone = reject;
    });
    const sockets = new Set();
    const server = createServer(async (req, res) => {
        try {
            if (req.method === 'GET' && req.url === '/') {
                sendHtml(res, loginPage());
                return;
            }
            if (req.method === 'POST' && req.url === '/save') {
                const body = await readRequestBody(req);
                const params = new URLSearchParams(body);
                const session = params.get('session')?.trim();
                const ctoken = params.get('ctoken')?.trim();
                const homeUrlInput = params.get('homeUrl')?.trim();
                if (!session || !ctoken) {
                    sendHtml(res, loginPage('Both _yuque_session and yuque_ctoken are required.'), 400);
                    return;
                }
                if (!homeUrlInput) {
                    sendHtml(res, loginPage('Yuque personal or organization home URL is required.'), 400);
                    return;
                }
                const homeUrl = normalizeYuqueHomeUrl(homeUrlInput);
                sendHtml(res, successPage());
                res.on('finish', () => {
                    resolveDone({ session, ctoken, homeUrl, saved_at: new Date().toISOString() });
                    closeLoginServer(server, sockets);
                });
                return;
            }
            res.writeHead(404);
            res.end('Not found');
        }
        catch (error) {
            rejectDone(error);
            res.writeHead(500);
            res.end('Internal error');
            closeLoginServer(server, sockets);
        }
    });
    server.on('connection', (socket) => {
        sockets.add(socket);
        socket.on('close', () => sockets.delete(socket));
    });
    server.listen(port, '127.0.0.1');
    return new Promise((resolve) => {
        server.on('listening', () => {
            const address = server.address();
            if (!address || typeof address === 'string')
                throw new Error('Unable to determine login server address.');
            resolve({
                url: `http://127.0.0.1:${address.port}/`,
                done
            });
        });
    });
}
function closeLoginServer(server, sockets) {
    server.close();
    server.closeIdleConnections?.();
    setTimeout(() => {
        for (const socket of sockets)
            socket.destroy();
    }, 250).unref();
}
function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.setEncoding('utf8');
        req.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1024 * 1024) {
                reject(new Error('Request body too large.'));
                req.destroy();
            }
        });
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}
async function openBrowser(url) {
    const candidates = process.platform === 'darwin'
        ? [['open', [url]]]
        : process.platform === 'win32'
            ? [['cmd', ['/c', 'start', '', url]]]
            : [['xdg-open', [url]], ['gio', ['open', url]]];
    for (const [command, args] of candidates) {
        try {
            await execFilePromise(command, args);
            return;
        }
        catch {
            // Try the next opener.
        }
    }
    console.log(`Could not open a browser automatically. Open this URL manually: ${url}`);
}
function execFilePromise(command, args) {
    return new Promise((resolve, reject) => {
        execFile(command, args, (error) => {
            if (error)
                reject(error);
            else
                resolve();
        });
    });
}
function sendHtml(res, html, status = 200) {
    res.writeHead(status, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
    });
    res.end(html);
}
function loginPage(error = '') {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yuque Cookie Setup</title>
  <style>
    :root { color-scheme: light; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; --ink: #18202f; --muted: #667085; --line: #d9dee8; --panel: #ffffff; --accent: #16835f; --accent-dark: #0f6a4c; --soft: #eef6f2; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f7f8fb 0%, #eef3f1 100%); color: var(--ink); padding: 24px; }
    .shell { width: min(1040px, 100%); display: grid; grid-template-columns: .9fr 1.1fr; border: 1px solid var(--line); border-radius: 8px; overflow: hidden; background: var(--panel); box-shadow: 0 20px 60px rgba(24, 32, 47, .12); }
    .side { background: #18202f; color: #f8fafc; padding: 34px; display: grid; align-content: space-between; min-height: 560px; }
    .brand { display: grid; gap: 12px; }
    .mark { width: 42px; height: 42px; border-radius: 8px; background: #d7f3e6; color: #0f6a4c; display: grid; place-items: center; font-weight: 800; letter-spacing: .02em; }
    h1 { margin: 0; font-size: 28px; line-height: 1.15; letter-spacing: 0; }
    .side p { color: #c8d0dc; line-height: 1.65; margin: 0; }
    .facts { display: grid; gap: 12px; margin-top: 28px; }
    .fact { border: 1px solid rgba(255,255,255,.14); border-radius: 8px; padding: 12px; color: #e5eaf1; background: rgba(255,255,255,.04); }
    .fact strong { display: block; color: #fff; margin-bottom: 4px; font-size: 14px; }
    main { padding: 34px; }
    .eyebrow { margin: 0 0 8px; color: var(--accent-dark); font-size: 13px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
    h2 { margin: 0; font-size: 24px; line-height: 1.25; letter-spacing: 0; }
    .lead { margin: 10px 0 24px; color: var(--muted); line-height: 1.65; }
    label { display: block; margin: 18px 0 8px; font-weight: 700; font-size: 14px; }
    input { width: 100%; min-height: 46px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 6px; font: inherit; color: var(--ink); background: #fbfcfd; }
    input:focus { outline: 3px solid rgba(22, 131, 95, .18); border-color: var(--accent); background: #fff; }
    .hint { margin: 7px 0 0; color: var(--muted); font-size: 13px; line-height: 1.5; }
    button { width: 100%; margin-top: 24px; min-height: 46px; border: 0; border-radius: 6px; background: var(--accent); color: white; font-weight: 800; cursor: pointer; font-size: 15px; }
    button:hover { background: var(--accent-dark); }
    .notice { margin-top: 20px; border: 1px solid #cde8da; background: var(--soft); color: #214c3a; padding: 12px; border-radius: 6px; line-height: 1.55; font-size: 14px; }
    .error { color: #991b1b; background: #fee2e2; border: 1px solid #fecaca; padding: 10px 12px; border-radius: 6px; }
    code { background: #eef1f5; padding: 2px 5px; border-radius: 4px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    @media (max-width: 820px) { body { padding: 12px; } .shell { grid-template-columns: 1fr; } .side { min-height: auto; gap: 26px; padding: 24px; } main { padding: 24px; } }
  </style>
</head>
<body>
  <section class="shell">
    <aside class="side">
      <div class="brand">
        <div class="mark">YQ</div>
        <h1>Yuque Session Console</h1>
        <p>本地保存语雀网页 Session，让 CLI 使用浏览器同款 Cookie 访问语雀。</p>
      </div>
      <div class="facts">
        <div class="fact"><strong>保存位置</strong><span>~/.config/yuque-cookie-plugin/config.json</span></div>
        <div class="fact"><strong>安全边界</strong><span>只写入本机配置，不写入项目仓库。</span></div>
        <div class="fact"><strong>失效处理</strong><span>后续可用 auth-status 检测并提示重新登录。</span></div>
      </div>
    </aside>
    <main>
      <p class="eyebrow">Local credential setup</p>
      <h2>填写语雀 Cookie</h2>
      <p class="lead">从已登录语雀的浏览器 Cookie 中复制 <code>_yuque_session</code> 和 <code>yuque_ctoken</code>。这两个值会记录保存时间，用于后续判断登录态是否可能失效。</p>
      ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
      <form method="post" action="/save" autocomplete="off">
        <label for="homeUrl">语雀个人/团队主页 URL</label>
        <input id="homeUrl" name="homeUrl" required autofocus spellcheck="false" placeholder="https://www.yuque.com/your-login/" />
        <p class="hint">填写你自己的语雀主页，例如 <code>https://www.yuque.com/your-login/</code>。如果粘贴具体文档 URL，工具只保存第一段用户/团队路径。</p>
        <label for="session">_yuque_session</label>
        <input id="session" name="session" required spellcheck="false" />
        <p class="hint">浏览器登录态 Cookie，通常较长。不要粘贴到聊天或仓库文件。</p>
        <label for="ctoken">yuque_ctoken</label>
        <input id="ctoken" name="ctoken" required spellcheck="false" />
        <p class="hint">CSRF Cookie，会同时作为 x-csrf-token 请求头使用。</p>
        <button type="submit">保存到本机配置</button>
      </form>
      <div class="notice">保存后请运行 <code>npm run yuque-local -- auth-status &lt;语雀URL&gt;</code> 做一次真实检测。</div>
    </main>
  </section>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script>
    if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.from('.shell', { autoAlpha: 0, y: 18, duration: 0.5, ease: 'power2.out' });
      gsap.from('.mark, h1, .side p, .fact, .eyebrow, h2, .lead, form, .notice', { autoAlpha: 0, y: 12, duration: 0.45, ease: 'power1.out', stagger: 0.045, delay: 0.08 });
    }
  </script>
</body>
</html>`;
}
function successPage() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Yuque Credentials Saved</title>
  <style>
    :root { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #18202f; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: linear-gradient(135deg, #f7f8fb 0%, #eef3f1 100%); padding: 20px; }
    main { width: min(640px, 100%); background: #fff; border: 1px solid #d9dee8; border-radius: 8px; padding: 34px; box-shadow: 0 20px 60px rgba(24, 32, 47, .12); }
    .status { display: inline-grid; place-items: center; width: 44px; height: 44px; border-radius: 8px; background: #eaf7ef; color: #16835f; font-weight: 900; margin-bottom: 16px; }
    h1 { margin: 0; font-size: 26px; letter-spacing: 0; }
    p { color: #667085; line-height: 1.65; }
    code { background: #eef1f5; padding: 2px 5px; border-radius: 4px; }
  </style>
</head>
<body>
  <main>
    <div class="status">OK</div>
    <h1>凭据已保存</h1>
    <p>配置已写入本机用户目录。请回到终端继续操作，或运行 <code>npm run yuque-local -- auth-status &lt;语雀URL&gt;</code> 进行真实登录态检测。</p>
  </main>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <script>
    if (window.gsap && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.from('main', { autoAlpha: 0, y: 18, duration: 0.45, ease: 'power2.out' });
      gsap.from('.status, h1, p', { autoAlpha: 0, y: 10, duration: 0.35, ease: 'power1.out', stagger: 0.07, delay: 0.08 });
    }
  </script>
</body>
</html>`;
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
