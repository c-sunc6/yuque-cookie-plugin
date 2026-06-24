import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { http, HttpResponse } from 'msw'
import { toArrayBuffer } from './utils.ts'
import appData from './data/appData.json' with { type: 'json' }
import docMdData from './data/docMd.json' with { type: 'json' }
import singleDocData from './data/singleDoc.json' with { type: 'json' }
import singleDocMdData from './data/singleDocMd.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const img1buffer = readFileSync(path.join(__dirname, './assets/1.jpeg'))
const pdfBuffer = readFileSync(path.join(__dirname, './assets/test.pdf'))

function appDataHtml(data: unknown): HttpResponse {
  return new HttpResponse(`decodeURIComponent("${encodeURIComponent(JSON.stringify(data))}"));`, {
    status: 200,
    headers: { 'content-type': 'text/html' }
  })
}

export const handlers = [
  http.get('http://localhost/404', () => new HttpResponse('Not found', { status: 404 })),
  http.get('https://www.yuque.com/attachments/test.pdf', () => {
    return HttpResponse.arrayBuffer(toArrayBuffer(pdfBuffer), {
      headers: { 'content-type': 'application/pdf' }
    })
  }),
  http.get('https://www.yuque.com/api/filetransfer/images', () => {
    return HttpResponse.arrayBuffer(toArrayBuffer(img1buffer), {
      headers: { 'content-type': 'image/jpeg' }
    })
  }),
  http.get('https://www.yuque.com/yuque/base1', () => appDataHtml(appData)),
  http.get('https://www.yuque.com/api/docs/one', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(url.searchParams.get('mode') ? docMdData : { data: { content: '<p>one</p>' } })
  }),
  http.get('https://www.yuque.com/yuque/testbook/testdoc', () => appDataHtml(singleDocData)),
  http.get('https://www.yuque.com/api/docs/testdoc', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('book_id') === '41966892') {
      return HttpResponse.json(url.searchParams.get('mode') ? singleDocMdData : {
        data: {
          ...singleDocMdData.data,
          content: '<p>测试文档的HTML内容</p>'
        }
      })
    }
    return HttpResponse.json({})
  })
]
