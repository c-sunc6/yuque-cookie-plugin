# PZh101/YuqueExportToMarkdown Research Notes

Source repo: https://github.com/PZh101/YuqueExportToMarkdown

Local clone used during research: `/tmp/YuqueExportToMarkdown`

## Why This Repo Matters

`PZh101/YuqueExportToMarkdown` is useful because it treats Yuque's exported `.lakebook` package as the source of truth and parses Lake ASL directly into Markdown. It does not solve online writing, but it gives us a practical map of Yuque Lake nodes, cards, and export structure.

For our cookie-based local tool, this repo is mainly a reference for:

- reading `body_draft_asl`
- understanding common Lake tags
- converting Lake to readable text/Markdown for AI review
- downloading card resources such as images and files
- preserving a Yuque knowledge base tree from `$meta.json`

## Important Files

- `readme.md`: usage and supported export modes.
- `startup.py`: CLI entry point.
- `lake/lake_reader.py`: extracts `.lakebook` tar packages and locates the inner root directory.
- `lake/lake_setup.py`: reads `$meta.json`, reconstructs the TOC tree, and converts every document.
- `lake/lake_handle.py`: main Lake-to-Markdown parser.
- `lake/failure_result_parser.py`: records failed resource downloads.

## Lakebook Structure

The converter assumes a `.lakebook` export can be unpacked as a tar archive. The extracted directory contains `$meta.json` plus JSON files for each document.

`$meta.json` contains a `meta` JSON string. Inside that string, `book.tocYml` stores the knowledge base catalog. `lake_setup.py` parses this YAML and builds:

- `id_and_book`: document UUID to TOC node.
- `parent_id_and_child`: parent UUID to children.
- `root_books`: top-level nodes.

Each document JSON contains:

- `doc.body_draft_asl`: Lake ASL HTML-like content.

This matches what our web snapshot command sees from Yuque edit mode: the important online field is also `body_asl` / `body_draft_asl`.

## Lake Tags Covered By The Parser

`lake/lake_handle.py` has a simple recursive parser using BeautifulSoup.

Block tags:

- `p`
- `h1` to `h7`
- `blockquote`
- `ul`
- `ol`
- `table`
- `card`

Inline tags:

- `span`
- `strong`
- `em`
- `del`
- `u`
- `sup`
- `sub`
- `code`
- `a`

Cards:

- `card[name="codeblock"]`: emits fenced code blocks with language from `mode`.
- `card[name="image"]`: downloads image and emits Markdown image.
- `card[name="hr"]`: emits horizontal rule.
- `card[name="label"]`: emits label text.
- `card[name="math"]`: emits LaTeX code plus downloaded formula image.
- `card[name="file"]`: downloads file-like resource.
- `card[name="yuque"]`: emits a Yuque internal link.

Unknown card types currently become a blank line. For our tool this is too lossy; unknown cards should be preserved in diagnostics and snapshots.

## Useful Implementation Ideas For Our Tool

1. Add a `lake-to-markdown` command.

   It can port the parser idea to JavaScript and read from our online snapshots. This gives the AI a cleaner representation without losing the raw Lake backup.

2. Keep card handling pluggable.

   Code blocks, images, math, tables, and internal Yuque links should be handled first. Unknown cards should output a placeholder plus raw card metadata.

3. Parse Lake with an HTML parser instead of regex.

   Our current `diff-lake` extracts headings with regex. That is acceptable as a small first step, but a DOM parser will be better for real formatting transforms.

4. Preserve Lake IDs.

   Yuque editor uses `id` and `data-lake-id` heavily. For safe online writes, transforms should keep these attributes unless we are creating new nodes through the official editor serialization path.

5. Treat export conversion as read-only.

   This repo is excellent for reading and conversion. It is not a guide for writing back to Yuque web documents.

## Risks And Gaps

- The project is Python and uses BeautifulSoup; our tool is Node.js.
- It targets exported `.lakebook`, not live Yuque web APIs.
- Markdown output loses editor-specific semantics. This is the exact trap we hit with heading numbering.
- Card support is incomplete for modern Yuque cards such as boards, bookmarks, checkboxes, and newer embeds.

## How This Helps The Numbering Problem

This repo tells us where heading text lives, but it does not reveal how the Yuque editor creates visual heading numbering. Manually inserting `1.` into heading text caused duplicate numbering in the editor, so numbering is likely represented by editor state, attributes, list-like structures, or generated CSS.

The correct next step remains:

```bash
cd /home/mi/文档/yuque-cookie-plugin
npm run yuque-local -- snapshot <doc-url> --out /tmp/before-numbering.json
# manually edit numbering in Yuque web editor
npm run yuque-local -- snapshot <doc-url> --out /tmp/after-numbering.json
npm run yuque-local -- diff-lake /tmp/before-numbering.json /tmp/after-numbering.json
```

Only after that diff should we implement an automatic numbering transform.
