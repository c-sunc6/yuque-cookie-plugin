import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { http, HttpResponse } from 'msw'
import { toArrayBuffer } from './utils.ts'
import appData from './data/appData.json' with { type: 'json' }
import attachmentsDocMdData from './data/attachments.json' with { type: 'json' }
import boardData from './data/boardData.json' with { type: 'json' }
import docMdData from './data/docMd.json' with { type: 'json' }
import docMdData2 from './data/docMd2.json' with { type: 'json' }
import sheetData from './data/sheetData.json' with { type: 'json' }
import singleDocData from './data/singleDoc.json' with { type: 'json' }
import singleDocMdData from './data/singleDocMd.json' with { type: 'json' }
import tableData from './data/tableData.json' with { type: 'json' }

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const img1buffer = readFileSync(path.join(__dirname, './assets/1.jpeg'))
const img2buffer = readFileSync(path.join(__dirname, './assets/2.jpeg'))
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
  http.get('https://www.yuque.com/attachments/error.pdf', () => new HttpResponse('Not found', { status: 404 })),
  http.get('https://gxr404.com/1.jpeg', () => {
    return HttpResponse.arrayBuffer(toArrayBuffer(img1buffer), {
      headers: { 'content-type': 'image/jpeg' }
    })
  }),
  http.get('https://gxr404.com/2.jpeg', () => {
    return HttpResponse.arrayBuffer(toArrayBuffer(img2buffer), {
      headers: { 'content-type': 'image/jpeg' }
    })
  }),
  http.get('https://www.yuque.com/api/filetransfer/images', () => {
    return HttpResponse.arrayBuffer(toArrayBuffer(img1buffer), {
      headers: { 'content-type': 'image/jpeg' }
    })
  }),
  http.get('https://www.yuque.com/yuque/base1', () => appDataHtml(appData)),
  http.get('https://www.yuque.com/yuque/no-doc', () => {
    const data = structuredClone(appData)
    delete (data as any).doc
    return appDataHtml(data)
  }),
  http.get('https://www.yuque.com/yuque/title-doc', () => {
    const titleDocData = structuredClone(appData)
    titleDocData.book.slug = 'title-doc'
    titleDocData.book.name = 'Title Doc Book'
    titleDocData.book.toc = [
      {
        type: 'DOC',
        title: 'Title1 文档',
        uuid: '001',
        url: 'one',
        child_uuid: '002',
        parent_uuid: ''
      },
      {
        type: 'DOC',
        title: '文档1',
        uuid: '002',
        url: 'two',
        child_uuid: '',
        parent_uuid: '001'
      }
    ]
    return appDataHtml(titleDocData)
  }),
  http.get('https://www.yuque.com/api/docs/one', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(url.searchParams.get('mode') ? docMdData : { data: { content: '<p>one</p>' } })
  }),
  http.get('https://www.yuque.com/api/docs/two', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(url.searchParams.get('mode') ? docMdData2 : { data: { content: '<p>two</p>' } })
  }),
  http.get('https://www.yuque.com/api/docs/board', () => HttpResponse.json(boardData)),
  http.get('https://www.yuque.com/api/docs/table', () => HttpResponse.json(tableData)),
  http.get('https://www.yuque.com/api/docs/sheet', ({ request }) => {
    const url = new URL(request.url)
    return HttpResponse.json(url.searchParams.get('mode') ? sheetData : sheetData)
  }),
  http.get('https://www.yuque.com/api/docs/sheetError', () => {
    const temp = structuredClone(sheetData)
    temp.data.content = 'error'
    return HttpResponse.json(temp)
  }),
  http.get('https://www.yuque.com/api/docs/sourcecodeNull', () => {
    return HttpResponse.json({
      data: {
        type: 'Doc'
      }
    })
  }),
  http.get('https://www.yuque.com/api/docs/attachments', () => HttpResponse.json(attachmentsDocMdData)),
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
  }),
  http.get('https://www.yuque.com/yuque/testbook/testdoc2', () => {
    const data = structuredClone(singleDocData)
    data.doc.id = 123457
    data.doc.slug = 'testdoc2'
    data.doc.title = '测试文档2'
    data.doc.book_id = 41966892
    return appDataHtml(data)
  }),
  http.get('https://www.yuque.com/api/docs/testdoc2', ({ request }) => {
    const url = new URL(request.url)
    if (url.searchParams.get('book_id') === '41966892') {
      const data = structuredClone(singleDocMdData)
      data.data.id = 123457
      data.data.slug = 'testdoc2'
      data.data.title = '测试文档2'
      data.data.sourcecode = '# 测试文档2\n\n这是第二个测试文档的内容。'
      return HttpResponse.json(url.searchParams.get('mode') ? data : {
        data: {
          ...data.data,
          content: '<p>测试文档2的HTML内容</p>'
        }
      })
    }
    return HttpResponse.json({})
  }),
  http.get('https://www.yuque.com/yuque/testbook/notfound', () => new HttpResponse('Not found', { status: 404 }))
]
