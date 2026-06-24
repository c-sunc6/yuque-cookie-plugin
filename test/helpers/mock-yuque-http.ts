import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import appData from '../mocks/data/appData.json' with { type: 'json' }
import docMdData from '../mocks/data/docMd.json' with { type: 'json' }
import docMdData2 from '../mocks/data/docMd2.json' with { type: 'json' }
import singleDocData from '../mocks/data/singleDoc.json' with { type: 'json' }
import singleDocMdData from '../mocks/data/singleDocMd.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const img1buffer = readFileSync(path.join(__dirname, '../mocks/assets/1.jpeg'))
const img2buffer = readFileSync(path.join(__dirname, '../mocks/assets/2.jpeg'))

export async function startMockYuqueHttpServer(): Promise<{ origin: string; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    handleRequest(req, res)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Failed to start mock server.')
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  }
}

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const origin = `http://${req.headers.host}`
  const url = new URL(req.url || '/', origin)
  if (url.pathname === '/yuque/base1') return sendAppData(res, withHost(appData, origin))
  if (url.pathname === '/yuque/testbook/testdoc') return sendAppData(res, withHost(singleDocData, origin))
  if (url.pathname === '/yuque/testbook/testdoc2') {
    const data = structuredClone(singleDocData)
    data.doc.id = 123457
    data.doc.slug = 'testdoc2'
    data.doc.title = '测试文档2'
    data.doc.book_id = 41966892
    return sendAppData(res, withHost(data, origin))
  }
  if (url.pathname === '/yuque/testbook/notfound') return sendText(res, 404, 'Not found')
  if (url.pathname === '/api/docs/one') return sendJson(res, url.searchParams.get('mode') ? docMdData : { data: { content: '<p>one</p>' } })
  if (url.pathname === '/api/docs/two') return sendJson(res, url.searchParams.get('mode') ? docMdData2 : { data: { content: '<p>two</p>' } })
  if (url.pathname === '/api/docs/testdoc') return sendJson(res, docResponse(url, singleDocMdData))
  if (url.pathname === '/api/docs/testdoc2') {
    const data = structuredClone(singleDocMdData)
    data.data.id = 123457
    data.data.slug = 'testdoc2'
    data.data.title = '测试文档2'
    data.data.sourcecode = '# 测试文档2\n\n这是第二个测试文档的内容。'
    return sendJson(res, docResponse(url, data))
  }
  if (url.pathname === '/api/filetransfer/images') return sendBinary(res, 200, img1buffer, 'image/jpeg')
  if (url.pathname === '/images/1.jpeg' || url.pathname === '/1.jpeg') return sendBinary(res, 200, img1buffer, 'image/jpeg')
  if (url.pathname === '/images/2.jpeg' || url.pathname === '/2.jpeg') return sendBinary(res, 200, img2buffer, 'image/jpeg')
  return sendText(res, 404, 'Not found')
}

function withHost<T extends Record<string, any>>(data: T, origin: string): T {
  const cloned = structuredClone(data)
  cloned.space = { ...(cloned.space || {}), host: origin }
  cloned.imageServiceDomains = ['127.0.0.1']
  return cloned
}

function docResponse(url: URL, data: any): any {
  if (url.searchParams.get('book_id') !== '41966892') return {}
  return url.searchParams.get('mode') ? data : {
    data: {
      ...data.data,
      content: '<p>HTML content</p>'
    }
  }
}

function sendAppData(res: ServerResponse, data: unknown): void {
  sendText(res, 200, `decodeURIComponent("${encodeURIComponent(JSON.stringify(data))}"));`, 'text/html')
}

function sendJson(res: ServerResponse, data: unknown): void {
  sendText(res, 200, JSON.stringify(data), 'application/json')
}

function sendText(res: ServerResponse, status: number, text: string, contentType = 'text/plain'): void {
  res.writeHead(status, { 'content-type': contentType })
  res.end(text)
}

function sendBinary(res: ServerResponse, status: number, buffer: Buffer, contentType: string): void {
  res.writeHead(status, { 'content-type': contentType })
  res.end(buffer)
}
