import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const VENDOR_DIR = path.resolve('vendor/lake-editor');
export async function serializeHtmlToLake({ html, out, keepTemp = false }) {
    const { chromium } = await importPlaywright();
    const tempDir = await makeTempDir();
    const pagePath = path.join(tempDir, 'editor-bridge.html');
    const vendorAvailable = await hasOfficialEditorAssets();
    await writeFile(pagePath, bridgeHtml({ vendorAvailable }), 'utf8');
    const browser = await chromium.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.goto(pathToFileURL(pagePath).href);
        const result = await page.evaluate(async (input) => {
            return window.__yuqueBridge.serialize(input);
        }, html);
        if (!result?.lake?.trim())
            throw new Error('Editor bridge returned empty Lake content.');
        if (out) {
            await mkdir(path.dirname(path.resolve(out)), { recursive: true });
            await writeFile(out, result.lake, 'utf8');
        }
        return result;
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (/Executable doesn't exist|browserType.launch/.test(message)) {
            throw new Error(`${message}\nRun "npx playwright install chromium" and try again.`);
        }
        throw error;
    }
    finally {
        await browser.close();
        if (!keepTemp)
            await rm(tempDir, { recursive: true, force: true });
    }
}
async function importPlaywright() {
    try {
        return await import('playwright');
    }
    catch {
        throw new Error('Missing Playwright. Run "npm install --save-dev playwright" first.');
    }
}
async function makeTempDir() {
    await mkdir(path.join(os.tmpdir(), 'yuque-editor-bridge-'), { recursive: true });
    return mkdtemp(path.join(os.tmpdir(), 'yuque-editor-bridge-'));
}
async function hasOfficialEditorAssets() {
    try {
        await access(path.join(VENDOR_DIR, 'doc.umd.js'));
        await access(path.join(VENDOR_DIR, 'doc.css'));
        return true;
    }
    catch {
        return false;
    }
}
function bridgeHtml({ vendorAvailable }) {
    const vendorUrl = pathToFileURL(VENDOR_DIR).href;
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Yuque Editor Bridge</title>
  ${vendorAvailable ? `<link rel="stylesheet" href="${vendorUrl}/antd.4.24.13.css"><link rel="stylesheet" href="${vendorUrl}/doc.css">` : ''}
</head>
<body>
  <div id="root"></div>
  ${vendorAvailable ? `<script>window.KITCHEN_URL = ${JSON.stringify(`${vendorUrl}/lake-editor-icon.js`)};</script><script src="${vendorUrl}/react.production.min.js"></script><script src="${vendorUrl}/react-dom.production.min.js"></script><script src="${vendorUrl}/doc.umd.js"></script>` : ''}
  <script>
    const vendorAvailable = ${JSON.stringify(vendorAvailable)};
    const vendorUrl = ${JSON.stringify(vendorUrl)};

    window.__yuqueBridge = {
      async serialize(html) {
        if (vendorAvailable && window.Doc && typeof window.Doc.createOpenEditor === 'function') {
          return serializeWithOfficialEditor(html);
        }
        return {
          serializer: 'fallback',
          lake: fallbackSerialize(html)
        };
      }
    };

    async function serializeWithOfficialEditor(html) {
      const root = document.getElementById('root');
      const editor = window.Doc.createOpenEditor(root, {
        placeholder: '',
        defaultFontsize: 14,
        codeblock: {
          codemirrorURL: vendorUrl + '/CodeMirror.js',
          supportCustomStyle: true
        },
        math: {
          KaTexURL: vendorUrl + '/katex.js'
        },
        image: {
          isCaptureImageURL() {
            return false;
          },
          async createUploadPromise(request) {
            if (request.type === 'base64') {
              return {
                url: request.data,
                size: request.data.length * 0.75,
                name: 'image.png'
              };
            }
            return new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve({
                url: reader.result,
                size: request.data.size,
                name: request.data.name || 'image.png'
              });
              reader.onerror = reject;
              reader.readAsDataURL(request.data);
            });
          }
        },
        bookmark: {
          recognizeYuque: true,
          fetchDetailHandler: async (url) => ({ url, title: url })
        },
        link: {
          isValidURL() {
            return true;
          },
          sanitizeURL(url) {
            return url;
          }
        }
      });
      editor.setDocument('text/html', html);
      let attempts = 0;
      while (editor.canGetDocument && !editor.canGetDocument()) {
        if (attempts > 100) throw new Error('Official editor was not ready after 10s.');
        attempts += 1;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      return {
        serializer: 'official-lake-editor',
        lake: editor.getDocument('text/lake', { includeMeta: true })
      };
    }

    function fallbackSerialize(html) {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const blocks = [];
      for (const node of Array.from(doc.body.childNodes)) {
        const rendered = renderBlock(node);
        if (rendered) blocks.push(rendered);
      }
      return '<meta name="serializer" content="yuque-cookie-plugin-fallback">' + blocks.join('');
    }

    function renderBlock(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent.trim();
        return text ? '<p>' + escapeHtml(text) + '</p>' : '';
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) return '<' + tag + '>' + renderInlineChildren(node) + '</' + tag + '>';
      if (tag === 'p') return '<p>' + renderInlineChildren(node) + '</p>';
      if (tag === 'blockquote') return '<blockquote>' + renderInlineChildren(node) + '</blockquote>';
      if (tag === 'hr') return '<card name="hr" value="data:%7B%7D"></card>';
      if (tag === 'pre') return renderCodeBlock(node);
      if (tag === 'ul' || tag === 'ol') return renderList(node, tag);
      if (tag === 'table') return renderTable(node);
      if (tag === 'div' || tag === 'section' || tag === 'article') {
        return Array.from(node.childNodes).map(renderBlock).filter(Boolean).join('');
      }
      return '<p>' + renderInline(node) + '</p>';
    }

    function renderInlineChildren(node) {
      return Array.from(node.childNodes).map(renderInline).join('');
    }

    function renderInline(node) {
      if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent);
      if (node.nodeType !== Node.ELEMENT_NODE) return '';
      const tag = node.tagName.toLowerCase();
      const content = renderInlineChildren(node);
      if (tag === 'strong' || tag === 'b') return '<strong>' + content + '</strong>';
      if (tag === 'em' || tag === 'i') return '<em>' + content + '</em>';
      if (tag === 'del' || tag === 's') return '<del>' + content + '</del>';
      if (tag === 'u') return '<u>' + content + '</u>';
      if (tag === 'code') return '<code>' + content + '</code>';
      if (tag === 'a') return '<a href="' + escapeAttr(node.getAttribute('href') || '') + '">' + content + '</a>';
      if (tag === 'br') return '<br>';
      if (tag === 'img') {
        const data = {
          src: node.getAttribute('src') || '',
          name: node.getAttribute('alt') || 'image-placeholder'
        };
        return '<card name="image" value="data:' + encodeURIComponent(JSON.stringify(data)) + '"></card>';
      }
      return content;
    }

    function renderCodeBlock(node) {
      const codeNode = node.querySelector('code') || node;
      const className = codeNode.getAttribute('class') || '';
      const language = (className.match(/language-([\\w-]+)/) || [])[1] || 'plain';
      const data = { mode: language, code: codeNode.textContent || '', name: '' };
      return '<card name="codeblock" value="data:' + encodeURIComponent(JSON.stringify(data)) + '"></card>';
    }

    function renderList(node, tag) {
      return '<' + tag + '>' + Array.from(node.children).filter(child => child.tagName.toLowerCase() === 'li').map((li) => {
        return '<li>' + renderInlineChildren(li) + '</li>';
      }).join('') + '</' + tag + '>';
    }

    function renderTable(node) {
      return '<table>' + node.innerHTML + '</table>';
    }

    function escapeHtml(value) {
      return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    function escapeAttr(value) {
      return escapeHtml(value).replace(/"/g, '&quot;');
    }
  </script>
</body>
</html>`;
}
