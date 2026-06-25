import { access, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createServer } from 'vitepress';
export async function serveBook(root, options = {}) {
    const rootPath = path.resolve(root);
    await access(rootPath);
    const vitepressPath = path.join(rootPath, '.vitepress');
    let generated = false;
    if (options.force) {
        await createVitePressConfigForTest(rootPath);
        generated = true;
    }
    else {
        try {
            await access(vitepressPath);
        }
        catch {
            await createVitePressConfigForTest(rootPath);
            generated = true;
        }
    }
    const configPath = path.join(vitepressPath, 'config.mjs');
    if (options.configOnly) {
        return {
            root: rootPath,
            config: configPath,
            generated
        };
    }
    const createVitePressServer = options.createServer || createServer;
    const server = await createVitePressServer(rootPath, {
        host: options.host || 'localhost',
        port: Number(options.port || 5173)
    });
    await server.listen();
    server.printUrls();
    return server;
}
export async function createVitePressConfigForTest(root) {
    const vitepressPath = path.join(root, '.vitepress');
    await mkdir(vitepressPath, { recursive: true });
    const progress = await readProgress(root);
    const sidebar = await createSidebar(root, root, progress);
    const config = `export default {
  title: ${JSON.stringify(path.basename(root))},
  themeConfig: {
    search: { provider: 'local' },
    sidebar: ${JSON.stringify(sidebar, null, 2)}
  },
  markdown: {
    html: true,
    breaks: true
  }
}
`;
    await writeFile(path.join(vitepressPath, 'config.mjs'), config);
}
async function createSidebar(root, current, progress) {
    const ignore = new Set(['.vitepress', 'img', 'attachments', 'progress.json']);
    const entries = sortEntriesByProgress(root, (await readdir(current)).filter((entry) => !ignore.has(entry)), current, progress);
    const items = [];
    for (const entry of entries) {
        const full = path.join(current, entry);
        const info = await stat(full);
        const rel = path.relative(root, full).split(path.sep).join('/');
        if (info.isDirectory()) {
            const children = await createSidebar(root, full, progress);
            if (!children.length)
                continue;
            const item = {
                text: entry,
                collapsed: true,
                items: children
            };
            try {
                await access(path.join(full, 'index.md'));
                item.link = `/${rel}/`;
            }
            catch {
                // no index
            }
            items.push(item);
        }
        else if (/\.md$/i.test(entry)) {
            items.push({
                text: entry.replace(/\.md$/i, ''),
                link: `/${rel.replace(/\.md$/i, '')}`
            });
        }
    }
    return items;
}
function sortEntriesByProgress(root, entries, current, progress) {
    if (!progress.length)
        return entries.sort();
    const order = new Map();
    progress.forEach((item, index) => {
        const normalized = item.path.split(path.sep).join('/');
        order.set(normalized, index);
        const firstPart = normalized.split('/')[0];
        if (firstPart && !order.has(firstPart))
            order.set(firstPart, index);
        const dirname = path.dirname(normalized);
        if (dirname && dirname !== '.' && !order.has(dirname))
            order.set(dirname, index);
    });
    const currentRel = path.relative(root, current).split(path.sep).join('/');
    return [...entries].sort((a, b) => {
        const aKey = currentRel ? `${currentRel}/${a}` : a;
        const bKey = currentRel ? `${currentRel}/${b}` : b;
        const aOrder = order.get(aKey.replace(/\.md$/i, '')) ?? order.get(aKey) ?? Number.MAX_SAFE_INTEGER;
        const bOrder = order.get(bKey.replace(/\.md$/i, '')) ?? order.get(bKey) ?? Number.MAX_SAFE_INTEGER;
        if (aOrder !== bOrder)
            return aOrder - bOrder;
        return a.localeCompare(b, 'zh-CN');
    });
}
async function readProgress(root) {
    try {
        const data = await readFile(path.join(root, 'progress.json'), 'utf8');
        return JSON.parse(data);
    }
    catch {
        return [];
    }
}
