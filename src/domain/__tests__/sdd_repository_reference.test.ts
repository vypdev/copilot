import { SddDraftFormatFailure, validateSddMarkdown } from '../pre_branch_sdd';
import { validateSddDraftConsistency, type SddRepositoryInventory } from '../sdd_draft_consistency';
import { sddReferenceFixture } from '../../testing/sdd_reference_fixture';
import { buildSddReferenceIndex, hasBlockedSddAncestor, isSddNonFileNotation, sddReferencePrefix } from '../sdd_repository_reference';

const inventory: SddRepositoryInventory = {
  files: new Set(['README.md', 'frontend/package.json', 'docs/guide.md']),
  directories: new Set(['specs', 'frontend', 'docs', 'api']),
  blocked: new Set(['linked', 'submodule']),
};
const validate = (notation: string, paths?: string[][]) => {
  const markdown = sddReferenceFixture(notation, paths);
  validateSddMarkdown(markdown);
  validateSddDraftConsistency(markdown, [], inventory, 'specs/reference-control.md');
};

it.each([
  ['plain prose', 'Plain prose without protocol notation.'],
  ['relative HTTP endpoint', 'Relative HTTP endpoint: `api/v1/session`.'],
  ['absolute HTTP endpoint', 'Absolute HTTP endpoint: `/api/v1/session`.'],
  ['method with relative endpoint', 'Operation: `GET api/v1/session`.'],
  ['compact media type', 'Media type: `application/json`.'],
  ['labeled media header', 'Header: `Content-Type: application/json`.'],
  ['relative emitted URL', 'Relative emitted asset URL: `assets/main.js`.'],
  ['deployment alternatives', 'Deployment alternatives: `native/standalone`.'],
  ['existing file', 'Repository file: `frontend/package.json`.'],
  ['exact proposed leaf', 'Proposed file: `frontend/src/domain/entry.ts`.'],
  ['constructive future directory', 'Future parent directory: `frontend/src/domain/`.'],
  ['future directory in prose', 'The future parent directory is frontend/src/domain/.'],
])('accepts the reported %s control without changing runtime semantics', (_name, notation) => {
  expect(() => validate(notation)).not.toThrow();
});

it('preserves rejection of the reported genuine missing file control', () => {
  expect(() => validate('Repository file: `frontend/missing-runtime.ts`.')).toThrow(expect.objectContaining({ reason: 'repository-path' }));
});

it.each([
  ['vendor structured suffix', '`application/vnd.example+json`'],
  ['registered current top-level type', '`haptics/ivs`'],
  ['parameters', '`application/json;charset=utf-8`'],
  ['media range', '`application/*`'],
  ['all media range', '`*/*`'],
  ['HTTP method with file-shaped URL', '`POST api/v1/session.json`'],
  ['file-shaped URL outside code', 'Emitted URL: assets/main.js'],
  ['URL label inside code', '`URL: assets/main.js`'],
  ['URI field', 'URI = `assets/main.js`'],
  ['emphasized URL field', '**URL**: `assets/main.js`'],
  ['URL path label', 'URL path: `assets/main.js`'],
  ['scoped module', '`@scope/package`'],
  ['scoped module subpath', '`@scope/package/subpath.js`'],
  ['module prose', 'Import @scope/package/subpath.js'],
  ['built-in module', '`node:fs/promises`'],
  ['external URI', '`https://example.test/api/result.json`'],
])('recognizes %s as notation rather than repository existence', (_name, notation) => {
  expect(() => validate(notation)).not.toThrow();
});

it.each([
  ['unknown file-shaped root', '`missing/runtime.ts`'],
  ['known root without extension', '`frontend/missing`'],
  ['plain prose missing file', 'Inspect frontend/missing-runtime.ts'],
  ['command containing a missing file', '`cat frontend/missing-runtime.ts`'],
  ['unsafe traversal', '`frontend/../outside.ts`'],
  ['unknown traversal', '`unknown/../outside`'],
  ['repeated separator', '`unknown//name`'],
  ['MIME-shaped file role', 'File: `application/missing.py`'],
  ['Spanish file role', 'Archivo: `application/missing.py`'],
  ['blocked exact code reference', '`linked/file.ts`'],
  ['blocked namespace', '`linked/package`'],
  ['submodule reference', '`submodule/runtime.ts`'],
  ['unknown directory', '`unknown/directory/`'],
  ['sibling of declared directory', '`frontend/src/other/`'],
  ['regular file as a directory', '`frontend/package.json/`'],
  ['proposed file as a directory', '`frontend/src/domain/entry.ts/`'],
])('preserves strict citation checking for %s', (_name, notation) => {
  expect(() => validate(notation)).toThrow(expect.objectContaining({ reason: 'repository-path' }));
});

