import { parseLake, stripTags } from './lake-parser.ts'
import type { YuqueSnapshot } from './types.ts'

export function snapshotToMarkdown(snapshot: YuqueSnapshot): string {
  const lake = snapshot.edit?.body_asl || snapshot.lake?.sourcecode || snapshot.edit?.body_draft_asl || ''
  return lakeToMarkdown(lake, snapshot)
}

export function lakeToMarkdown(lake = '', snapshot?: Partial<YuqueSnapshot>): string {
  const parsed = parseLake(lake)
  const title = snapshot?.doc?.title || 'Yuque Document'
  const lines = [`# ${title}`, '']

  lines.push(`> Source: ${snapshot?.url || 'snapshot'}`)
  lines.push(`> Headings: ${parsed.headings.length}; Cards: ${parsed.cards.length}; Lists: ${parsed.lists.length}; Tables: ${parsed.tables.length}`)
  lines.push('')

  const body = lake
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g, (_match, level: string, content: string) => `${'#'.repeat(Number(level))} ${stripTags(content)}\n`)
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/g, (_match, content: string) => `${inlineToMarkdown(content)}\n`)
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/g, (_match, content: string) => `> ${inlineToMarkdown(content)}\n`)
    .replace(/<card\b([^>]*)>(?:<\/card>)?/g, (block: string) => cardToMarkdown(block))
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/g, (_match, content: string) => `- ${inlineToMarkdown(content)}\n`)
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (body) lines.push(body, '')
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`
}

function inlineToMarkdown(value = ''): string {
  return stripTags(value
    .replace(/<strong\b[^>]*>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<em\b[^>]*>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<code\b[^>]*>([\s\S]*?)<\/code>/g, '`$1`')
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, '[$2]($1)'))
}

function cardToMarkdown(block: string): string {
  const name = (block.match(/\bname="([^"]+)"/) || [])[1] || 'unknown'
  const value = (block.match(/\bvalue="([^"]+)"/) || [])[1] || ''
  const data = decodeCardValue(value)
  if (name === 'codeblock') return `\n\`\`\`${data.mode || 'plain'}\n${data.code || ''}\n\`\`\`\n`
  if (name === 'image') return `\n![${data.name || 'image'}](${data.src || ''})\n`
  if (name === 'hr') return '\n---\n'
  return `\n[Unsupported Yuque card: ${name}]\n`
}

function decodeCardValue(value: string): Record<string, string> {
  if (!value.startsWith('data:')) return {}
  try {
    return JSON.parse(decodeURIComponent(value.slice(5))) as Record<string, string>
  } catch {
    return {}
  }
}
