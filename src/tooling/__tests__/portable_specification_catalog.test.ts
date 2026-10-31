import { mkdirSync, mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PORTABLE_SDD_LAYOUTS, portableSddCapability, writePortableSddEvidence } from '../../testing/portable_sdd_catalog_fixture';
import { canCreateFileSymlink } from '../../testing/file_symlink_capability';

const { validateCatalog, readCatalog, renderCatalog, isSafeRelativePath } = require('../../../scripts/validate-specification-catalog.cjs');
const symlinkIt = canCreateFileSymlink() ? it : it.skip;

describe('portable catalog evidence and filesystem containment', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'portable-sdd-'));
    mkdirSync(join(root, 'specs'));
    writeFileSync(join(root, 'specs/payments.md'), '# Proposed payments\n');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it.each([
    ['root specification', ['specs/payments.md']],
    ['nested primary', ['specs/group/payments.md']],
    ['nested primary and companion', ['specs/group/payments.md', 'specs/group/companion.md']],
    ['same basename in separate directories', ['specs/group/payments.md', 'specs/other/payments.md']],
    ['deeply nested primary', ['specs/group/deep/payments.md']],
    ['root primary and same-name nested companion', ['specs/payments.md', 'specs/group/payments.md']],
  ])('preserves catalog-relative links for %s', (_name, specs) => {
    rmSync(join(root, 'specs/payments.md'));
    const capability = { ...portableSddCapability(), specs: specs as string[] };
    writePortableSddEvidence(root, capability);
    for (const file of capability.specs) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), '# Proposed specification\n');
    }
    const catalog = { version: 1, capabilities: [capability] };
    writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify(catalog));
    expect(validateCatalog(root, catalog)).toEqual([]);
    const rendered = renderCatalog(catalog);
    const primary = capability.specs[0].slice('specs/'.length);
    expect(rendered).toContain(`[Payments](./${primary})`);
    if (capability.specs.length > 1) expect(rendered).toContain(' + 1 companion');
    for (const file of capability.specs) {
      expect(rendered).toContain(`[\`${file}\`](./${file.slice('specs/'.length)})`);
    }
    const links = [...rendered.matchAll(/\]\((\.[^)]+)\)/gu)].map(match => match[1]);
    expect(links.length).toBeGreaterThan(capability.specs.length);
    for (const target of links) expect(statSync(resolve(root, 'specs', target)).isFile()).toBe(true);
  });

  it('keeps non-specification evidence relative to the repository root', () => {
    const capability = portableSddCapability();
    writePortableSddEvidence(root, capability);
    const rendered = renderCatalog({ version: 1, capabilities: [capability] });
    for (const file of [...capability.entrypoints, ...capability.code, ...capability.tests, ...capability.documentation]) {
      expect(rendered).toContain(`[\`${file}\`](../${file})`);
    }
  });

  it.each(PORTABLE_SDD_LAYOUTS)('accepts existing %s metadata without executing its toolchain', (_name, source, test, doc) => {
    const capability = { ...portableSddCapability(), entrypoints: [String(source)], code: [String(source)], tests: [String(test)], documentation: [String(doc)] };
    writePortableSddEvidence(root, capability);
    expect(validateCatalog(root, { version: 1, capabilities: [capability] })).toEqual([]);
  });

  it.each(['../secret', '/tmp/source', 'C:/source.ts', 'C:source.ts', 'src\\source.ts', './src/file', 'src//file', 'src/../file', '.git/config', 'pkg/.GIT/config', 'src/file\0.ts', 'source.ts:stream'])('rejects unsafe cross-platform path %s', file => {
    expect(isSafeRelativePath(file)).toBe(false);
  });

  it.each(['missing', 'directory', 'duplicate evidence', 'duplicate owner', 'wrong workflow boundary'])('rejects %s while retaining portable evidence support', scenario => {
    const capability = portableSddCapability();
    writePortableSddEvidence(root, capability);
    const catalog = { version: 1, capabilities: [capability] };
    if (scenario === 'missing') rmSync(join(root, capability.tests[0]));
    if (scenario === 'directory') { rmSync(join(root, capability.tests[0])); mkdirSync(join(root, capability.tests[0])); }
    if (scenario === 'duplicate evidence') capability.tests.push(capability.tests[0]);
    if (scenario === 'duplicate owner') catalog.capabilities.push({ ...capability, id: 'other', title: 'Other' });
    if (scenario === 'wrong workflow boundary') capability.workflows.push(capability.code[0]);
    expect(validateCatalog(root, catalog).length).toBeGreaterThan(0);
  });

  symlinkIt.each(['file', 'parent', 'specs root'] as const)('rejects an external %s symlink before reading external content', scenario => {
    const outside = mkdtempSync(join(tmpdir(), 'portable-sdd-external-'));
    try {
      const capability = portableSddCapability();
      writePortableSddEvidence(root, capability);
      writeFileSync(join(outside, 'external.custom'), 'external private content');
      if (scenario === 'file') symlinkSync(join(outside, 'external.custom'), join(root, 'linked.custom'), 'file');
      if (scenario === 'parent') symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      if (scenario === 'specs root') {
        rmSync(join(root, 'specs'), { recursive: true });
        symlinkSync(outside, join(root, 'specs'), process.platform === 'win32' ? 'junction' : 'dir');
      } else capability.code = [scenario === 'file' ? 'linked.custom' : 'linked/external.custom'];
      expect(validateCatalog(root, { version: 1, capabilities: [capability] }).length).toBeGreaterThan(0);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  symlinkIt('never reads a linked catalog or as-built specification outside the repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'portable-sdd-private-'));
    try {
      const target = join(outside, 'private');
      writeFileSync(target, 'private bytes that must not be read as a catalog or SDD');
      symlinkSync(target, join(root, 'specs/catalog.json'), 'file');
      expect(() => readCatalog(root)).toThrow('without symlinks');
      const capability = { ...portableSddCapability(), status: 'as-built-baseline' };
      writePortableSddEvidence(root, capability);
      rmSync(join(root, 'specs/payments.md'));
      symlinkSync(target, join(root, 'specs/payments.md'), 'file');
      const errors: string[] = validateCatalog(root, { version: 1, capabilities: [capability] });
      expect(errors.some(error => error.includes('without symlinks'))).toBe(true);
      expect(errors.some(error => error.includes('missing metadata'))).toBe(false);
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });
});