it.each([
  '[Missing media-shaped file](../application/json)',
  '[Missing module-shaped file](../@scope/package)',
  '[Missing endpoint-shaped file](../api/v1/session)',
  '[Missing asset](../assets/main.js)',
  '[Blocked inventory node](../linked)',
])('keeps explicit Markdown destinations strict regardless of notation shape: %s', notation => {
  expect(() => validate(notation)).toThrow(expect.objectContaining({ reason: 'repository-path' }));
});

it.each(['application/json', 'native/standalone', '@scope/package', 'assets/main.js'])('keeps Path/Change declarations strict for %s', file => {
  expect(() => validate('Declared repository artifact.', [
    ['specs/reference-control.md', 'create'], [file, 'reference'],
  ])).toThrow(expect.objectContaining({ reason: 'repository-path' }));
});

it.each([
  '`frontend/src/domain`', '`frontend/src/`', '[Future directory](../frontend/src/domain/)',
  '[Existing directory](../docs/)',
])('accepts only existing or constructively proposed directory reference %s', notation => {
  expect(() => validate(notation)).not.toThrow();
});

it.each([
  ['inline', '`frontend/PRIVATE.ts`', 'path-inline-reference'],
  ['prose', 'Inspect frontend/PRIVATE.ts', 'path-prose-reference'],
  ['destination', '[Private](../frontend/PRIVATE.ts)', 'path-link-reference'],
])('reports the %s origin and bounded ordinal without candidate text', (_label, notation, detail) => {
  try {
    validate(notation);
    throw new Error('Expected a reference rejection.');
  } catch (error) {
    expect(error).toBeInstanceOf(SddDraftFormatFailure);
    const diagnostic = (error as SddDraftFormatFailure).diagnostic;
    expect(diagnostic.facts).toContainEqual({ detail, section: 0, row: 1 });
    expect(diagnostic.facts).toContainEqual({ detail: 'path-reference-missing', section: 0 });
    expect(JSON.stringify(diagnostic)).not.toMatch(/PRIVATE|frontend|Private/);
    expect(diagnostic.facts.length).toBeLessThanOrEqual(8);
  }
});

it('does not turn a URL label on another line into a file exemption', () => {
  expect(() => validate('URL:\n`frontend/missing.ts`')).toThrow(expect.objectContaining({ reason: 'repository-path' }));
});

it('derives directory ancestry without mutating inventory or proposed file identities', () => {
  const proposed = new Set(['frontend/new/layer/entry.ts']);
  const index = buildSddReferenceIndex(inventory, proposed);
  expect([...index.futureDirectories]).toEqual(['frontend/new/layer', 'frontend/new', 'frontend']);
  expect([...proposed]).toEqual(['frontend/new/layer/entry.ts']);
  expect(inventory.directories.has('frontend/new')).toBe(false);
  expect(isSddNonFileNotation('frontend/new/layer/', '', index)).toBe(false);
});

it('bounds the retained label suffix while preserving arbitrary indentation of a URL field', () => {
  const source = 'Unrelated prose '.repeat(3000) + '**URL**:' + ' '.repeat(4000);
  const prefix = sddReferencePrefix(source, source.length);
  expect(prefix.length).toBeLessThanOrEqual(16);
  expect(isSddNonFileNotation('assets/main.js', prefix, buildSddReferenceIndex(inventory, new Set()))).toBe(true);
});

function diagnostic(notation: string) {
  try { validate(notation); throw new Error('Expected rejection.'); }
  catch (error) {
    expect(error).toBeInstanceOf(SddDraftFormatFailure);
    return (error as SddDraftFormatFailure).diagnostic;
  }
}

