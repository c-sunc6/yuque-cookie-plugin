import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { server } from './mocks/server.ts'
import { YuqueCookieClient } from '../src/client-cookie.ts'

describe('YuqueCookieClient with MSW mocks', () => {
  beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
  afterEach(() => server.resetHandlers())
  afterAll(() => server.close())

  it('inspect parses Yuque appData from a mocked page', async () => {
    const client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
    const data = await client.inspect('https://www.yuque.com/yuque/base1')
    expect(data.book).toMatchObject({
      id: 41966892,
      slug: 'welfare'
    })
  })

  it('getDocInfoFromUrl reads document metadata from a mocked page', async () => {
    const client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
    const data = await client.getDocInfoFromUrl('https://www.yuque.com/yuque/testbook/testdoc')
    expect(data).toMatchObject({
      docId: 123456,
      docSlug: 'testdoc',
      docTitle: '测试文档',
      bookId: 41966892
    })
  })

  it('getDocMarkdownData reads mocked markdown API data', async () => {
    const client = new YuqueCookieClient({ session: 'session', ctoken: 'ctoken' })
    const data = await client.getDocMarkdownData({ articleUrl: 'testdoc', bookId: 41966892 })
    expect(data.httpStatus).toBe(200)
    expect(data.response.data.sourcecode).toBeTruthy()
  })
})
