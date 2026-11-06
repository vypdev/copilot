import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir, symlink, lstat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { buildSafariContainer, type ContainerCommand } from '../../tooling/safari_container.mts';
import { safariH3Build } from '../fixtures/safari_h3_build.ts';

const fault = vi.hoisted(() => ({ remove: (_file: string): boolean => false, rename: (_from: string, _to: string): boolean => false }));
vi.mock('node:fs/promises', async load => {
    const actual = await load<typeof import('node:fs/promises')>();
    return { ...actual,
        rm: vi.fn(async (...args: Parameters<typeof actual.rm>) => {
            if (fault.remove(String(args[0]))) throw new Error('synthetic-cleanup-denied'); return actual.rm(...args);
        }),
        rename: vi.fn(async (from: string, to: string) => {
            if (fault.rename(from, to)) throw new Error('synthetic-publication-denied'); return actual.rename(from, to);
        }),
    };
});
let root: string;
beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'copilot-safari-staging-'));
    await buildDevelopmentSet(fileURLToPath(new URL('../../../', import.meta.url)), path.join(root, 'extension/dist'));
}, 60000);
beforeEach(async () => { await rm(path.join(root, '.tmp/safari-h3'), { recursive: true, force: true }); });
afterEach(() => { fault.remove = () => false; fault.rename = () => false; });
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
async function previous() {
    const h = safariH3Build(root); await mkdir(h.app, { recursive: true }); await writeFile(path.join(h.app, 'previous-source'), 'retained');
    await writeFile(path.join(h.workspace, 'container.json'), 'historical-verified-receipt'); return h;
}
const retained = async (h: ReturnType<typeof safariH3Build>) => {
    expect(await readFile(path.join(h.app, 'previous-source'), 'utf8')).toBe('retained');
    expect(await readFile(path.join(h.workspace, 'container.json'), 'utf8')).toBe('historical-verified-receipt');
};
const opened = (run: ContainerCommand) => vi.mocked(run).mock.calls.some(([file]) => file.endsWith('/open'));

