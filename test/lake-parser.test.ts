import { describe, expect, it } from 'vitest'
import { parseLake } from '../src/lake-parser.ts'
import { lakeToMarkdown } from '../src/lake-markdown.ts'

describe('lake parser', () => {
  it('parses common Lake structures structurally', () => {
    const lake = '<!doctype lake><h1 data-lake-id="h1"><span>标题</span></h1><p>段落</p><ul><li>一</li><li>二</li></ul><card name="codeblock" value="data:%7B%22mode%22%3A%22ts%22%2C%22code%22%3A%22console.log(1)%22%7D"></card><table><tr><td>A</td></tr></table>'
    const parsed = parseLake(lake)
    expect(parsed.headings[0]).toMatchObject({ level: 1, text: '标题' })
    expect(parsed.lists[0]).toMatchObject({ ordered: false, item_count: 2 })
    expect(parsed.cards[0].name).toBe('codeblock')
    expect(parsed.tables[0].row_count).toBe(1)
    expect(parsed.stats.paragraph_count).toBe(1)
  })

  it('renders common Lake cards to markdown', () => {
    const lake = '<h1>标题</h1><card name="hr" value="data:%7B%7D"></card>'
    expect(lakeToMarkdown(lake)).toContain('# 标题')
    expect(lakeToMarkdown(lake)).toContain('---')
  })
})