it('counts inline spans independently of hidden comments and fenced examples', () => {
  const result = diagnostic('<!-- `hidden/span` -->\n```text\n`hidden/span`\n```\n`first` `application/json` `frontend/PRIVATE.ts`');
  expect(result.facts).toContainEqual({ detail: 'path-inline-reference', section: 0, row: 3 });
});

it('counts prose references after known references without recounting validated code spans', () => {
  const result = diagnostic('`docs/guide.md` frontend/package.json then frontend/PRIVATE.ts');
  expect(result.facts).toContainEqual({ detail: 'path-prose-reference', section: 0, row: 2 });
});

it('counts Markdown destinations including external links before the rejected destination', () => {
  const result = diagnostic('[external](https://example.test/x) [valid](../docs/guide.md) [missing](../frontend/PRIVATE.ts)');
  expect(result.facts).toContainEqual({ detail: 'path-link-reference', section: 0, row: 3 });
});

it('identifies unsafe spelling without retaining its value', () => {
  const result = diagnostic('`frontend/../PRIVATE`');
  expect(result.facts).toContainEqual({ detail: 'path-reference-unsafe', section: 0 });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

it('identifies a blocked ancestor even when a URL label is nearby', () => {
  expect(diagnostic('URL: `linked/PRIVATE.ts`').facts).toContainEqual({ detail: 'path-reference-blocked', section: 0 });
});

it('identifies a regular file incorrectly referenced as a directory', () => {
  expect(diagnostic('`frontend/package.json/`').facts).toContainEqual({ detail: 'path-reference-directory', section: 0 });
});

it('locates an escaping Markdown destination without accepting traversal', () => {
  const result = diagnostic('[outside](../../PRIVATE.md)');
  expect(result.facts).toContainEqual({ detail: 'path-link', section: 0 });
  expect(result.facts).toContainEqual({ detail: 'path-link-reference', section: 0, row: 1 });
});

it('locates an undecodable Markdown destination without echoing its bytes', () => {
  const result = diagnostic('[broken](%PRIVATE)');
  expect(result.facts).toContainEqual({ detail: 'path-link', section: 0 });
  expect(result.facts).toContainEqual({ detail: 'path-link-reference', section: 0, row: 1 });
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
});

it('treats an exact inventory file as repository evidence even when its shape resembles a scoped module', () => {
  const index = buildSddReferenceIndex({ ...inventory, files: new Set([...inventory.files, '@scope/package/sub.js']) }, new Set());
  expect(isSddNonFileNotation('@scope/package/sub.js', 'URL', index)).toBe(false);
});

it('treats an exact inventory file as repository evidence even when its shape resembles a media type', () => {
  const index = buildSddReferenceIndex({ ...inventory, files: new Set([...inventory.files, 'application/json']) }, new Set());
  expect(isSddNonFileNotation('application/json', '', index)).toBe(false);
});

it('keeps explicit Unicode file identities portable without inventing an ASCII-only repository rule', () => {
  const paths = ['frontend/café.ts', 'frontend/🧪.ts'];
  const populated = { ...inventory, files: new Set([...inventory.files, ...paths]) };
  for (const file of paths) {
    expect(() => validateSddDraftConsistency(sddReferenceFixture('Repository file: `' + file + '`'), [], populated, 'specs/reference-control.md')).not.toThrow();
  }
});

it('keeps C1-control spelling rejected even under a URL context label', () => {
  expect(diagnostic('URL: `frontend/PRIVATE\u0085.ts`').facts).toContainEqual({ detail: 'path-reference-unsafe', section: 0 });
});

it('does not infer a media subtype from an incomplete top-level name', () => {
  expect(isSddNonFileNotation('application', '', buildSddReferenceIndex(inventory, new Set()))).toBe(false);
});

it('checks a deeply segmented untrusted citation without reconstructing every prefix', () => {
  const index = buildSddReferenceIndex(inventory, new Set());
  const deep = 'frontend/' + 'nested/'.repeat(20_000) + 'missing.ts';
  expect(hasBlockedSddAncestor(deep, index)).toBe(false);
  expect(isSddNonFileNotation(deep, '', index)).toBe(false);
});
