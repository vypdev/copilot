import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { GitCommitPort } from '../../application/ports/git_ports';
import { canCreateFileSymlink } from '../../testing/file_symlink_capability';
import { refreshBranchSyncSddCatalog, SDD_CATALOG_INDEX_PATH, SDD_CATALOG_PATH } from '../branch_sync_sdd_catalog';
import { BranchSyncWorkspaceAdapter } from '../branch_sync_workspace_adapter';
import * as logging from '../../application/ports/logging_ports';

const { renderCatalog } = require('../specification_catalog_validator.cjs') as { renderCatalog(catalog: unknown): string };

function fixture(root: string) {
    for (const directory of ['specs', 'src/__tests__', 'docs']) mkdirSync(join(root, directory), { recursive: true });
    const capability = {
        id: 'fixture', title: 'Fixture', status: 'implemented', scope: 'Test merge', owner: 'Maintainer', lastVerified: '2026-10-11',
        specs: ['specs/fixture.md'], workflows: [], entrypoints: ['src/index.ts'], code: ['src/index.ts'],
        tests: ['src/__tests__/index.test.ts'], documentation: ['docs/fixture.mdx'],
    };
    for (const path of [...capability.specs, ...capability.code, ...capability.tests, ...capability.documentation]) writeFileSync(join(root, path), '# Fixture\n');
    const catalog = { version: 1, capabilities: [capability] };
    writeFileSync(join(root, SDD_CATALOG_PATH), JSON.stringify(catalog, null, 2) + '\n');
    writeFileSync(join(root, SDD_CATALOG_INDEX_PATH), renderCatalog(catalog));
    return catalog;
}

