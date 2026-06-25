import { parse } from 'node-html-parser';
export function parseLake(lake = '') {
    const root = parse(lake, {
        lowerCaseTagName: true,
        comment: false,
        blockTextElements: {
            script: true,
            noscript: true,
            style: true,
            pre: true
        }
    });
    const headings = root.querySelectorAll('h1,h2,h3,h4,h5,h6').map((node) => ({
        type: 'heading',
        level: Number(node.tagName.slice(1)),
        attrs: attrsFromNode(node),
        text: decodeEntities(node.text.trim().replace(/\s+/g, ' ')),
        block: node.toString()
    }));
    const cards = root.querySelectorAll('card').map((node) => {
        const attrs = attrsFromNode(node);
        return {
            type: 'card',
            attrs,
            name: attrs.name || '',
            block: node.toString()
        };
    });
    const lists = root.querySelectorAll('ul,ol').map((node) => ({
        type: 'list',
        ordered: node.tagName === 'ol',
        attrs: attrsFromNode(node),
        item_count: node.querySelectorAll('li').length,
        block: node.toString()
    }));
    const tables = root.querySelectorAll('table').map((node) => ({
        type: 'table',
        attrs: attrsFromNode(node),
        row_count: node.querySelectorAll('tr').length,
        block: node.toString()
    }));
    return {
        headings,
        cards,
        lists,
        tables,
        stats: {
            length: lake.length,
            paragraph_count: root.querySelectorAll('p').length
        }
    };
}
export function parseAttrs(value = '') {
    const attrs = {};
    const attrRegex = /([:\w-]+)(?:="([^"]*)")?/g;
    let match;
    while ((match = attrRegex.exec(value))) {
        attrs[match[1]] = decodeEntities(match[2] || '');
    }
    return attrs;
}
export function stripTags(value = '') {
    return decodeEntities(value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
}
function attrsFromNode(node) {
    const attrs = {};
    for (const [key, value] of Object.entries(node.attributes)) {
        attrs[key] = decodeEntities(String(value));
    }
    return attrs;
}
function decodeEntities(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
}
