import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BigIntStats } from 'node:fs';
const fs: typeof import('node:fs') = require('node:fs');
import { inspectBranchSyncCatalogSource, inspectBranchSyncSddCatalogProfile, refreshBranchSyncSddCatalog,
    refreshBranchSyncSddCatalogDetailed } from '../branch_sync_sdd_catalog';
import * as logging from '../../application/ports/logging_ports';

const validator = require('../specification_catalog_validator.cjs');
const publisher = require('../specification_catalog_publication.cjs');
function legacy(status = 'Proposed', lastVerified: string | null = null) {
    return { id: 'private-owner-do-not-publish', title: 'PRIVATE product title', status, scope: 'PRIVATE scope',
        owner: 'PRIVATE owner', lastVerified, specs: ['specs/owner.md'], evidence: ['PRIVATE/directory/'],
        openDecisions: ['PRIVATE unresolved decision'] };
}
function sdk() {
    return { id: 'sdk', title: 'SDK', status: 'proposed', scope: 'SDK scope', owner: 'Maintainers',
        lastVerified: '2026-10-29', specs: ['specs/sdk.md'], workflows: [], entrypoints: [], code: [], tests: [],
        documentation: ['docs/guide.md'], evidence: ['PRIVATE retained legacy evidence'] };
}

describe('branch-sync catalog compatibility before publication', () => {
    let root: string;
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'sync-catalog-profile-'));
        mkdirSync(join(root, 'specs')); mkdirSync(join(root, 'docs'));
        writeFileSync(join(root, 'specs/owner.md'), '# Existing owner\n');
        writeFileSync(join(root, 'specs/sdk.md'), '# SDK owner\n');
        writeFileSync(join(root, 'docs/guide.md'), '# Guide\n');
        writeFileSync(join(root, 'specs/CATALOG.md'), '# PRIVATE retained index\n');
    });
    afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

    function writeSdk(capabilities = [sdk()]) {
        rmSync(join(root, 'specs/owner.md'));
        writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify({ version: 1, capabilities }));
    }
    it('allows a complete SDK catalog to retain opaque historical evidence without changing metadata', () => {
        writeSdk(); const file = join(root, 'specs/catalog.json'), metadata = readFileSync(file);
        expect(refreshBranchSyncSddCatalogDetailed(root)).toEqual({ valid: true });
        expect(readFileSync(file)).toEqual(metadata);
        expect(readFileSync(join(root, 'specs/CATALOG.md'), 'utf8')).toContain('Not yet implemented');
    });
    it.each(['id', 'title', 'scope', 'owner', 'lastVerified'] as const)('reports the bounded field for an empty SDK %s', field => {
        const capability = sdk(); capability[field] = '';
        writeSdk([capability]);
        expect(refreshBranchSyncSddCatalogDetailed(root)).toEqual({ valid: false,
            diagnostic: { phase: 'catalog-contract', profile: 'sdk-v1', field, capabilityNumber: 1 } });
    });
    it.each(['invalid date', 'duplicate id', 'duplicate title', 'duplicate path', 'empty docs', 'nonstring path', 'duplicate owner'])(
        'retains the index when SDK metadata has %s', scenario => {
            const first = sdk(), second = { ...sdk(), id: 'second', title: 'Second', specs: ['specs/second.md'] };
            const capabilities = [first];
            if (scenario === 'invalid date') first.lastVerified = '2026-02-30';
            if (scenario.startsWith('duplicate') && ['duplicate id', 'duplicate title', 'duplicate owner'].includes(scenario)) {
                capabilities.push(second); writeFileSync(join(root, 'specs/second.md'), '# Second\n');
                if (scenario === 'duplicate id') second.id = first.id;
                if (scenario === 'duplicate title') second.title = first.title;
                if (scenario === 'duplicate owner') second.specs = first.specs;
            }
            if (scenario === 'duplicate path') first.documentation.push(first.documentation[0]);
            if (scenario === 'empty docs') first.documentation = [];
            if (scenario === 'nonstring path') first.documentation = [42 as never];
            writeSdk(capabilities); const before = readFileSync(join(root, 'specs/CATALOG.md'));
            expect(refreshBranchSyncSddCatalog(root)).toBe(false);
            expect(readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(before);
        });
    it.each(['identity', 'size', 'timestamp', 'file type', 'short read', 'changed size', 'changed timestamp', 'changed links'] as const)(
        'rejects a %s race during descriptor reads without publishing', scenario => {
            writeSdk(); const before = readFileSync(join(root, 'specs/CATALOG.md'));
            const original = fs.fstatSync;
            let calls = 0;
            jest.spyOn(fs, 'fstatSync').mockImplementation(((...args: Parameters<typeof fs.fstatSync>) => {
                const stat = original(...args), mutated = Object.create(stat);
                calls++;
                if (calls === 1) {
                    if (scenario === 'identity') mutated.ino = BigInt(stat.ino) + 1n;
                    if (scenario === 'size') mutated.size = BigInt(stat.size) + 1n;
                    if (scenario === 'timestamp') mutated.mtimeNs = (stat as BigIntStats).mtimeNs + 1n;
                    if (scenario === 'file type') mutated.isFile = () => false;
                }
                if (calls === 2) {
                    if (scenario === 'changed size') mutated.size = BigInt(stat.size) + 1n;
                    if (scenario === 'changed timestamp') mutated.mtimeNs = (stat as BigIntStats).mtimeNs + 1n;
                    if (scenario === 'changed links') mutated.nlink = BigInt(stat.nlink) + 1n;
                }
                return mutated;
            }) as typeof fs.fstatSync);
            if (scenario === 'short read') jest.spyOn(fs, 'readSync').mockReturnValueOnce(0);
            const publish = jest.spyOn(publisher, 'publishCatalogMarkdown');
            expect(refreshBranchSyncSddCatalogDetailed(root)).toEqual({ valid: false,
                diagnostic: { phase: 'catalog-file-boundary', profile: 'unknown', field: 'catalog', capabilityNumber: 0 } });
            expect(publish).not.toHaveBeenCalled(); expect(readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(before);
        });
    it('keeps source preflight read-only and bounds UTF-8 bytes before parsing', () => {
        writeSdk(); const validate = jest.spyOn(validator, 'validateCatalog'), publish = jest.spyOn(publisher, 'publishCatalogMarkdown');
        expect(inspectBranchSyncSddCatalogProfile(root)).toMatchObject({ profile: 'sdk-v1', phase: 'profile-compatibility' });
        expect(inspectBranchSyncCatalogSource('é'.repeat(5 * 1024 * 1024 + 1))).toMatchObject({ phase: 'catalog-file-boundary' });
        expect(validate).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
        rmSync(join(root, 'specs/catalog.json'));
        expect(inspectBranchSyncSddCatalogProfile(root)).toMatchObject({ phase: 'catalog-file-boundary' });
        rmSync(join(root, 'specs'), { recursive: true }); writeFileSync(join(root, 'specs'), 'collision');
        expect(inspectBranchSyncSddCatalogProfile(root)).toMatchObject({ phase: 'workspace-boundary' });
    });
    it('retains descriptor identity checks on platforms without a no-follow open flag', () => {
        writeSdk();
        const fstat = jest.fn(fs.fstatSync);
        jest.doMock('node:fs', () => ({ ...fs, fstatSync: fstat, constants: { ...fs.constants, O_NOFOLLOW: undefined } }));
        try {
            jest.isolateModules(() => {
                const { inspectBranchSyncSddCatalogProfile: inspect } = require('../branch_sync_sdd_catalog');
                expect(inspect(root)).toMatchObject({ profile: 'sdk-v1', phase: 'profile-compatibility' });
                fstat.mockImplementationOnce(((...args: Parameters<typeof fs.fstatSync>) => {
                    const stat = fs.fstatSync(...args), changed = Object.create(stat);
                    changed.ino = BigInt(stat.ino) + 1n; return changed;
                }) as typeof fs.fstatSync);
                expect(inspect(root)).toMatchObject({ profile: 'unknown', phase: 'catalog-file-boundary' });
            });
        } finally { jest.dontMock('node:fs'); }
    });
    it.each(['oversized render', 'publisher failure'] as const)('retains metadata and index on %s', scenario => {
        writeSdk(); const metadata = readFileSync(join(root, 'specs/catalog.json')), before = readFileSync(join(root, 'specs/CATALOG.md'));
        if (scenario === 'oversized render') jest.spyOn(validator, 'renderCatalog').mockReturnValue('x'.repeat(10 * 1024 * 1024 + 1));
        else jest.spyOn(publisher, 'publishCatalogMarkdown').mockImplementation(() => { throw new Error('PRIVATE failure'); });
        expect(refreshBranchSyncSddCatalogDetailed(root)).toEqual({ valid: false,
            diagnostic: { phase: 'index-output', profile: 'sdk-v1', field: 'catalog', capabilityNumber: 0 } });
        expect(readFileSync(join(root, 'specs/catalog.json'))).toEqual(metadata); expect(readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(before);
    });

    it.each([['Proposed', null], ['As-built baseline', '2026-10-01']] as const)(
        'diagnoses the legacy %s profile before validation or output while retaining every byte', (status, date) => {
            const file = join(root, 'specs/catalog.json');
            writeFileSync(file, JSON.stringify({ version: 1, capabilities: [legacy(status, date)] }));
            const metadata = readFileSync(file), index = readFileSync(join(root, 'specs/CATALOG.md'));
            const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
            const validate = jest.spyOn(validator, 'validateCatalog'), render = jest.spyOn(validator, 'renderCatalog');
            const publish = jest.spyOn(publisher, 'publishCatalogMarkdown');
            expect(refreshBranchSyncSddCatalog(root)).toBe(false);
            expect(validate).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled(); expect(publish).not.toHaveBeenCalled();
            expect(readFileSync(file)).toEqual(metadata); expect(readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(index);
            const output = JSON.stringify(log.mock.calls);
            expect(output).toContain('profile=legacy-evidence');
            expect(output).toContain('capability=1'); expect(output).toContain('field=workflows');
            expect(output).not.toContain('PRIVATE'); expect(output).not.toContain(root); expect(output).not.toContain('private-owner');
        });

    it('identifies mixed legacy/SDK owners before any bundled validator or derived output', () => {
        writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify({ version: 1, capabilities: [sdk(), legacy()] }));
        const metadata = readFileSync(join(root, 'specs/catalog.json')), index = readFileSync(join(root, 'specs/CATALOG.md'));
        const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
        const validate = jest.spyOn(validator, 'validateCatalog'), render = jest.spyOn(validator, 'renderCatalog');
        expect(refreshBranchSyncSddCatalog(root)).toBe(false);
        expect(validate).not.toHaveBeenCalled(); expect(render).not.toHaveBeenCalled();
        expect(JSON.stringify(log.mock.calls)).toContain('profile=ambiguous');
        expect(readFileSync(join(root, 'specs/catalog.json'))).toEqual(metadata);
        expect(readFileSync(join(root, 'specs/CATALOG.md'))).toEqual(index);
    });
    it('diagnoses legacy metadata even if the generated index is absent', () => {
        writeFileSync(join(root, 'specs/catalog.json'), JSON.stringify({ version: 1, capabilities: [legacy()] }));
        rmSync(join(root, 'specs/CATALOG.md'));
        expect(refreshBranchSyncSddCatalogDetailed(root)).toEqual({ valid: false, diagnostic: {
            phase: 'profile-compatibility', profile: 'legacy-evidence', field: 'workflows', capabilityNumber: 1,
        } });
        expect(fs.existsSync(join(root, 'specs/CATALOG.md'))).toBe(false);
    });
});
