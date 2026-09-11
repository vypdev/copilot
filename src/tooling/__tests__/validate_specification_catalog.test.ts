import { readFileSync } from 'node:fs';
import path from 'node:path';

interface CatalogCapability {
  id: string;
  title: string;
  status: string;
  scope: string;
  owner: string;
  lastVerified: string;
  specs: string[];
  workflows: string[];
  entrypoints: string[];
  code: string[];
  tests: string[];
  documentation: string[];
}

interface Catalog {
  version: number;
  capabilities: CatalogCapability[];
}

interface CatalogValidator {
  readCatalog(root: string): Catalog;
  renderCatalog(catalog: Catalog): string;
  validateCatalog(root: string, catalog: Catalog): string[];
  isSafeRelativePath(value: unknown): boolean;
  isIsoDate(value: unknown): boolean;
  validateAsBuiltSpecification(source: string, file: string): string[];
}

const validator = require('../../../scripts/validate-specification-catalog.cjs') as CatalogValidator;
const root = process.cwd();

function cloneCatalog(): Catalog {
  return JSON.parse(JSON.stringify(validator.readCatalog(root))) as Catalog;
}

describe('specification catalog validator', () => {
  it('accepts the repository catalog and every registered evidence path', () => {
    expect(validator.validateCatalog(root, cloneCatalog())).toEqual([]);
  });

  it('keeps the human catalog byte-for-byte generated from metadata', () => {
    const catalog = cloneCatalog();
    expect(readFileSync(path.join(root, 'specs/CATALOG.md'), 'utf8'))
      .toBe(validator.renderCatalog(catalog));
  });

  it('rejects duplicate capability ownership and duplicate specification ownership', () => {
    const catalog = cloneCatalog();
    catalog.capabilities[1].id = catalog.capabilities[0].id;
    catalog.capabilities[1].specs = [...catalog.capabilities[0].specs];
    const errors = validator.validateCatalog(root, catalog);
    expect(errors.some(error => error.includes('.id duplicates'))).toBe(true);
    expect(errors.some(error => error.includes('registered by multiple capabilities'))).toBe(true);
  });

  it.each(['../secret', '/tmp/spec.md', 'specs\\file.md', './specs/file.md', 'specs//file.md'])(
    'rejects unsafe path %s',
    value => {
      expect(validator.isSafeRelativePath(value)).toBe(false);
    },
  );

  it('rejects a missing path and a path outside its declared evidence boundary', () => {
    const catalog = cloneCatalog();
    catalog.capabilities[0].documentation = ['src/domain/deployment_operation.ts', 'docs/not-present.mdx'];
    const errors = validator.validateCatalog(root, catalog);
    expect(errors.some(error => error.includes('outside the documentation boundary'))).toBe(true);
    expect(errors.some(error => error.includes('does not resolve to an existing file'))).toBe(true);
  });

  it('rejects an invalid status and verification date', () => {
    const catalog = cloneCatalog();
    catalog.capabilities[0].status = 'done';
    catalog.capabilities[0].lastVerified = '11/09/2026';
    const errors = validator.validateCatalog(root, catalog);
    expect(errors.some(error => error.includes('.status must be one of'))).toBe(true);
    expect(errors.some(error => error.includes('.lastVerified must use YYYY-MM-DD'))).toBe(true);
    expect(validator.isIsoDate('2026-02-29')).toBe(false);
    expect(validator.isIsoDate('2024-02-29')).toBe(true);
  });

  it('rejects an incomplete retrospective baseline independently of file discovery', () => {
    const errors = validator.validateAsBuiltSpecification(
      '# Incomplete\n\n- Status: As-built baseline\n',
      'specs/incomplete.md',
    );
    expect(errors.some(error => error.includes('missing required section 20'))).toBe(true);
    expect(errors.some(error => error.includes('Known debt and limitations'))).toBe(true);
    expect(errors.some(error => error.includes('representative UI state: Partial:'))).toBe(true);
    expect(errors.some(error => error.includes('numeric test-budget total'))).toBe(true);
  });
});