it('two builds use different fresh project/output trees and the second removes old executable resources through complete app replacement', async () => {
    const h = await previous(); await buildSafariContainer(root, h.execute, 'h3');
    const resources = path.join(h.app, 'Contents/PlugIns/CopilotH3 Extension.appex/Contents/Resources');
    await writeFile(path.join(resources, 'center-Old-0000000000000000.js'), 'export {};');
    await buildSafariContainer(root, h.execute, 'h3');
    expect((await readdir(resources)).sort()).toEqual((await readdir(path.join(root, 'extension/dist/safari'))).sort());
    const locations = vi.mocked(h.execute).mock.calls.filter(([file]) => file.endsWith('xcrun')).map(([,args]) => args[args.indexOf('--project-location') + 1]);
    expect(new Set(locations).size).toBe(2); expect(locations.every(value => value.startsWith(path.join(h.workspace, 'candidate-')))).toBe(true);
    expect((await readdir(h.workspace)).some(name => name.startsWith('candidate-'))).toBe(false);
    expect(await h.attempt()).toMatchObject({ state: 'verified', appReplaced: true, cleanup: 'complete' });
});
it('a changed candidate resource fails before publication and leaves the complete previous app and receipt intact', async () => {
    const h = await previous(); const run: ContainerCommand = vi.fn(async (file, args) => {
        const value = await h.execute(file, args);
        if (file.endsWith('xcodebuild') && args.includes('build')) await writeFile(path.join(args[args.indexOf('-derivedDataPath') + 1], 'Build/Products/Debug/CopilotH3.app/Contents/PlugIns/CopilotH3 Extension.appex/Contents/Resources/content.js'), 'changed');
        return value;
    });
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow('resources-stale'); await retained(h); expect(opened(run)).toBe(false);
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'candidate-verification', appReplaced: false, cleanup: 'complete' });
});
it.each(['identity', 'signature'] as const)('a candidate %s failure cannot replace or open the previous app', async boundary => {
    const h = await previous(); const run: ContainerCommand = vi.fn(async (file, args) => {
        if (boundary === 'identity' && file.endsWith('PlistBuddy')) return 'foreign';
        if (boundary === 'signature' && file.endsWith('codesign')) throw new Error('candidate-signature-failed'); return h.execute(file, args);
    });
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toThrow(boundary === 'identity' ? 'identity' : 'signature');
    await retained(h); expect(opened(run)).toBe(false); expect(await h.attempt()).toMatchObject({ phase: 'candidate-verification', appReplaced: false });
});
it('an interrupted previous-app backup is preserved and blocks publication without opening a new app', async () => {
    const h = await previous(); await mkdir(h.app + '.previous'); await writeFile(path.join(h.app + '.previous', 'evidence'), 'inspect-first');
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('interrupted backup'); await retained(h);
    expect(await readFile(path.join(h.app + '.previous', 'evidence'), 'utf8')).toBe('inspect-first'); expect(opened(h.execute)).toBe(false);
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'publication', appReplaced: false, cleanup: 'complete' });
});
it('a symlink in the fixed derived path cannot redirect build output into the registered H2 rollback', async () => {
    const h = await previous(); const h2 = path.join(root, '.tmp/safari-h2'); await mkdir(h2, { recursive: true });
    await writeFile(path.join(h2, 'rollback'), 'untouched'); await rm(path.join(h.workspace, 'derived'), { recursive: true });
    await symlink(h2, path.join(h.workspace, 'derived'), 'dir');
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('workspace-not-regular');
    expect(h.execute).not.toHaveBeenCalled(); expect(await readFile(path.join(h2, 'rollback'), 'utf8')).toBe('untouched');
    expect(await readFile(path.join(h.workspace, 'container.json'), 'utf8')).toBe('historical-verified-receipt');
});
it('an attempt-file symlink cannot overwrite another integration or start native tools', async () => {
    const h = await previous(); const outside = path.join(root, 'protected-evidence'); await writeFile(outside, 'retained');
    await symlink(outside, path.join(h.workspace, 'attempt.json'));
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow(); expect(h.execute).not.toHaveBeenCalled();
    expect(await readFile(outside, 'utf8')).toBe('retained'); await retained(h);
    expect((await readdir(h.workspace)).includes('.build.lock')).toBe(false);
});
it('a symlink at the fixed app path is rejected without replacing the link or changing its destination', async () => {
    const h = await previous(); await rm(h.app, { recursive: true }); const outside = path.join(root, 'foreign-app'); await mkdir(outside);
    await writeFile(path.join(outside, 'retained'), 'untouched'); await symlink(outside, h.app, 'dir');
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('app-not-regular'); expect(h.execute).not.toHaveBeenCalled();
    expect((await lstat(h.app)).isSymbolicLink()).toBe(true); expect(await readFile(path.join(outside, 'retained'), 'utf8')).toBe('untouched');
});
it('cleanup failure after native verification reports the published app separately and cannot publish a success receipt', async () => {
    const h = await previous(); fault.remove = file => file.startsWith(path.join(h.workspace, 'candidate-'));
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('synthetic-cleanup-denied');
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'staging-cleanup', appReplaced: true, cleanup: 'failed' });
    expect(await readFile(path.join(h.workspace, 'container.json'), 'utf8')).toBe('historical-verified-receipt');
    expect(await readdir(path.join(h.app, 'Contents/PlugIns/CopilotH3 Extension.appex/Contents/Resources'))).toContain('runtime.js');
});
it('cleanup failure during another failure preserves the original phase and compiler diagnostics', async () => {
    const h = await previous(); fault.remove = file => file.startsWith(path.join(h.workspace, 'candidate-'));
    const failure = Object.assign(new Error('original-conversion-failure'), { stderr: 'original-native-diagnostic' });
    const run: ContainerCommand = async () => { throw failure; };
    await expect(buildSafariContainer(root, run, 'h3')).rejects.toBe(failure); await retained(h);
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'conversion', appReplaced: false, cleanup: 'failed' });
    expect(await readFile(path.join(h.workspace, 'build.log'), 'utf8')).toBe('original-native-diagnostic');
});
it('backup cleanup failure after complete app replacement retains both versions and reports publication without registration', async () => {
    const h = await previous(); fault.remove = file => file === h.app + '.previous';
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('old backup retained');
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'publication', appReplaced: true, cleanup: 'complete' });
    expect(await readFile(path.join(h.app + '.previous', 'previous-source'), 'utf8')).toBe('retained'); expect(opened(h.execute)).toBe(false);
});
it('a denied candidate rename restores the complete previous app and records no publication', async () => {
    const h = await previous(); fault.rename = (from, to) => from.startsWith(path.join(h.workspace, 'candidate-')) && to === h.app;
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('synthetic-publication-denied'); await retained(h);
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'publication', appReplaced: false, cleanup: 'complete' });
    expect(opened(h.execute)).toBe(false); expect((await readdir(path.dirname(h.app))).includes('CopilotH3.app.previous')).toBe(false);
});
it('a receipt-file symlink fails truthfully after app publication while preserving the foreign evidence', async () => {
    const h = await previous(); const outside = path.join(root, 'foreign-receipt'); await writeFile(outside, 'protected');
    await rm(path.join(h.workspace, 'container.json')); await symlink(outside, path.join(h.workspace, 'container.json'));
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow();
    expect(await h.attempt()).toMatchObject({ state: 'failed', phase: 'receipt-publication', appReplaced: true, cleanup: 'complete' });
    expect(await readFile(outside, 'utf8')).toBe('protected');
});
it('a second builder for the same profile cannot overwrite the first attempt or start native work while compilation is pending', async () => {
    const h = await previous(); let entered = false; let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const firstRun: ContainerCommand = async (file, args) => {
        const result = await h.execute(file, args);
        if (file.endsWith('xcodebuild') && args.includes('build')) { entered = true; await held; }
        return result;
    };
    const first = buildSafariContainer(root, firstRun, 'h3');
    try {
        await vi.waitFor(() => expect(entered).toBe(true), { timeout: 5000 });
        const before = await readFile(path.join(h.workspace, 'attempt.json'), 'utf8'); const calls = vi.mocked(h.execute).mock.calls.length;
        await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('build-lock-unavailable');
        expect(await readFile(path.join(h.workspace, 'attempt.json'), 'utf8')).toBe(before); expect(h.execute).toHaveBeenCalledTimes(calls);
    } finally { release(); await first; }
    expect((await readdir(h.workspace)).includes('.build.lock')).toBe(false);
});
it('an existing profile lock and its owner evidence remain untouched instead of being blindly reclaimed', async () => {
    const h = await previous(); const lock = path.join(h.workspace, '.build.lock'); await mkdir(lock); await writeFile(path.join(lock, 'owner.json'), 'another-run');
    await expect(buildSafariContainer(root, h.execute, 'h3')).rejects.toThrow('build-lock-unavailable');
    expect(h.execute).not.toHaveBeenCalled(); expect(await readFile(path.join(lock, 'owner.json'), 'utf8')).toBe('another-run'); await retained(h);
});
it('an H2 build lock cannot block or be removed by an independent H3 preparation', async () => {
    const h = await previous(); const lock = path.join(root, '.tmp/safari-h2/.build.lock'); await mkdir(lock, { recursive: true });
    await writeFile(path.join(lock, 'owner.json'), 'h2-owner'); await buildSafariContainer(root, h.execute, 'h3');
    expect(await readFile(path.join(lock, 'owner.json'), 'utf8')).toBe('h2-owner');
    expect(await h.attempt()).toMatchObject({ state: 'verified', appReplaced: true, cleanup: 'complete' });
});
