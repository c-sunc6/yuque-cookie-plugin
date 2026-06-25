import { parse } from 'node-html-parser';
export function enableLakeHeadingNumbering(lake) {
    if (!lake.trim())
        return lake;
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
    for (const heading of root.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
        heading.setAttribute('data-lake-index-type', '2');
        stripTextualHeadingNumber(heading);
    }
    return root.toString();
}
function stripTextualHeadingNumber(heading) {
    const firstSpan = heading.querySelector('span');
    if (!firstSpan)
        return;
    const current = firstSpan.text;
    const next = current.replace(/^\s*\d+(?:\.\d+)*\.?\s+/, '');
    if (next !== current)
        firstSpan.set_content(next);
}
