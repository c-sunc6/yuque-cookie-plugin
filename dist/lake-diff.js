import { parseLake } from "./lake-parser.js";
export function diffLakeSnapshots(before, after) {
    const beforeEdit = before.edit || {};
    const afterEdit = after.edit || {};
    const beforeLake = beforeEdit.body_asl || before.lake?.sourcecode || '';
    const afterLake = afterEdit.body_asl || after.lake?.sourcecode || '';
    const beforeHeadings = extractLakeHeadings(beforeLake);
    const afterHeadings = extractLakeHeadings(afterLake);
    const beforeParsed = parseLake(beforeLake);
    const afterParsed = parseLake(afterLake);
    return {
        before: {
            doc: before.doc,
            heading_count: beforeHeadings.length
        },
        after: {
            doc: after.doc,
            heading_count: afterHeadings.length
        },
        headings: diffHeadings(beforeHeadings, afterHeadings),
        stats: {
            body_asl_length_before: beforeLake.length,
            body_asl_length_after: afterLake.length,
            body_asl_changed: beforeLake !== afterLake
        },
        structure: {
            before: summarizeStructure(beforeParsed),
            after: summarizeStructure(afterParsed),
            changed: summarizeStructure(beforeParsed).join('|') !== summarizeStructure(afterParsed).join('|')
        },
        cards: diffNamedCounts(countByName(beforeParsed.cards), countByName(afterParsed.cards)),
        lists: {
            before: beforeParsed.lists.map((list) => ({ ordered: list.ordered, item_count: list.item_count })),
            after: afterParsed.lists.map((list) => ({ ordered: list.ordered, item_count: list.item_count }))
        },
        tables: {
            before: beforeParsed.tables.map((table) => ({ row_count: table.row_count })),
            after: afterParsed.tables.map((table) => ({ row_count: table.row_count }))
        }
    };
}
export function extractLakeHeadings(lake) {
    const result = [];
    const headingRegex = /<h([1-6])\b([^>]*)>([\s\S]*?)<\/h\1>/g;
    let match;
    while ((match = headingRegex.exec(lake))) {
        const block = match[0];
        result.push({
            type: 'heading',
            level: Number(match[1]),
            attrs: {},
            text: decodeEntities(block.replace(/<[^>]+>/g, '')),
            block
        });
    }
    return result;
}
function diffHeadings(before, after) {
    const count = Math.max(before.length, after.length);
    const changes = [];
    for (let i = 0; i < count; i += 1) {
        const b = before[i];
        const a = after[i];
        if (!b || !a || b.level !== a.level || b.text !== a.text || b.block !== a.block) {
            changes.push({
                index: i,
                before: b && summarizeHeading(b),
                after: a && summarizeHeading(a)
            });
        }
    }
    return changes;
}
function summarizeHeading(heading) {
    return {
        level: heading.level,
        text: heading.text,
        attrs: heading.attrs,
        block_preview: heading.block.slice(0, 500)
    };
}
function decodeEntities(value) {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
}
function summarizeStructure(parsed) {
    return [
        `headings:${parsed.headings.length}`,
        `cards:${parsed.cards.length}`,
        `lists:${parsed.lists.length}`,
        `tables:${parsed.tables.length}`,
        `paragraphs:${parsed.stats.paragraph_count}`,
        `length:${parsed.stats.length}`
    ];
}
function countByName(items) {
    const counts = {};
    for (const item of items)
        counts[item.name] = (counts[item.name] || 0) + 1;
    return counts;
}
function diffNamedCounts(before, after) {
    const names = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...names].sort().map((name) => ({
        name,
        before: before[name] || 0,
        after: after[name] || 0
    })).filter((item) => item.before !== item.after);
}
