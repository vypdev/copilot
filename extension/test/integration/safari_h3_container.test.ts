import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { buildSafariContainer, type ContainerCommand } from '../../tooling/safari_container.mts';
import { safariH3Build } from '../fixtures/safari_h3_build.ts';

let root: string;
beforeAll(async () => { root = await mkdtemp(path.join(tmpdir(), 'copilot-safari-h3-build-')); await buildDevelopmentSet(fileURLToPath(new URL('../../../', import.meta.url)), path.join(root, 'extension/dist')); });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
async function fixture(format: 'jsonc' | 'pbx' = 'jsonc') {
    await rm(path.join(root, '.tmp/safari-h3'), { recursive: true, force: true }); return safariH3Build(root, format);
}
it('dedicated H3 JSONC build plan uses its own identifiers/resources/app path and leaves the H2 rollback untouched', async () => {
    const h = await fixture(); const rollback = path.join(root, '.tmp/safari-h2/derived/Build/Products/Debug/CopilotH2.app/rollback');
    await mkdir(path.dirname(rollback), { recursive: true }); await writeFile(rollback, 'registered-h2-unchanged');
    expect(await buildSafariContainer(root, h.execute, 'h3')).toBe(h.app);
    expect(await readFile(rollback, 'utf8')).toBe('registered-h2-unchanged');
    const receipt = JSON.parse(await readFile(path.join(h.workspace, 'container.json'), 'utf8'));
    expect(receipt).toMatchObject({ appId: 'invalid.extensions.copilot.h3', extensionId: 'invalid.extensions.copilot.h3.Extension', profile: 'h3', projectFormat: 'jsonc', distribution: false });
    expect(await h.attempt()).toMatchObject({ state: 'verified', phase: 'complete', profile: 'h3', projectFormat: 'jsonc' });
    expect(vi.mocked(h.execute).mock.calls.filter(([file]) => file.endsWith('xcodebuild'))[0][1]).toEqual(expect.arrayContaining(['CODE_SIGN_IDENTITY=-', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=']));
});
it('dedicated H3 also supports the legacy project while retaining native verification after normalization', async () => {
    const h = await fixture('pbx'); expect(await buildSafariContainer(root, h.execute, 'h3')).toBe(h.app);
    expect(await h.attempt()).toMatchObject({ state: 'verified', projectFormat: 'pbx' });
});
it('unknown container profile cannot create a new workspace or invoke native tools', async () => {
    const run = vi.fn(); await expect(buildSafariContainer(root, run, 'custom' as never)).rejects.toThrow('container-profile'); expect(run).not.toHaveBeenCalled();
});
it('H3 refuses a workspace symlink into H2 instead of overwriting its attempt or generated project', async () => {
    const h = await fixture(); const h2 = path.join(root, '.tmp/safari-h2'); const marker = path.join(h2, 'attempt.json'); await writeFile(marker, 'h2-preserved');
    await symlink(h2, h.workspace, 'dir'); const run = vi.fn();
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow('workspace-not-regular'); expect(run).not.toHaveBeenCalled(); expect(await readFile(marker, 'utf8')).toBe('h2-preserved');
});
it('a conversion failure records the current failed phase without replacing or promoting an earlier verified container receipt', async () => {
    const h = await fixture(); await mkdir(h.workspace, { recursive: true }); const file = path.join(h.workspace, 'container.json'); await writeFile(file, 'prior-source-receipt');
    const run: ContainerCommand = async () => { throw new Error('conversion failed'); };
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow('conversion failed'); expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'conversion' });
    expect(await readFile(file, 'utf8')).toBe('prior-source-receipt'); expect(await readFile(path.join(h.workspace, 'build.log'), 'utf8')).toContain('conversion');
});
it('malformed modern project fails before Xcode and leaves an explicit normalization failure', async () => {
    const h = await fixture(); const run: ContainerCommand = vi.fn(async (file, args) => {
        const value = await h.execute(file, args); if (file.endsWith('xcrun')) await writeFile(path.join(h.project, 'project.xcproj'), '{broken'); return value;
    });
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow('project-json');
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'project-normalization' });
    expect(vi.mocked(run).mock.calls.some(([file]) => file.endsWith('xcodebuild'))).toBe(false);
});
it('stale artifact preflight records failure before conversion instead of reusing a previous source build', async () => {
    const h = await fixture(); const asset = path.join(root, 'extension/dist/safari/content.js'); const original = await readFile(asset);
    try {
        await writeFile(asset, 'stale'); await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow();
        expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'artifact-validation', sourceTreeSha256: null }); expect(h.execute).not.toHaveBeenCalled();
    } finally { await writeFile(asset, original); }
});
it.each(['registration', 'verification'] as const)('H3 %s failure cannot leave a successful current attempt', async phase => {
    const h = await fixture(); const run: ContainerCommand = async (file, args) => {
        if (phase === 'registration' && file.endsWith('/open') || phase === 'verification' && file.endsWith('/codesign')) throw new Error('native phase failed');
        return h.execute(file, args);
    };
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow('native phase failed'); expect(await h.attempt()).toMatchObject({ state: 'failed', phase });
    expect(await readFile(path.join(h.workspace, 'build.log'), 'utf8')).toContain(phase);
});
it('H3 compilation failure keeps bounded native diagnostics and marks the attempt independently from old receipts', async () => {
    const h = await fixture(); const failure = Object.assign(new Error('compile failed'), { stdout: 'native output', stderr: 'x'.repeat(4 * 1024 * 1024 + 1) });
    const run: ContainerCommand = async (file, args) => { if (file.endsWith('xcodebuild')) throw failure; return h.execute(file, args); };
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toBe(failure);
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'compilation', projectFormat: 'jsonc' });
    expect((await readFile(path.join(h.workspace, 'build.log'), 'utf8')).length).toBe(4 * 1024 * 1024);
});
it('native diagnostic byte limits preserve complete UTF-8 characters at the truncation boundary', async () => {
    const h = await fixture(); const failure = { stdout: 'a', stderr: '中'.repeat(2 * 1024 * 1024) };
    const run: ContainerCommand = async (file, args) => { if (file.endsWith('xcodebuild')) throw failure; return h.execute(file, args); };
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toBe(failure);
    const log = await readFile(path.join(h.workspace, 'build.log')); expect(log.byteLength).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(new TextDecoder('utf8', { fatal: true }).decode(log)).not.toContain('\uFFFD');
});
