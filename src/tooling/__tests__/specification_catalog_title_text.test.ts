import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Node, Parser } from 'commonmark';
import { capability, catalog, documents } from './fixtures/proposed_sdd_catalog';

const validator = require('../../infrastructure/specification_catalog_validator.cjs');
const upstream = resolve(__dirname, '../../..');
const titles = [
  {
    "name": "ordinary",
    "title": "Ordinary title",
    "display": "Ordinary title"
  },
  {
    "name": "multilingual",
    "title": "Café 東京 العربية 🚀",
    "display": "Café 東京 العربية 🚀"
  },
  {
    "name": "heading and link injection",
    "title": "Ordinary\n## EXTRA_HEADING\n[link](https://example.invalid/repro)",
    "display": "Ordinary ## EXTRA_HEADING [link](https://example.invalid/repro)"
  },
  {
    "name": "nested link",
    "title": "[nested [label]](https://example.invalid)",
    "display": "[nested [label]](https://example.invalid)"
  },
  {
    "name": "image",
    "title": "![image](https://example.invalid/pixel)",
    "display": "![image](https://example.invalid/pixel)"
  },
  {
    "name": "raw HTML image",
    "title": "<img src=\"https://example.invalid/pixel\">",
    "display": "<img src=\"https://example.invalid/pixel\">"
  },
  {
    "name": "HTML comment",
    "title": "<!-- comment -->",
    "display": "<!-- comment -->"
  },
  {
    "name": "code delimiters",
    "title": "`code` and ``runs``",
    "display": "`code` and ``runs``"
  },
  {
    "name": "emphasis and strikethrough",
    "title": "*emphasis* _more_ **strong** ~~strike~~",
    "display": "*emphasis* _more_ **strong** ~~strike~~"
  },
  {
    "name": "table pipe",
    "title": "A | B",
    "display": "A | B"
  },
  {
    "name": "literal entity references",
    "title": "Literal &amp; &#35; &#0;",
    "display": "Literal &amp; &#35; &#0;"
  },
  {
    "name": "autolink",
    "title": "<https://example.invalid>",
    "display": "<https://example.invalid>"
  },
  {
    "name": "bare URLs",
    "title": "www.example.invalid https://example.invalid",
    "display": "www.example.invalid https://example.invalid"
  },
  {
    "name": "CRLF and thematic break",
    "title": "Title\r\n\r\n---",
    "display": "Title ---"
  },
  {
    "name": "CR and block quote",
    "title": "Title\r> quote",
    "display": "Title > quote"
  },
  {
    "name": "LF and list",
    "title": "Title\n- list",
    "display": "Title - list"
  },
  {
    "name": "backslash and closing heading hashes",
    "title": "Backslash \\ and trailing ###",
    "display": "Backslash \\ and trailing ###"
  },
  {
    "name": "reference link definition",
    "title": "[ref]\n\n[ref]: https://example.invalid",
    "display": "[ref] [ref]: https://example.invalid"
  }
];

function inlineText(node: Node): string {
  let text = '';
  for (let child = node.firstChild; child; child = child.next) text += child.literal ?? inlineText(child);
  return text;
}

describe('accepted catalog titles remain literal Markdown text', () => {
  let root: string;
  let previousExit: typeof process.exitCode;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'catalog-title-text-'));
    previousExit = process.exitCode;
    process.exitCode = 0;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    process.exitCode = previousExit;
    jest.restoreAllMocks();
    rmSync(root, { recursive: true, force: true });
  });
  function fixture(title: string, companion = false) {
    const item = capability('literal-title');
    item.title = title;
    if (companion) item.specs.push('specs/companion.md');
    documents(root, item);
    if (companion) writeFileSync(join(root, 'specs/companion.md'), '# Owned companion\n');
    const value = catalog([item]);
    const source = JSON.stringify(value, null, 2) + '\n';
    writeFileSync(join(root, 'specs/catalog.json'), source);
    expect(validator.validateCatalog(root, value)).toEqual([]);
    return { value, source };
  }
  function assertLiteralTitle(markdown: string, display: string, companion = false) {
    const walker = new Parser().parse(markdown).walker();
    const headings: Node[] = [], links: Node[] = [], extraMarkup: Node[] = [];
    let event;
    while ((event = walker.next())) if (event.entering) {
      if (event.node.type === 'heading') headings.push(event.node);
      if (event.node.type === 'link') links.push(event.node);
      if (['image', 'html_inline', 'html_block'].includes(event.node.type)) extraMarkup.push(event.node);
    }
    expect(headings.map(node => node.level)).toEqual([1, 2, 3, 2]);
    expect(inlineText(headings[2])).toBe('literal-title — ' + display);
    expect(links.map(node => node.destination)).toEqual(['./catalog.json', './literal-title.md', './literal-title.md',
      ...(companion ? ['./companion.md'] : []), '../docs/guide.md']);
    expect(inlineText(links[1])).toBe(display);
    for (let child = links[1].firstChild; child; child = child.next) expect(child.type).toBe('text');
    expect(extraMarkup).toEqual([]);
  }
  it.each(titles)('preserves accepted $name data in both title contexts', ({ title, display }) => {
    const sample = fixture(title);
    assertLiteralTitle(validator.renderCatalog(sample.value), display);
    expect(sample.value.capabilities[0].title).toBe(title);
    expect(JSON.stringify(sample.value, null, 2) + '\n').toBe(sample.source);
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(sample.source);
  });
  it('generates and validates literal titles through the instrumented entrypoint', () => {
    const sample = fixture(titles[2].title);
    validator.main(['--write'], root);
    expect(process.exitCode).toBe(0);
    assertLiteralTitle(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8'), titles[2].display);
    validator.main([], root);
    expect(process.exitCode).toBe(0);
    expect(console.log).toHaveBeenLastCalledWith('specification catalog validation: PASS (1 capabilities)');
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(sample.source);
  });
  it('keeps literal titles and companion navigation in the standalone three-file SDK without dependencies', () => {
    const sample = fixture(titles[2].title, true);
    for (const relative of ['src/infrastructure/specification_catalog_validator.cjs',
      'src/infrastructure/specification_catalog_publication.cjs', 'src/domain/specification_catalog_path_policy.cjs']) {
      mkdirSync(dirname(join(root, relative)), { recursive: true });
      copyFileSync(join(upstream, relative), join(root, relative));
    }
    expect(execFileSync(process.execPath, ['src/infrastructure/specification_catalog_validator.cjs', '--write'],
      { cwd: root, encoding: 'utf8' })).toContain('generation: PASS');
    assertLiteralTitle(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8'), titles[2].display, true);
    expect(execFileSync(process.execPath, ['src/infrastructure/specification_catalog_validator.cjs'],
      { cwd: root, encoding: 'utf8' })).toContain('validation: PASS');
    expect(existsSync(join(root, 'package.json'))).toBe(false);
    expect(readFileSync(join(root, 'specs/catalog.json'), 'utf8')).toBe(sample.source);
  });
});
