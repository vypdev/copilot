import { readSupportedSddCatalog, SddCatalogCompatibilityFailure } from '../sdd_catalog_compatibility';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSddPlan } from '../pre_branch_sdd';

const native = JSON.parse(readFileSync(join(__dirname, '../../testing/fixtures/sdd-native-catalog/catalog.json'), 'utf8'));
const proposed = { action: 'new', path: 'specs/native-oauth-validation-trial.md',
  capabilityId: 'native-oauth-validation-trial', reason: 'Prepare an isolated supported read-only native OAuth validation capability.', questions: [] };

describe('catalog owner-path compatibility (#716)', () => {
  it.each([
    ['actual pinned native catalog', new Map<string, readonly string[]>(native.capabilities.map((capability: { id: string; specs: readonly string[] }) => [capability.id, capability.specs]))],
    ['mixed owner path dialects', new Map([['sdk', ['specs/sdk.md']], ['native', undefined as never]])],
    ['non-array owner paths', new Map([['sdk', 'specs/sdk.md' as never]])],
    ['empty owner paths', new Map([['sdk', []]])],
    ['non-string owner path', new Map([['sdk', [1 as never]]])],
    ['duplicate owner paths', new Map([['sdk', ['specs/sdk.md']], ['other', ['specs/sdk.md']]])],
    ['unsafe owner path', new Map([['sdk', ['../private.md']]])],
  ] as const)('returns a closed typed failure for %s before interpreting a model plan', (_label, owners) => {
    let failure: unknown;
    try { parseSddPlan(proposed, owners); } catch (error) { failure = error; }
    expect(failure).toMatchObject({ name: 'SddCatalogCompatibilityFailure', reason: 'owner-paths-invalid' });
    expect(JSON.stringify(failure)).not.toMatch(/private|home-assistant|SYM-|requirements|blockers/u);
  });

  it.each(['specs/nested/owner.md', 'specs/Owner with spaces.md', 'specs/contrato-ñ.md'])('retains existing SDK owner-path conventions: %s', path => {
    expect(parseSddPlan(proposed, new Map([['sdk', [path]]]))).toMatchObject(proposed);
  });

  it.each([
    ['primary update', { action: 'update', capabilityId: 'sdk', path: 'specs/sdk.md' }],
    ['companion update', { action: 'update', capabilityId: 'sdk', path: 'specs/sdk-more.md' }],
    ['new companion', { action: 'companion', capabilityId: 'sdk', path: 'specs/new.md' }],
    ['new capability', { action: 'new', capabilityId: 'new', path: 'specs/new.md' }],
  ] as const)('preserves supported SDK ownership: %s', (_label, selected) => {
    expect(parseSddPlan({ ...proposed, ...selected }, new Map([['sdk', ['specs/sdk.md', 'specs/sdk-more.md']]])))
      .toMatchObject(selected);
  });
});


const sdkEntry = () => ({ id: 'sdk', title: 'SDK capability', status: 'proposed', scope: 'Existing product scope',
  owner: 'Maintainers', lastVerified: '2026-10-27', specs: ['specs/sdk.md'], workflows: [],
  entrypoints: ['src/index.ts'], code: ['src/index.ts'], tests: ['test/check.py'], documentation: ['docs/guide.md'] });
const sdk = () => ({ version: 1, capabilities: [sdkEntry()] });
const profileFailure = (source: string, reason: string) => {
  let error: unknown; try { readSupportedSddCatalog(source); } catch (failure) { error = failure; }
  expect(error).toMatchObject({ name: 'SddCatalogCompatibilityFailure', reason });
  expect(String(error)).not.toMatch(/PRIVATE|home-assistant|SYM-|ready-for-review/u);
};

