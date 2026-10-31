import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSupportedSddCatalog } from '../../domain/sdd_catalog_compatibility';
import { capability, documents, implementation, catalog } from './fixtures/proposed_sdd_catalog';

const validator = require('../../infrastructure/specification_catalog_validator.cjs');
const fields = ['entrypoints', 'code', 'tests'] as const;
describe('truthful proposed SDK catalogs', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'proposed-sdk-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('accepts an all-proposed repository without manufacturing source or tests', () => {
    const items = Array.from({ length: 11 }, (_, i) => capability('future-' + i));
    for (const item of items) documents(root, item);
    expect(validator.validateCatalog(root, catalog(items))).toEqual([]);
    expect(existsSync(join(root, 'lib'))).toBe(false);
    expect(existsSync(join(root, 'checks'))).toBe(false);
  });

  it('retains frozen proposed metadata and readiness without promoting it', () => {
    const source = { ...catalog([capability()]), review: { approved: false, blocker: 'Owner review' } };
    const view = readSupportedSddCatalog(JSON.stringify(source));
    expect(view.document).toEqual(source);
    expect(view.capabilities[0].status).toBe('proposed');
    expect(Object.isFrozen(view.capabilities[0].entrypoints)).toBe(true);
    expect(view.document.capabilities[0].readiness).toEqual(source.capabilities[0].readiness);
  });

  it.each(fields)('allows an explicitly empty proposed %s array alongside real evidence', field => {
    const item = capability(); documents(root, item); implementation(root, item); item[field] = [];
    expect(validator.validateCatalog(root, catalog([item]))).toEqual([]);
    expect(readSupportedSddCatalog(JSON.stringify(catalog([item]))).capabilities[0][field]).toEqual([]);
  });

  it.each(['implemented', 'as-built-baseline', 'deprecated'].flatMap(status => fields.map(field => [status, field] as const)))(
    'requires %s evidence in %s', (status, field) => {
      const item = capability('future', status); documents(root, item); implementation(root, item); item[field] = [];
      expect(validator.validateCatalog(root, catalog([item]))).toContain('capabilities[0].' + field + ' must not be empty.');
      expect(() => readSupportedSddCatalog(JSON.stringify(catalog([item])))).toThrow('owner-paths-invalid');
    });

  it.each(fields.flatMap(field => [[field, undefined], [field, null]] as const))('requires the proposed %s array even when its value is %s', (field, value) => {
    const item = capability(); documents(root, item); Object.assign(item, { [field]: value });
    expect(validator.validateCatalog(root, catalog([item]))).toContain('capabilities[0].' + field + ' must be an array.');
    expect(() => readSupportedSddCatalog(JSON.stringify(catalog([item])))).toThrow('owner-paths-invalid');
  });

  it.each(['specs', 'documentation'] as const)('retains nonempty proposed %s requirements', field => {
    const item = capability(); documents(root, item); item[field] = [];
    expect(validator.validateCatalog(root, catalog([item]))).toContain('capabilities[0].' + field + ' must not be empty.');
    expect(() => readSupportedSddCatalog(JSON.stringify(catalog([item])))).toThrow('owner-paths-invalid');
  });

  it.each(fields)('rejects a supplied nonexistent proposed %s file', field => {
    const item = capability(); documents(root, item); item[field] = ['missing/file.cjs'];
    expect(validator.validateCatalog(root, catalog([item])).some((error: string) => error.includes('.' + field + '[0] does not resolve'))).toBe(true);
  });

  it('rejects an escaping source path even for an otherwise valid proposed entry', () => {
    const item = capability(); documents(root, item); item.code = ['../outside.cjs'];
    expect(validator.validateCatalog(root, catalog([item])).some((error: string) => error.includes('normalized repository-relative'))).toBe(true);
    expect(() => readSupportedSddCatalog(JSON.stringify(catalog([item])))).toThrow('owner-paths-invalid');
  });

  it('rejects a supplied source directory alias outside the repository', () => {
    const outside = mkdtempSync(join(tmpdir(), 'proposed-sdk-outside-'));
    try {
      writeFileSync(join(outside, 'source.cjs'), 'exports.external = true;\n');
      symlinkSync(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
      const item = capability(); documents(root, item); item.code = ['linked/source.cjs'];
      expect(validator.validateCatalog(root, catalog([item])).some((error: string) => error.includes('without symlinks'))).toBe(true);
      expect(readFileSync(join(outside, 'source.cjs'), 'utf8')).toBe('exports.external = true;\n');
    } finally { rmSync(outside, { recursive: true, force: true }); }
  });

  it('retains unique specification ownership for an all-proposed catalog', () => {
    const first = capability(); documents(root, first);
    const second = { ...capability('other'), specs: first.specs };
    expect(validator.validateCatalog(root, catalog([first, second])).some((error: string) => error.includes('multiple capabilities'))).toBe(true);
    expect(() => readSupportedSddCatalog(JSON.stringify(catalog([first, second])))).toThrow('owner-paths-invalid');
  });

  it('supports mixed proposed and implemented entries without changing either status', () => {
    const planned = capability(); const built = capability('built', 'implemented');
    documents(root, planned); documents(root, built); implementation(root, built);
    const source = catalog([planned, built]); expect(validator.validateCatalog(root, source)).toEqual([]);
    expect(readSupportedSddCatalog(JSON.stringify(source)).document).toEqual(source);
  });

  it('requires real files for promotion and keeps test execution a separate observable fact', () => {
    const item = capability(); documents(root, item); item.status = 'implemented';
    expect(validator.validateCatalog(root, catalog([item])).filter((error: string) => error.includes('must not be empty.'))).toHaveLength(3);
    implementation(root, item);
    execFileSync(process.execPath, [join(root, item.tests[0])], { cwd: root, stdio: 'pipe' });
    item.readiness = { ...item.readiness, implementationEvidence: 'present' };
    expect(validator.validateCatalog(root, catalog([item]))).toEqual([]);
    expect(readSupportedSddCatalog(JSON.stringify(catalog([item]))).document.capabilities[0].readiness).toEqual(item.readiness);
  });

  it('shows not-yet-implemented evidence while retaining workflow semantics and real links', () => {
    const item = capability(); const rendered = validator.renderCatalog(catalog([item]));
    expect(rendered.split('Not yet implemented (proposed capability).')).toHaveLength(4);
    expect(rendered).toContain('- Workflows: Not applicable for this capability.');
    expect(rendered).toContain('./future.md'); expect(rendered).toContain('../docs/guide.md');
    expect(rendered).not.toContain('Ready for implementation');
  });

  it('preserves populated implemented evidence links without absence messages', () => {
    const item = capability('built', 'implemented'); documents(root, item); implementation(root, item);
    const rendered = validator.renderCatalog(catalog([item]));
    expect(rendered).toContain('../lib/quote.cjs'); expect(rendered).toContain('../checks/quote.cjs');
    expect(rendered).not.toContain('Not yet implemented');
  });
});
