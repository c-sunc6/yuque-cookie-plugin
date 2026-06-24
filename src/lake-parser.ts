import { HTMLElement, parse } from 'node-html-parser'

export interface ParsedLake {
  headings: LakeHeading[]
  cards: LakeCard[]
  lists: LakeList[]
  tables: LakeTable[]
  stats: {
    length: number
    paragraph_count: number
  }
}

export interface LakeHeading {
  type: 'heading'
  level: number
  attrs: Record<string, string>
  text: string
  block: string
}

export interface LakeCard {
  type: 'card'
  attrs: Record<string, string>
  name: string
  block: string
}

export interface LakeList {
  type: 'list'
  ordered: boolean
  attrs: Record<string, string>
  item_count: number
  block: string
}

export interface LakeTable {
  type: 'table'
  attrs: Record<string, string>
  row_count: number
  block: string
}

export function parseLake(lake = ''): ParsedLake {
  const root = parse(lake, {
    lowerCaseTagName: true,
    comment: false,
    blockTextElements: {
      script: true,
      noscript: true,
      style: true,
      pre: true
    }
  })
  const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6').map((node) => ({
    type: 'heading' as const,
    level: Number(node.tagName.slice(1)),
    attrs: attrsFromNode(node),
    text: decodeEntities(node.text.trim().replace(/\s+/g, ' ')),
    block: node.toString()
  }))
  const cards = root.querySelectorAll('card').map((node) => {
    const attrs = attrsFromNode(node)
    return {
      type: 'card' as const,
      attrs,
      name: attrs.name || '',
      block: node.toString()
    }
  })
  const lists = root.querySelectorAll('ul,ol').map((node) => ({
    type: 'list' as const,
    ordered: node.tagName === 'ol',
    attrs: attrsFromNode(node),
    item_count: node.querySelectorAll('li').length,
    block: node.toString()
  }))
  const tables = root.querySelectorAll('table').map((node) => ({
    type: 'table' as const,
    attrs: attrsFromNode(node),
    row_count: node.querySelectorAll('tr').length,
    block: node.toString()
  }))

  return {
    headings,
    cards,
    lists,
    tables,
    stats: {
      length: lake.length,
      paragraph_count: root.querySelectorAll('p').length
    }
  }
}

export function parseAttrs(value = ''): Record<string, string> {
  const attrs: Record<string, string> = {}
  const attrRegex = /([:\w-]+)(?:="([^"]*)")?/g
  let match: RegExpExecArray | null
  while ((match = attrRegex.exec(value))) {
    attrs[match[1]] = decodeEntities(match[2] || '')
  }
  return attrs
}

export function stripTags(value = ''): string {
  return decodeEntities(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim())
}

function attrsFromNode(node: HTMLElement): Record<string, string> {
  const attrs: Record<string, string> = {}
  for (const [key, value] of Object.entries(node.attributes)) {
    attrs[key] = decodeEntities(String(value))
  }
  return attrs
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
}
