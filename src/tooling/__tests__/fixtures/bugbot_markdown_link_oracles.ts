/** Closed, authored fixtures. Corpus text is compared, never executed or used as a filesystem path. */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import * as ts from 'typescript';

function renderSpecLink(spec: string): string { return './' + spec.slice(spec.lastIndexOf('/') + 1); }
const renderer = "function renderSpecLink(spec: string): string { return './' + spec.slice(spec.lastIndexOf('/') + 1); }";
const heading = '## Architecture\n';
const rendererContract = 'GitHub Markdown: relative paths use the source directory; initial / means repository root. The plain heading ## Architecture has anchor architecture.';

interface Fixture {
  readonly id: string;
  readonly source: string;
  readonly href: string;
  readonly files: readonly string[];
  readonly unavailable?: boolean;
  readonly renderedFrom?: string;
  readonly spec?: string;
}

export const MARKDOWN_LINK_FIXTURES: readonly Fixture[] = [
  { id: 'md-link-root-self', source: 'specs/payments.md', href: '../specs/payments.md#architecture', files: ['specs/payments.md'] },
  { id: 'md-link-nested-self', source: 'specs/payments/design.md', href: '../payments/design.md#architecture', files: ['specs/payments/design.md'] },
  { id: 'md-link-companion', source: 'specs/payments/design.md', href: '../../specs/private-sharing.md#architecture', files: ['specs/payments/design.md', 'specs/private-sharing.md'] },
  { id: 'md-link-root-relative', source: 'specs/payments/design.md', href: '/specs/semantic-editor.md#architecture', files: ['specs/payments/design.md', 'specs/semantic-editor.md'] },
  { id: 'md-link-evidence-unavailable', source: 'specs/payments.md', href: '../specs/unknown.md#architecture', files: [], unavailable: true },
  { id: 'md-link-extra-specs-directory', source: 'specs/payments.md', href: './specs/payments.md#architecture', files: ['specs/payments.md'] },
  { id: 'md-link-missing-fragment', source: 'specs/payments.md', href: '../specs/payments.md#missing-architecture', files: ['specs/payments.md'] },
  { id: 'md-link-renderer-drops-directory', source: 'scripts/catalog.ts', href: './design.md', files: ['scripts/catalog.ts', 'specs/CATALOG.md', 'specs/payments/design.md'], renderedFrom: 'specs/CATALOG.md', spec: 'specs/payments/design.md' },
];

/** Neutral source/evidence supplied to the real agent; no expected verdict is included. */
export function markdownFixtureDiff(fixture: Fixture): string {
  if (fixture.spec) return [
    '+' + renderer,
    ' // Synthetic same-revision renderer call: renderSpecLink("' + fixture.spec + '")',
    ' // The result becomes [Design](result) in ' + fixture.renderedFrom + '.',
    ' // Complete tracked-file inventory: ' + fixture.files.join(', ') + '.',
    ' // Every Markdown target contains only ## Architecture; no custom anchors or other files exist.',
    ' // ' + rendererContract,
  ].join('\n');
  return [
    '+[Design](' + fixture.href + ')',
    ...(fixture.unavailable ? [
      ' // Target source, tree inventory, renderer and heading context are unavailable; no lookup or execution receipt is supplied.',
    ] : [
      ' ## Architecture',
      ' <!-- Synthetic same-revision complete tracked-file inventory: ' + fixture.files.join(', ') + '. -->',
      ' <!-- Each document consists only of this added link (for the source) and the plain Architecture heading; no custom anchors. -->',
      ' <!-- ' + rendererContract + ' -->',
    ]),
  ].join('\n');
}

function compiled(source: string): string {
  const result = ts.transpileModule(source, { reportDiagnostics: true, compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None, removeComments: true,
  } });
  if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error)) throw new Error('Invalid authored fixture.');
  return result.outputText.trim();
}

export function observeMarkdownLinkFixture(item: { readonly id: string; readonly file: string; readonly diff: string }): {
  source: string; href: string; target: string; exists: boolean; anchorExists: boolean;
} {
  const fixture = MARKDOWN_LINK_FIXTURES.find(candidate => candidate.id === item.id);
  if (!fixture || fixture.unavailable || item.file !== fixture.source || item.diff !== markdownFixtureDiff(fixture)) {
    throw new Error('Unknown or modified authored Markdown fixture.');
  }
  // Only this statically authored function executes. Emitted/transpiled corpus strings do not.
  if (fixture.spec && compiled(renderer) !== compiled(renderSpecLink.toString())) throw new Error('Renderer source mismatch.');
  const href = fixture.spec ? renderSpecLink(fixture.spec) : fixture.href;
  if (href !== fixture.href) throw new Error('Authored renderer result mismatch.');
  const source = fixture.renderedFrom ?? fixture.source;
  const url = new URL(href, 'https://fixture.invalid/' + source);
  const target = decodeURIComponent(url.pathname.slice(1));
  const root = mkdtempSync(join(tmpdir(), 'copilot-markdown-links-'));
  try {
    for (const file of fixture.files) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), file === fixture.source && fixture.spec ? renderer
        : (file === source ? '[Design](' + href + ')\n' : '') + heading);
    }
    const exists = existsSync(join(root, target));
    // These fixtures intentionally use one plain ASCII heading. This is not a generic Markdown parser.
    const anchorExists = exists && (!url.hash || (url.hash === '#architecture'
      && readFileSync(join(root, target), 'utf8').split('\n').includes('## Architecture')));
    return { source, href, target, exists, anchorExists };
  } finally { rmSync(root, { recursive: true, force: true }); }
}