describe('branch synchronization generated SDD catalog', () => {
    let root: string;
    beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-sync-catalog-')); });
    afterEach(() => { rmSync(root, { recursive: true, force: true }); });

    it.each(['metadata-conflict-markers', 'metadata-json', 'metadata-shape', 'evidence-path-boundary', 'catalog-contract'] as const)(
        'reports only the closed %s phase, preserving the index and hiding untrusted values', phase => {
            const catalog = fixture(root);
            const secret = 'private-provider-value-do-not-publish';
            const metadataPath = join(root, SDD_CATALOG_PATH);
            const before = readFileSync(join(root, SDD_CATALOG_INDEX_PATH));
            const report = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
            try {
                if (phase === 'metadata-conflict-markers') {
                    writeFileSync(metadataPath, `<<<<<<< HEAD\n${secret}\n=======\nparent\n>>>>>>> parent\n`);
                } else if (phase === 'metadata-json') {
                    writeFileSync(metadataPath, `{ invalid ${secret}`);
                } else if (phase === 'metadata-shape') {
                    writeFileSync(metadataPath, JSON.stringify({ capabilities: secret }));
                } else {
                    if (phase === 'evidence-path-boundary') catalog.capabilities[0].code = [`src/${secret}.ts`];
                    else { catalog.version = 2; catalog.capabilities[0].title = secret; }
                    writeFileSync(metadataPath, JSON.stringify(catalog));
                }
                expect(refreshBranchSyncSddCatalog(root)).toBe(false);
                expect(readFileSync(join(root, SDD_CATALOG_INDEX_PATH))).toEqual(before);
                expect(report.mock.calls).toEqual([[`Branch synchronization SDD catalog rejected (${phase}).`]]);
                expect(JSON.stringify(report.mock.calls)).not.toContain(secret);
                expect(JSON.stringify(report.mock.calls)).not.toContain(root);
            } finally { report.mockRestore(); }
        },
    );

    it('replaces stale counts and conflict markers using validated metadata without changing that metadata', () => {
        const catalog = fixture(root);
        const metadata = readFileSync(join(root, SDD_CATALOG_PATH), 'utf8');
        writeFileSync(join(root, SDD_CATALOG_INDEX_PATH), '<<<<<<< HEAD\nincorrect counts\n=======\nparent\n>>>>>>> parent\n');
        expect(refreshBranchSyncSddCatalog(root)).toBe(true);
        expect(readFileSync(join(root, SDD_CATALOG_INDEX_PATH), 'utf8')).toBe(renderCatalog(catalog));
        expect(readFileSync(join(root, SDD_CATALOG_PATH), 'utf8')).toBe(metadata);
        expect(readFileSync(join(root, 'src/index.ts'), 'utf8')).toBe('# Fixture\n');
    });

    it('handles CRLF indexes using the canonical checkout policy', () => {
        const catalog = fixture(root);
        const expected = renderCatalog(catalog).replace(/\n/g, '\r\n');
        writeFileSync(join(root, SDD_CATALOG_INDEX_PATH), expected);
        expect(refreshBranchSyncSddCatalog(root)).toBe(true);
        expect(readFileSync(join(root, SDD_CATALOG_INDEX_PATH), 'utf8')).toBe(process.platform === 'win32' ? expected : renderCatalog(catalog));
    });

    it.each(['invalid JSON', 'invalid version', 'missing metadata', 'missing index', 'oversized metadata', 'oversized index', 'missing evidence', 'unregistered specification', 'outside evidence'])('fails closed for %s', scenario => {
        const catalog = fixture(root);
        const metadataPath = join(root, SDD_CATALOG_PATH);
        const indexPath = join(root, SDD_CATALOG_INDEX_PATH);
        if (scenario === 'invalid JSON') writeFileSync(metadataPath, '{ conflict');
        if (scenario === 'invalid version') { catalog.version = 2; writeFileSync(metadataPath, JSON.stringify(catalog)); }
        if (scenario === 'missing metadata') rmSync(metadataPath);
        if (scenario === 'missing index') rmSync(indexPath);
        if (scenario === 'oversized metadata') truncateSync(metadataPath, 10 * 1024 * 1024 + 1);
        if (scenario === 'oversized index') truncateSync(indexPath, 10 * 1024 * 1024 + 1);
        if (scenario === 'missing evidence') rmSync(join(root, 'src/index.ts'));
        if (scenario === 'unregistered specification') writeFileSync(join(root, 'specs/unregistered.md'), '# Unregistered\n');
        if (scenario === 'outside evidence') {
            catalog.capabilities[0].code = ['../outside.ts'];
            writeFileSync(metadataPath, JSON.stringify(catalog));
        }
        const before = scenario === 'missing index' ? undefined : readFileSync(indexPath);
        expect(refreshBranchSyncSddCatalog(root)).toBe(false);
        if (before) expect(readFileSync(indexPath)).toEqual(before);
        else expect(() => readFileSync(indexPath)).toThrow();
    });

    const symlinkTest = canCreateFileSymlink() ? it.each : it.skip.each;
    symlinkTest(['index', 'evidence'])('rejects an external %s symlink without changing the target', scenario => {
        fixture(root);
        const outside = mkdtempSync(join(tmpdir(), 'copilot-sync-external-'));
        const target = join(outside, 'target');
        writeFileSync(target, 'external content\n');
        try {
            const path = join(root, scenario === 'index' ? SDD_CATALOG_INDEX_PATH : 'src/index.ts');
            rmSync(path); symlinkSync(target, path, 'file');
            expect(refreshBranchSyncSddCatalog(root)).toBe(false);
            expect(readFileSync(target, 'utf8')).toBe('external content\n');
        } finally { rmSync(outside, { recursive: true, force: true }); }
    });

    it.each(['preserves union', 'invalid resolution', 'verification mutation', 'clean stale index', 'clean invalid metadata'])('handles a real catalog merge: %s', async scenario => {
        const remote = join(root, 'remote.git');
        const workspace = join(root, 'workspace');
        const globalConfig = join(root, 'empty-gitconfig');
        writeFileSync(globalConfig, '');
        const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1' };
        const gitAt = (cwd: string, args: readonly string[]) => execFileSync('git', [...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
        gitAt(root, ['init', '--bare', remote]);
        gitAt(root, ['init', '--initial-branch=develop', workspace]);
        const catalog = fixture(workspace);
        const commit = (message: string) => {
            gitAt(workspace, ['add', '.']);
            gitAt(workspace, ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', 'commit', '-m', message]);
        };
        commit('base');
        gitAt(workspace, ['branch', 'feature/42']);
        const parent = JSON.parse(JSON.stringify(catalog)) as typeof catalog;
        parent.capabilities[0].scope = 'Parent evidence';
        parent.capabilities[0].code.push('src/parent.ts');
        writeFileSync(join(workspace, 'src/parent.ts'), 'parent\n');
        const clean = scenario.startsWith('clean');
        writeFileSync(join(workspace, SDD_CATALOG_PATH), scenario === 'clean invalid metadata' ? '{ invalid' : JSON.stringify(parent, null, 2) + '\n');
        writeFileSync(join(workspace, SDD_CATALOG_INDEX_PATH), clean ? 'stale generated index\n' : renderCatalog(parent));
        commit('parent');
        gitAt(workspace, ['checkout', 'feature/42']);
        const child = JSON.parse(JSON.stringify(catalog)) as typeof catalog;
        child.capabilities[0].scope = 'Child evidence';
        child.capabilities[0].documentation.push('docs/child.mdx');
        writeFileSync(join(workspace, 'docs/child.mdx'), 'child\n');
        if (!clean) {
            writeFileSync(join(workspace, SDD_CATALOG_PATH), JSON.stringify(child, null, 2) + '\n');
            writeFileSync(join(workspace, SDD_CATALOG_INDEX_PATH), renderCatalog(child));
        }
        commit('child');
        gitAt(workspace, ['remote', 'add', 'origin', remote]);
        gitAt(workspace, ['push', 'origin', 'develop', 'feature/42']);
        const git = {
            execute: jest.fn(async (program: string, args: readonly string[], options?: { stdout?: (buffer: Buffer) => void }) => {
                const output = execFileSync(program, [...args], { cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'] });
                options?.stdout?.(output); return 0;
            }),
            fetch: jest.fn(async (branch: string) => { gitAt(workspace, ['fetch', 'origin', branch]); }),
            stagePaths: jest.fn(async (paths: readonly string[]) => { gitAt(workspace, ['add', '--', ...paths]); }),
            stageAll: jest.fn(), commit: jest.fn(), push: jest.fn(), configureAuthor: jest.fn(),
        } as unknown as jest.Mocked<GitCommitPort>;
        const adapter = new BranchSyncWorkspaceAdapter(git, workspace);
        const conflicts = [SDD_CATALOG_INDEX_PATH, SDD_CATALOG_PATH];
        if (clean) {
            if (scenario === 'clean invalid metadata') {
                await expect(adapter.prepare('develop', 'feature/42', 'fixture')).rejects.toThrow('The merged SDD catalog is invalid.');
                expect(git.stagePaths).not.toHaveBeenCalled();
            } else {
                await expect(adapter.prepare('develop', 'feature/42', 'fixture')).resolves.toMatchObject({ kind: 'clean' });
                expect(readFileSync(join(workspace, SDD_CATALOG_INDEX_PATH), 'utf8')).toBe(renderCatalog(parent));
                await expect(adapter.validatePreparedMerge([])).resolves.toEqual({ valid: true });
                expect(git.stagePaths).toHaveBeenCalledWith([SDD_CATALOG_INDEX_PATH]);
            }
            expect(git.push).not.toHaveBeenCalled();
            await adapter.abort();
            expect(gitAt(workspace, ['status', '--porcelain']).toString()).toBe('');
            return;
        }
        await expect(adapter.prepare('develop', 'feature/42', 'fixture')).resolves.toMatchObject({ kind: 'conflicted', conflictPaths: conflicts });
        const resolved = JSON.parse(JSON.stringify(parent)) as typeof catalog;
        resolved.capabilities[0].scope = 'Parent and child evidence';
        resolved.capabilities[0].documentation = child.capabilities[0].documentation;
        writeFileSync(join(workspace, SDD_CATALOG_PATH), scenario === 'invalid resolution' ? '{ unresolved' : JSON.stringify(resolved, null, 2) + '\n');
        const validation = await adapter.validatePreparedMerge(conflicts);
        if (scenario === 'invalid resolution') {
            expect(validation).toEqual({ valid: false, code: 'sdd-catalog-invalid', reason: 'The resolved SDD catalog is invalid.' });
            expect(git.stagePaths).not.toHaveBeenCalled();
        } else {
            expect(validation).toEqual({ valid: true });
            expect(readFileSync(join(workspace, SDD_CATALOG_INDEX_PATH), 'utf8')).toBe(renderCatalog(resolved));
            expect(git.stagePaths).toHaveBeenCalledTimes(1);
            expect(git.stagePaths).toHaveBeenCalledWith(conflicts);
            expect(readFileSync(join(workspace, 'src/parent.ts'), 'utf8')).toBe('parent\n');
            expect(readFileSync(join(workspace, 'docs/child.mdx'), 'utf8')).toBe('child\n');
            if (scenario === 'verification mutation') {
                writeFileSync(join(workspace, SDD_CATALOG_INDEX_PATH), 'changed by verification\n');
                await expect(adapter.validatePreparedMerge(conflicts)).resolves.toEqual({ valid: false, code: 'unstaged-changes', reason: 'The prepared merge contains unstaged changes.' });
                expect(git.stagePaths).toHaveBeenCalledTimes(1);
                gitAt(workspace, ['checkout', '--', SDD_CATALOG_INDEX_PATH]);
            } else await expect(adapter.validatePreparedMerge(conflicts)).resolves.toEqual({ valid: true });
        }
        expect(git.stageAll).not.toHaveBeenCalled();
        expect(git.push).not.toHaveBeenCalled();
        await adapter.abort();
        expect(gitAt(workspace, ['status', '--porcelain']).toString()).toBe('');
    });
});
