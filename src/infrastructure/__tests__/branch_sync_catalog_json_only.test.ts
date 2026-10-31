import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
const validator = require('../specification_catalog_validator.cjs');
const publisher = require('../specification_catalog_publication.cjs');
const sdk = () => ({ id: 'owned', title: 'Owned', status: 'proposed', scope: 'Owned scope', owner: 'Maintainers',
    lastVerified: '2026-10-29', specs: ['specs/owner.md'], workflows: [], entrypoints: [], code: [], tests: [],
    documentation: ['docs/guide.md'], evidence: ['base'] });
const legacy = () => ({ id: 'owned', title: 'Owned', status: 'Proposed', lastVerified: null,
    specs: ['specs/owner.md'], evidence: ['base'] });
const catalog = (capability: unknown) => ({ version: 1, capabilities: [capability] });

describe('JSON-only catalog merge authority', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'catalog-json-only-')); });
    afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });
    it.each(['legacy conflict', 'native conflict', 'mixed conflict', 'SDK conflict', 'invalid SDK resolution',
        'noncanonical protected index', 'clean legacy metadata', 'clean SDK metadata',
        'legacy metadata with another conflict', 'SDK metadata with another conflict',
        'binary mixed conflict', 'binary SDK conflict', 'clean noncanonical protected index'] as const)(
        '%s enforces compatibility without acquiring index write authority', async scenario => {
            const remote = join(root, 'remote.git'), workspace = join(root, 'workspace'), config = join(root, 'gitconfig');
            writeFileSync(config, '');
            const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
            const at = (cwd: string, args: readonly string[]) => execFileSync('git', [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
            at(root, ['init', '--bare', remote]); at(root, ['init', '--initial-branch=develop', workspace]);
            mkdirSync(join(workspace, 'specs')); mkdirSync(join(workspace, 'docs'));
            writeFileSync(join(workspace, 'specs/owner.md'), '# Owned\n'); writeFileSync(join(workspace, 'docs/guide.md'), '# Guide\n');
            const metadata = join(workspace, 'specs/catalog.json'), index = join(workspace, 'specs/CATALOG.md');
            const useLegacy = scenario.startsWith('legacy') || scenario === 'clean legacy metadata';
            const otherConflict = scenario.includes('another conflict');
            const binary = scenario.startsWith('binary');
            const invalidCleanIndex = scenario === 'clean noncanonical protected index';
            const base = catalog(useLegacy ? legacy() : sdk());
            const save = (value: unknown) => writeFileSync(metadata, JSON.stringify(value) + '\n');
            const commit = (name: string) => { at(workspace, ['add', '.']); at(workspace,
                ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', name]); };
            save(base); writeFileSync(index, validator.renderCatalog(catalog(sdk())));
            if (binary) writeFileSync(join(workspace, '.gitattributes'), 'specs/catalog.json -merge\n');
            writeFileSync(join(workspace, 'shared.txt'), 'base\n'); commit('base');
            at(workspace, ['branch', 'feature/42']);
            const parent = scenario === 'native conflict'
                ? { $schema: 'owned-native', capabilities: [{ specification: 'specs/owner.md', evidence: ['parent'] }] }
                : catalog({ ...(useLegacy || scenario.includes('mixed conflict') ? legacy() : sdk()),
                    ...(invalidCleanIndex ? { scope: 'Changed rendered scope' } : {}), evidence: ['parent'] });
            save(parent); if (otherConflict) writeFileSync(join(workspace, 'shared.txt'), 'parent\n');
            commit('parent'); at(workspace, ['checkout', 'feature/42']);
            const clean = scenario.startsWith('clean');
            if (clean || otherConflict) writeFileSync(join(workspace, 'child.txt'), 'child\n');
            else save(catalog({ ...(useLegacy ? legacy() : sdk()), evidence: ['child'] }));
            if (otherConflict) writeFileSync(join(workspace, 'shared.txt'), 'child\n');
            commit('child'); at(workspace, ['remote', 'add', 'origin', remote]); at(workspace, ['push', 'origin', 'develop', 'feature/42']);
            const originalHead = at(workspace, ['rev-parse', 'HEAD']).toString().trim(), originalRefs = at(workspace, ['ls-remote', 'origin']);
            const originalMetadata = readFileSync(metadata), originalIndex = readFileSync(index), originalInode = lstatSync(index).ino;
            const git = {
                execute: jest.fn(async (program: string, args: readonly string[], options?: { stdout?: (value: Buffer) => void }) => {
                    const output = execFileSync(program, [...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] }); options?.stdout?.(output); return 0;
                }),
                fetch: jest.fn(async (branch: string) => { at(workspace, ['fetch', 'origin', branch]); }),
                stagePaths: jest.fn(async (paths: readonly string[]) => { at(workspace, ['add', '--', ...paths]); }),
                stageAll: jest.fn(), configureAuthor: jest.fn(), commit: jest.fn(), push: jest.fn(),
            } as unknown as jest.Mocked<GitCommitPort>;
            const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
            const publish = jest.spyOn(publisher, 'publishCatalogMarkdown'), validate = jest.spyOn(validator, 'validateCatalog');
            try {
                if (useLegacy || scenario.includes('mixed conflict') || scenario === 'native conflict' || invalidCleanIndex) {
                    await expect(adapter.prepare('develop', 'feature/42', 'fixture')).rejects.toMatchObject({
                        name: 'BranchSyncCatalogFailure', diagnostic: { profile: invalidCleanIndex ? 'sdk-v1' : scenario === 'native conflict' ? 'native' : 'legacy-evidence' },
                    });
                    if (invalidCleanIndex) expect(validate).toHaveBeenCalled();
                    else expect(validate).not.toHaveBeenCalled();
                    expect(git.stagePaths).not.toHaveBeenCalled();
                } else {
                    const preparation = await adapter.prepare('develop', 'feature/42', 'fixture');
                    expect(preparation.kind).toBe(clean ? 'clean' : 'conflicted');
                    if (clean) {
                        expect(await adapter.validatePreparedMerge([])).toEqual({ valid: true });
                        expect(validate).toHaveBeenCalled(); expect(git.stagePaths).not.toHaveBeenCalled();
                    } else if (otherConflict) {
                        expect(preparation).toMatchObject({ conflictPaths: ['shared.txt'] });
                        writeFileSync(join(workspace, 'shared.txt'), 'resolved\n');
                        expect(await adapter.validatePreparedMerge(['shared.txt'])).toEqual({ valid: true });
                        expect(validate).toHaveBeenCalled(); expect(git.stagePaths).toHaveBeenCalledWith(['shared.txt']);
                    }
                    else {
                        expect(preparation).toMatchObject({ conflictPaths: ['specs/catalog.json'] });
                        const resolved = { ...sdk(), evidence: ['preserved parent and child history'] };
                        if (scenario === 'invalid SDK resolution') resolved.status = 'INVALID';
                        if (scenario === 'noncanonical protected index') resolved.scope = 'Changed rendered scope';
                        save(catalog(resolved));
                        const result = await adapter.validatePreparedMerge(['specs/catalog.json']);
                        if (scenario === 'invalid SDK resolution' || scenario === 'noncanonical protected index') {
                            expect(result).toMatchObject({ valid: false, code: 'sdd-catalog-invalid', catalogDiagnostic: {
                                phase: scenario === 'invalid SDK resolution' ? 'catalog-contract' : 'index-output', profile: 'sdk-v1',
                            } });
                            expect(git.stagePaths).not.toHaveBeenCalled();
                        } else {
                            expect(result).toEqual({ valid: true });
                            expect(git.stagePaths).toHaveBeenCalledWith(['specs/catalog.json']);
                            expect(validate).toHaveBeenCalled();
                        }
                    }
                }
                expect(publish).not.toHaveBeenCalled(); expect(readFileSync(index)).toEqual(originalIndex);
                expect(lstatSync(index).ino).toBe(originalInode); expect(git.push).not.toHaveBeenCalled();
            } finally {
                await adapter.abort();
                expect(at(workspace, ['rev-parse', 'HEAD']).toString().trim()).toBe(originalHead);
                expect(at(workspace, ['status', '--porcelain']).toString()).toBe('');
                expect(readFileSync(metadata)).toEqual(originalMetadata); expect(readFileSync(index)).toEqual(originalIndex);
                expect(at(workspace, ['ls-remote', 'origin'])).toEqual(originalRefs);
            }
        });
});
