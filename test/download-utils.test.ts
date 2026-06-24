import { describe, expect, it } from 'vitest'
import {
  captureImageUrl,
  fixInlineCode,
  fixLatex,
  fixMarkdownImage,
  fixPath,
  formatDate,
  getMarkdownImageList,
  removeEmojis
} from '../src/download-utils.ts'

describe('download utils migrated from yuque-dl', () => {
  it('fixLatex converts non-svg latex URLs to source text', () => {
    const searchStr = 'options[\'where\'] 是否是数组，'
    const hashStr = 'card=math&code=options[\'where\'] 是否是数组，'
    const latexMd = `![](https://g.yuque.com/gr/latex?${encodeURIComponent(searchStr)}#${encodeURIComponent(hashStr)})`
    expect(fixLatex(latexMd)).toBe(searchStr)
  })

  it('fixLatex keeps svg latex URLs unchanged', () => {
    const latexMd = '![](https://cdn.nlark.com/yuque/__latex/a6cc75c5bd5731c6e361bbcaf18766e7.svg#card=math&code=999&id=JGAwA)'
    expect(fixLatex(latexMd)).toBe(latexMd)
  })

  it('fixMarkdownImage repairs markdown URLs with raw Yuque image card data', () => {
    const mdData = [
      '# Test',
      '![](http://www.abc.com/3.jpg#123)',
      '![](./test.jpg)',
      '![](http://www.abc.com/1.jpg#123)',
      '![](http://www.abc.com/2.jpg)',
      '![](http://www.abc.com/1.jpg#456)',
      '![](http://www.abc.com/1.jpg)',
      '![](http://www.abc.com/3.jpg)'
    ].join('\n')
    const htmlData = [
      '<p>Test</p>',
      imageCard('http://www.abc.com/1.jpg?a=1&b=c#11'),
      imageCard('http://www.abc.com/1.jpg?a=2&b=c#22'),
      imageCard('http://www.abc.com/3.jpg?a=3&b=c#33')
    ].join('\n')
    const data = fixMarkdownImage(getMarkdownImageList(mdData), mdData, htmlData)
    expect(data).toContain('http://www.abc.com/1.jpg?a=1&b=c#11')
    expect(data).toContain('http://www.abc.com/1.jpg?a=2&b=c#22')
    expect(data).toContain('http://www.abc.com/3.jpg?a=3&b=c#33')
    expect(data).toContain('![](./test.jpg)')
  })

  it('fixPath removes dangerous path characters but preserves normal spaces', () => {
    expect(fixPath('/xxa.12~*#)$$M/13')).toBe('_xxa.12~_#)$$M_13')
    expect(fixPath('Visual Studio 2026 完整安装')).toBe('Visual Studio 2026 完整安装')
    expect(fixPath('兰生自动化课程大纲与   B 站视频对应表')).toBe('兰生自动化课程大纲与 B 站视频对应表')
  })

  it('fixInlineCode keeps normal inline code', () => {
    const mdData = '`123213`'
    const htmlData = '<code class="ne-code"><span class="ne-text">123213</span></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('`123213`')
  })

  it('fixInlineCode converts markdown-looking inline code when HTML shows formatting', () => {
    const mdData = '`**123213**`'
    const htmlData = '<code class="ne-code"><strong><span class="ne-text">123213</span></strong></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('<code>**123213**</code>')
  })

  it('fixInlineCode keeps escaped literal HTML from Yuque', () => {
    const mdData = '`<font style="color:#FBDE28;">123</font>`'
    const htmlData = '<code class="ne-code"><span class="ne-text">&lt;font style=&quot;color:#FBDE28;&quot;&gt;123&lt;/font&gt;</span></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('`<font style="color:#FBDE28;">123</font>`')
  })

  it('fixInlineCode converts html plus markdown when Yuque rendered formatting', () => {
    const mdData = '`**<font style="color:#DF2A3F;">123</font>**`'
    const htmlData = '<code class="ne-code"><strong><span class="ne-text" style="color: #DF2A3F">123</span></strong></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('<code>**<font style="color:#DF2A3F;">123</font>**</code>')
  })

  it('fixInlineCode keeps html plus markdown when Yuque escaped it literally', () => {
    const mdData = '`**<font style="color:#FBDE28;">123</font>**`'
    const htmlData = '<code class="ne-code"><span class="ne-text">**&lt;font style=&quot;color:#FBDE28;&quot;&gt;123&lt;/font&gt;**</span></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('`**<font style="color:#FBDE28;">123</font>**`')
  })

  it('fixInlineCode converts nested markdown/html formatting', () => {
    const mdData = '`~~_**<u><font style="color:#DF2A3F;">123213</font></u>**_~~`'
    const htmlData = '<code class="ne-code"><em><strong><span class="ne-text" style="color: #DF2A3F; text-decoration: underline line-through">123213</span></strong></em></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('<code>~~_**<u><font style="color:#DF2A3F;">123213</font></u>**_~~</code>')
  })

  it('fixInlineCode keeps nested markdown/html when escaped literally', () => {
    const mdData = '`~~_**<u><font style="color:#DF2A3F;">123213</font></u>**_~~`'
    const htmlData = '<code class="ne-code"><span class="ne-text">~~_**&lt;u&gt;&lt;font style=&quot;color:#DF2A3F;&quot;&gt;123213&lt;/font&gt;&lt;/u&gt;**_~~</span></code>'
    expect(fixInlineCode(mdData, htmlData)).toBe('`~~_**<u><font style="color:#DF2A3F;">123213</font></u>**_~~`')
  })

  it('captureImageUrl keeps Yuque image service URLs and signs external URLs', () => {
    expect(captureImageUrl('https://www.abc.com/1.jpg', ['www.abc.com'])).toBe('https://www.abc.com/1.jpg')
    const external = captureImageUrl('https://www.baidu2.com/logo.jpg', ['www.abc.com'])
    expect(external).toContain('https://www.yuque.com/api/filetransfer/images?url=')
    expect(external).toContain('&sign=')
    expect(captureImageUrl('123', ['www.abc.com'])).toBe('123')
  })

  it('utility date/image helpers work', () => {
    expect(getMarkdownImageList('# test\n![](http://x.jpg)\n![](./x2.jpg)\n![](http://x3.jpg)')).toEqual(['http://x.jpg', 'http://x3.jpg'])
    expect(removeEmojis('🤣t😅e😁s😂t😅')).toBe('test')
    expect(formatDate('2023-10-07T06:12:28.000Z')).toMatch(/2023-10-07/)
    expect(formatDate('abcde')).toBe('')
  })
})

function imageCard(src: string): string {
  return `<card type="inline" name="image" value="data:${encodeURIComponent(JSON.stringify({ src, alt: 'image' }))}"></card>`
}
