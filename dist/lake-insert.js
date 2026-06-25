export function extractFirstImageParagraph(lake) {
    const paragraphMatch = /<p\b[^>]*>\s*<card\b[^>]*\bname="image"[^>]*><\/card>\s*<\/p>/i.exec(lake);
    if (paragraphMatch?.[0])
        return paragraphMatch[0];
    const cardMatch = /<card\b[^>]*\bname="image"[^>]*><\/card>/i.exec(lake);
    if (cardMatch?.[0])
        return `<p>${cardMatch[0]}</p>`;
    throw new Error('Serialized Lake did not contain an image card.');
}
export function insertLakeBlock(lake, block, afterText) {
    if (!lake.trim())
        throw new Error('Current Lake document is empty.');
    if (!block.trim())
        throw new Error('Inserted Lake block is empty.');
    if (afterText?.trim()) {
        const inserted = insertAfterTextBlock(lake, block, afterText.trim());
        if (inserted)
            return inserted;
        throw new Error(`Could not find a Lake block containing --after-text: ${afterText}`);
    }
    return `${lake}${block}`;
}
function insertAfterTextBlock(lake, block, text) {
    const escapedText = escapeRegExp(text);
    const blockPattern = new RegExp(`<(p|h[1-6]|blockquote|li)\\b[^>]*>[\\s\\S]*?${escapedText}[\\s\\S]*?<\\/\\1>`);
    const match = blockPattern.exec(lake);
    if (!match?.[0] || match.index === undefined)
        return undefined;
    const insertAt = match.index + match[0].length;
    return `${lake.slice(0, insertAt)}${block}${lake.slice(insertAt)}`;
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