describe('explicit installed catalog publication profile', () => {
  it.each(['as-built-baseline', 'implemented', 'proposed', 'deprecated'])('normalizes the SDK %s view without changing status', status => {
    const result = readSupportedSddCatalog(JSON.stringify({ ...sdk(), capabilities: [{ ...sdkEntry(), status }] }));
    expect(result.profile).toBe('sdk-v1'); expect(result.capabilities[0].status).toBe(status);
    expect(result.capabilities[0].specs).toEqual(['specs/sdk.md']);
    expect(Object.isFrozen(result.capabilities[0].specs)).toBe(true);
  });

  it('preserves capability IDs accepted by the existing planning grammar', () => {
    expect(readSupportedSddCatalog(JSON.stringify({ ...sdk(), capabilities: [{ ...sdkEntry(), id: 'sdk--existing' }] })).capabilities[0].id).toBe('sdk--existing');
  });

  it('preserves unknown SDK root and entry metadata while exposing only the reviewed owner view', () => {
    const input = { ...sdk(), projectEvidence: { ready: false, rank: 3, context: null, reviews: ['owner'] },
      capabilities: [{ ...sdkEntry(), requirements: ['REQ-001'], evidence: ['docs/design.md'],
        implementationEvidence: { code: ['src/index.ts'], tests: [], documentation: [] }, blockers: ['Pending owner review'] }] };
    const source = JSON.stringify(input); const result = readSupportedSddCatalog(source);
    expect(JSON.parse(JSON.stringify(result.document))).toEqual(input);
    expect(result.capabilities[0]).not.toHaveProperty('blockers');
    expect(result.capabilities[0]).not.toHaveProperty('requirements');
    expect([result, result.document, result.document.capabilities, result.document.capabilities[0], result.document.projectEvidence].every(Object.isFrozen)).toBe(true);
  });

  it('rejects the actual repository-native profile without converting any of its fields', () => {
    const source = JSON.stringify(native); const before = JSON.stringify(native);
    profileFailure(source, 'unsupported-profile'); expect(JSON.stringify(native)).toBe(before);
    expect(native.capabilities.every((entry: object) => Object.prototype.hasOwnProperty.call(entry, 'specification'))).toBe(true);
  });

  it.each([
    [null, 'invalid-document'], [[], 'invalid-document'], [42, 'invalid-document'],
    [{ version: 2, capabilities: [sdkEntry()] }, 'invalid-document'],
    [{ version: 1, capabilities: [] }, 'invalid-document'], [{ version: 1, capabilities: {} }, 'invalid-document'],
    [{ version: 1, capabilities: [null] }, 'invalid-document'],
    [{ version: 1, capabilities: [{}] }, 'invalid-document'],
    [{ ...sdk(), $schema: './PRIVATE.schema.json' }, 'unsupported-profile'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), specification: 'specs/PRIVATE.md' }] }, 'ambiguous-profile'],
    [{ ...sdk(), capabilities: [sdkEntry(), native.capabilities[0]] }, 'ambiguous-profile'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), title: ' ' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), owner: null }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), id: 'PRIVATE ID' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [sdkEntry(), { ...sdkEntry(), title: 'Distinct title' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [sdkEntry(), { ...sdkEntry(), id: 'other' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), status: 'ready-for-review' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), lastVerified: 'PRIVATE' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), lastVerified: '9999-99-99' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), lastVerified: '2026-02-30' }] }, 'invalid-metadata'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), specs: null }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), specs: [] }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), code: [1] }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), code: ['../PRIVATE'] }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), workflows: ['src/PRIVATE.txt'] }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [{ ...sdkEntry(), specs: ['specs/sdk.md', 'specs/sdk.md'] }] }, 'owner-paths-invalid'],
    [{ ...sdk(), capabilities: [sdkEntry(), { ...sdkEntry(), id: 'other', title: 'Other' }] }, 'owner-paths-invalid'],
  ] as const)('rejects malformed, unsupported or ambiguous metadata without quoting it: %j', (value, reason) => {
    profileFailure(JSON.stringify(value), reason);
  });

  it('returns a closed JSON diagnostic rather than the parser message', () => profileFailure('{"PRIVATE":', 'invalid-json'));
  it('bounds source size before parsing', () => profileFailure(' '.repeat(2097153), 'invalid-document'));
  it('bounds capability count before metadata iteration', () => profileFailure(JSON.stringify({ version: 1, capabilities: Array.from({ length: 1001 }, sdkEntry) }), 'invalid-document'));
  it('bounds nested extension metadata without accepting a partial document', () => {
    let extension: unknown = null; for (let depth = 0; depth < 25; depth++) extension = { next: extension };
    profileFailure(JSON.stringify({ ...sdk(), extension }), 'invalid-metadata');
  });
  it('rejects forged reason and source revision facts before they can become diagnostic data', () => {
    expect(() => new SddCatalogCompatibilityFailure('PRIVATE' as never)).toThrow('closed');
    expect(() => new SddCatalogCompatibilityFailure('invalid-json', 'PRIVATE')).toThrow('source revision');
    const failure = new SddCatalogCompatibilityFailure('unsupported-profile', 'a'.repeat(40));
    expect(failure.sourceCommit).toBe('a'.repeat(40)); expect(Object.isFrozen(failure)).toBe(true);
  });
});
