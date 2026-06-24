// Focused Lake transforms live here. Keep these small and tested against
// snapshot before/after pairs captured from the Yuque web editor.

export function removeTextualHeadingNumbers(lake: string): string {
  return lake.replace(/<h([1-6])\b[^>]*>[\s\S]*?<\/h\1>/g, (block) => {
    return block.replace(/(<span\b[^>]*>)([\s\S]*?)(<\/span>)/, (_match, open: string, text: string, close: string) => {
      return `${open}${stripNumber(text)}${close}`
    })
  })
}

function stripNumber(text: string): string {
  return text.replace(/^\s*\d+(?:\.\d+)*[.．、]?\s+/, '')
}
