import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { BranchSyncCatalogFailure } from '../../domain/branch_sync_catalog_diagnostic';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
import * as logging from '../../application/ports/logging_ports';

const validator = require('../specification_catalog_validator.cjs') as { renderCatalog(value: unknown): string };
const sdk = () => ({ id: 'owned', title: 'Owned capability', status: 'proposed', scope: 'Original scope', owner: 'Maintainers',
    lastVerified: '2026-10-29', specs: ['specs/owner.md'], workflows: [], entrypoints: [], code: [], tests: [], documentation: ['docs/guide.md'] });
const legacy = () => ({ id: 'owned', title: 'Owned capability', status: 'Proposed', scope: 'Original scope', owner: 'Maintainers',
    lastVerified: null, specs: ['specs/owner.md'], evidence: ['src/'], openDecisions: ['Retain history'] });
const catalog = (capability: unknown) => ({ version: 1, capabilities: [capability] });

describe('catalog compatibility in real owned Git merges', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'catalog-profile-git-')); });
    afterEach(() => { jest.restoreAllMocks(); rmSync(root, { recursive: true, force: true }); });

    it.each([
        ['clean legacy', 'legacy-evidence', false], ['clean native', 'native', false],
        ['clean ambiguous', 'ambiguous', false], ['clean unknown', 'unknown', false],
        ['clean malformed SDK', 'sdk-v1', false], ['conflicted legacy', 'legacy-evidence', true],
        ['conflicted mixed originals', 'legacy-evidence', true], ['conflicted native', 'native', true],
        ['conflicted SDK', 'allowed', true], ['clean reviewed migration', 'allowed', false],
        ['unrelated legacy merge', 'unrelated', false],
        ['conflicted readable SDK', 'allowed', true], ['conflicted readable legacy', 'legacy-evidence', true],
        ['conflicted committed markers', 'unknown', true],
    ] as const)('%s preserves original heads and evidence until a verified publication', async (scenario, profile, conflicted) => {
        const remote = join(root, 'remote.git'), workspace = join(root, 'workspace'), config = join(root, 'gitconfig');
        writeFileSync(config, '');
        const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
        const gitAt = (cwd: string, args: readonly string[]) => execFileSync('git', [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        gitAt(root, ['init', '--bare', remote]); gitAt(root, ['init', '--initial-branch=develop', workspace]);
        mkdirSync(join(workspace, 'specs')); mkdirSync(join(workspace, 'docs'));
        writeFileSync(join(workspace, 'specs/owner.md'), '# Owned specification\n');
        writeFileSync(join(workspace, 'docs/guide.md'), '# Owned guide\n');
        const metadataPath = join(workspace, 'specs/catalog.json'), indexPath = join(workspace, 'specs/CATALOG.md');
        const baseSdk = ['conflicted SDK', 'conflicted mixed originals', 'conflicted native'].includes(scenario);
        const base = baseSdk ? catalog(sdk()) : catalog(legacy());
        const write = (value: unknown, index: string) => { writeFileSync(metadataPath, JSON.stringify(value, null, 2) + '\n'); writeFileSync(indexPath, index); };
        const commit = (message: string) => { gitAt(workspace, ['add', '.']); gitAt(workspace,
            ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message]); };
        write(base, '# Base index\n'); commit('base'); gitAt(workspace, ['branch', 'feature/42']);
        let parent: unknown = catalog({ ...legacy(), scope: 'Parent scope' });
        if (profile === 'native') parent = { ...catalog({ specification: 'specs/owner.md', scope: 'Parent scope' }), $schema: 'repository-native' };
        if (profile === 'ambiguous') parent = catalog({ ...legacy(), workflows: [] });
        if (profile === 'unknown') parent = { version: 1, capabilities: [] };
        if (profile === 'sdk-v1') parent = catalog({ ...sdk(), tests: null });
        if (profile === 'allowed') parent = catalog({ ...sdk(), scope: 'Parent scope', evidence: legacy().evidence });
        if (profile !== 'unrelated') write(parent, '# Parent index\n');
        else writeFileSync(join(workspace, 'parent.txt'), 'parent\n');
        if (scenario === 'conflicted committed markers') writeFileSync(metadataPath, '<<<<<<< HEAD\noriginal\n=======\nparent\n>>>>>>> parent\n');
        commit('parent'); gitAt(workspace, ['checkout', 'feature/42']);
        const readable = scenario.includes('readable') || scenario === 'conflicted committed markers';
        if (conflicted && readable) writeFileSync(indexPath, '# Child index\n');
        else if (conflicted) write(baseSdk ? catalog({ ...sdk(), scope: 'Child scope' }) : catalog({ ...legacy(), scope: 'Child scope' }), '# Child index\n');
        else writeFileSync(join(workspace, 'child.txt'), 'child\n');
        commit('child'); gitAt(workspace, ['remote', 'add', 'origin', remote]); gitAt(workspace, ['push', 'origin', 'develop', 'feature/42']);
        const originalHead = gitAt(workspace, ['rev-parse', 'HEAD']).toString().trim();
        const originalMetadata = readFileSync(metadataPath), originalIndex = readFileSync(indexPath);
        const originalRefs = gitAt(workspace, ['ls-remote', 'origin']).toString();
        const git = {
            execute: jest.fn(async (program: string, args: readonly string[], options?: { stdout?: (value: Buffer) => void }) => {
                const output = execFileSync(program, [...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
                options?.stdout?.(output); return 0;
            }),
            fetch: jest.fn(async (branch: string) => { gitAt(workspace, ['fetch', 'origin', branch]); }),
            stagePaths: jest.fn(async (paths: readonly string[]) => { gitAt(workspace, ['add', '--', ...paths]); }),
            stageAll: jest.fn(), configureAuthor: jest.fn(), commit: jest.fn(), push: jest.fn(),
        } as unknown as jest.Mocked<GitCommitPort>;
        const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
        const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
        if (profile === 'allowed' || profile === 'unrelated') {
            const preparation = await adapter.prepare('develop', 'feature/42', 'fixture');
            expect(preparation.kind).toBe(conflicted ? 'conflicted' : 'clean');
            if (conflicted) {
                const paths = preparation.kind === 'conflicted' ? preparation.conflictPaths : [];
                expect(paths).toEqual(readable ? ['specs/CATALOG.md'] : ['specs/CATALOG.md', 'specs/catalog.json']);
                writeFileSync(metadataPath, JSON.stringify(parent, null, 2) + '\n');
                expect(await adapter.validatePreparedMerge(paths)).toEqual({ valid: true });
            } else expect(await adapter.validatePreparedMerge([])).toEqual({ valid: true });
            if (profile === 'allowed') {
                expect(readFileSync(indexPath, 'utf8')).toBe(validator.renderCatalog(parent));
                expect(JSON.parse(readFileSync(metadataPath, 'utf8'))).toEqual(parent);
                expect(JSON.parse(readFileSync(metadataPath, 'utf8')).capabilities[0].evidence).toEqual(['src/']);
            } else expect(readFileSync(metadataPath)).toEqual(originalMetadata);
        } else {
            let failure: unknown;
            try { await adapter.prepare('develop', 'feature/42', 'fixture'); } catch (error) { failure = error; }
            expect(failure).toBeInstanceOf(BranchSyncCatalogFailure);
            expect((failure as BranchSyncCatalogFailure).diagnostic.profile).toBe(profile);
            // Assert the diagnosis already exists while the real merge is still
            // prepared; abort below must not be its first reporting producer.
            expect(log.mock.calls.some(([message]) => String(message).includes('profile=' + profile)
                || String(message).includes('"profile":"' + profile))).toBe(true);
            expect(git.stagePaths).not.toHaveBeenCalled();
        }
        expect(git.stageAll).not.toHaveBeenCalled(); expect(git.commit).not.toHaveBeenCalled(); expect(git.push).not.toHaveBeenCalled();
        await adapter.abort();
        expect(gitAt(workspace, ['rev-parse', 'HEAD']).toString().trim()).toBe(originalHead);
        expect(gitAt(workspace, ['status', '--porcelain']).toString()).toBe('');
        expect(readFileSync(metadataPath)).toEqual(originalMetadata); expect(readFileSync(indexPath)).toEqual(originalIndex);
        expect(gitAt(workspace, ['ls-remote', 'origin']).toString()).toBe(originalRefs);
    });
});
