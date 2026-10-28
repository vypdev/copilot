vi.mock('node:os', async original => {
    const actual = await original<typeof import('node:os')>(); return { ...actual, platform: vi.fn(actual.platform) };
});
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
vi.mock('node:child_process', async original => {
    const actual = await original<typeof import('node:child_process')>();
    return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir, platform } from 'node:os';
import path from 'node:path';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { runBrowserHarness, localHarnessEnvironment, type HarnessTarget } from '../../tooling/runtime_harness.mts';
import { targetManifest } from '../../src/infrastructure/target_manifests.ts';
import type { BrowserDriver } from '../../tooling/webdriver.mts';
import { browserConfiguration, browserMain, browserEntrypoint } from '../../tooling/browser_cli.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url)); let temporary: string; let sourceTree: string;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h2-harness-unit-'));
    const receipt = await buildDevelopmentSet(root, path.join(temporary, 'extension/dist')); sourceTree = receipt.sourceTreeSha256;
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });
function fakeDriver(target: HarnessTarget, missingAnchor = false): BrowserDriver {
    let protectedRoute = false;
    return { capabilities: { browserName: target.startsWith('firefox') ? 'firefox' : target,
        browserVersion: { chrome: '156.0.8078.47', firefox: '158.0.1', 'firefox-esr': '153.5.1', safari: '27.0.1' }[target] },
    navigate: vi.fn(async () => undefined), focusFixture: vi.fn(async () => undefined), openRuntimeOptions: vi.fn(async () => 'chrome-extension://test/runtime.html'), close: vi.fn(async () => undefined),
    evaluate: vi.fn(async (script: string, args: unknown[] = []) => {
        if (script.includes('visibilityState')) return true;
        if (script.includes('!!document.querySelector')) return !missingAnchor;
        if (script.includes('dataset.copilotSourceTree')) return sourceTree;
        if (script.includes('querySelectorAll')) return protectedRoute ? 0 : 1;
        if (script.includes('draft.value===')) return true;
        if (script.includes('return draft.value')) return 'Authored draft 🧪';
        if (script.includes('getManifest')) return { id: target === 'safari' ? 'invalid.extensions.copilot.h2.Extension (UNSIGNED)' : 'test', session: true, manifest: targetManifest(target === 'firefox-esr' ? 'firefox' : target) };
        if (script.includes('/settings/tokens') || args[0] === '/settings/tokens') protectedRoute = true;
        if (args[0] === '/octo/example/issues/42') protectedRoute = false;
        return undefined;
    }) as BrowserDriver['evaluate'],
    evaluateAsync: vi.fn(async (script: string) => ({ state: script.includes('session.disconnect') ? 'disconnected' : 'rejected', sourceTree })) as BrowserDriver['evaluateAsync'] };
}
const environment = { os: 'macOS 27.0.1 build 26A434', driver: 'native-driver-version', container: 'invalid.extensions.copilot.h2.Extension', wait: vi.fn(async () => undefined) };
it('github-browser-extension-runtime-C32/github-browser-extension-runtime-C33/github-browser-extension-runtime-C34/github-browser-extension-runtime-C35/github-browser-extension-runtime-C37 validates real-run receipt semantics with isolated orchestration fakes, without claiming actual-browser proof', async () => {
    for (const target of ['chrome', 'firefox', 'firefox-esr', 'safari'] as const) {
        const driver = fakeDriver(target); const receipt = await runBrowserHarness(temporary, target, driver, environment);
        expect(receipt.evidence).toBe('actual-extension-loaded'); expect(receipt.sourceTreeSha256).toBe(sourceTree);
        expect(receipt.fixtureSha256).toMatch(/^[a-f\d]{64}$/u); expect(receipt.assertions).toContain('native-draft-selection-and-focus-preserved');
        expect(receipt.assertions).toContain('exact-background-build-loaded'); expect(driver.navigate).toHaveBeenCalledTimes(1); expect(driver.openRuntimeOptions).toHaveBeenCalledTimes(1);
        // These fakes prove harness assertions only. Published acceptance receipts come from NativeDriver runs.
    }
});
it('github-browser-extension-runtime-C36 refuses wrong engines, versions, missing containing app and absent loaded extension rather than substituting WebKit', async () => {
    for (const [target, patch, expected] of [['chrome', { browserVersion: '1' }, 'exact-browser-version'],
        ['chrome', { browserName: 'webkit' }, 'actual-browser-engine']] as const) {
        const driver = fakeDriver(target); Object.assign(driver.capabilities, patch);
        await expect(runBrowserHarness(temporary, target, driver, environment)).rejects.toThrow(expected);
    }
    await expect(runBrowserHarness(temporary, 'safari', fakeDriver('safari'), { ...environment, container: '' })).rejects.toThrow('actual-safari-container-prerequisite');
    await expect(runBrowserHarness(temporary, 'safari', fakeDriver('safari'), { ...environment, os: 'other' })).rejects.toThrow('actual-safari-container-prerequisite');
    await expect(runBrowserHarness(temporary, 'chrome', fakeDriver('chrome', true), environment)).rejects.toThrow('packaged-content-entry-loaded');
});
it('github-browser-extension-runtime-C37 waits for genuinely mounted fixtures and rejects cached source identities or native draft damage', async () => {
    const driver = fakeDriver('chrome'); const original = driver.evaluate;
    let attempts = 0;
    driver.evaluate = vi.fn(async (script: string, args?: unknown[]) => {
        if (script.includes('querySelectorAll') && attempts++ === 0) return 0;
        if (script.includes('dataset.copilotSourceTree')) return 'stale-source';
        return original(script, args);
    }) as BrowserDriver['evaluate'];
    await expect(runBrowserHarness(temporary, 'chrome', driver, environment)).rejects.toThrow('exact-content-build-loaded');
    const broken = fakeDriver('chrome'); const inspect = broken.evaluate;
    broken.evaluate = vi.fn(async (script: string, args?: unknown[]) => script.includes('draft.value===') ? false : inspect(script, args)) as BrowserDriver['evaluate'];
    await expect(runBrowserHarness(temporary, 'chrome', broken, environment)).rejects.toThrow('native-draft-selection');
});
it('github-browser-extension-runtime-C36 validates explicit native executable prerequisites and emits failed receipt before any silent substitution', async () => {
    expect(browserConfiguration(root, 'safari', {})).toMatchObject({ driver: '/usr/bin/safaridriver', target: 'safari' });
    expect(browserConfiguration(root, 'firefox-esr', { COPILOT_H2_FIREFOX_ESR_BINARY: '/test/firefox', COPILOT_H2_FIREFOX_ESR_DRIVER: '/test/geckodriver' }))
        .toMatchObject({ artifact: path.join(root, 'extension/dist/firefox') });
    for (const target of ['edge', 'chrome', 'firefox']) expect(() => browserConfiguration(root, target, {})).toThrow();
    expect(() => browserConfiguration(root, 'chrome', { COPILOT_H2_CHROME_BINARY: 'relative', COPILOT_H2_CHROME_DRIVER: '/driver' })).toThrow('prerequisite');
    expect(() => browserConfiguration(root, 'chrome', { COPILOT_H2_CHROME_BINARY: '/binary', COPILOT_H2_CHROME_DRIVER: 'relative' })).toThrow('prerequisite');
    const scratch = path.join(temporary, 'failures'); await mkdir(scratch);
    for (const args of [[], ['edge'], ['chrome', 'extra'], ['chrome']]) await expect(browserMain(args, scratch, {})).rejects.toThrow('Browser acceptance failed');
    const failed = JSON.parse(await readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome-failed.json'), 'utf8'));
    expect(failed).toMatchObject({ evidence: 'failed', acceptance: false, substitution: 'none' });
    await browserEntrypoint([]); await browserEntrypoint(['node', '/other/module.mts']);
});
it('local environment reports actual OS identity and uses one short bounded wait for native event delivery', async () => {
    const environment = localHarnessEnvironment('driver', 'container'); expect(environment.os.length).toBeGreaterThan(3);
    vi.useFakeTimers(); const wait = environment.wait(); await vi.advanceTimersByTimeAsync(100); await wait; vi.useRealTimers();
});

it('browser CLI writes only completed native-run receipts, closes its driver, and sanitizes unexpected execution failures', async () => {
    const { NativeDriver } = await import('../../tooling/webdriver.mts');
    const harness = await import('../../tooling/runtime_harness.mts'); const safari = await import('../../tooling/safari_container.mts');
    const receipt = await runBrowserHarness(temporary, 'chrome', fakeDriver('chrome'), environment);
    const childProcess = await import('node:child_process');
    const execute = vi.spyOn(childProcess, 'execFileSync').mockReturnValue('native-driver-version');
    const start = vi.spyOn(NativeDriver.prototype, 'start').mockResolvedValue(); const close = vi.spyOn(NativeDriver.prototype, 'close').mockResolvedValue();
    const run = vi.spyOn(harness, 'runBrowserHarness').mockResolvedValue(receipt); const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const scratch = path.join(temporary, 'success'); await mkdir(scratch);
    const env = { COPILOT_H2_CHROME_BINARY: '/usr/bin/true', COPILOT_H2_CHROME_DRIVER: '/usr/bin/true' };
    await browserMain(['chrome'], scratch, env); expect(start).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
    expect(JSON.parse(await readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome.json'), 'utf8'))).toMatchObject({ evidence: 'actual-extension-loaded' });
    const verify = vi.spyOn(safari, 'verifySafariContainer').mockResolvedValue({ appId: 'invalid.extensions.copilot.h2', extensionId: 'invalid.extensions.copilot.h2.Extension',
        version: '0.1.0', xcode: 'test', sourceTreeSha256: sourceTree, resources: {}, signature: 'local-ad-hoc-development-only', distribution: false });
    await browserMain(['safari'], scratch, { COPILOT_H2_SAFARI_APP: '/isolated/CopilotH2.app' });
    await browserMain(['safari'], scratch, {});
    expect(verify).toHaveBeenCalledWith(scratch, '/isolated/CopilotH2.app');
    run.mockRejectedValueOnce(new Error('synthetic-private-error'));
    await expect(browserMain(['chrome'], scratch, env)).rejects.toThrow('browser-execution-failed');
    const failed = JSON.parse(await readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome-failed.json'), 'utf8'));
    expect(JSON.stringify(failed)).not.toContain('synthetic-private-error');
    await expect(readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    close.mockRejectedValueOnce(new Error('cleanup-failed'));
    await expect(browserMain(['chrome'], scratch, env)).rejects.toThrow('browser-execution-failed');
    await expect(readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    for (const error of [Object.assign(new TypeError('private'), { code: 'ENOENT' }), { code: 'EACCES' }, Object.assign(new Error('private'), { name: 'ForeignError' })]) {
        start.mockRejectedValueOnce(error); await expect(browserMain(['chrome'], scratch, env)).rejects.toThrow('browser-execution-failed');
        const failure = JSON.parse(await readFile(path.join(scratch, '.tmp/extension-browser-evidence/chrome-failed.json'), 'utf8'));
        expect(JSON.stringify(failure)).not.toContain('private'); expect(failure.errorCategory).toBe(error instanceof TypeError ? 'TypeError' : 'unknown');
    }
    start.mockRejectedValueOnce(new Error('prerequisite:missing-driver')); await expect(browserMain(['chrome'], scratch, env)).rejects.toThrow('prerequisite:missing-driver');
    verify.mockRestore(); run.mockRestore(); close.mockRestore(); start.mockRestore(); log.mockRestore(); execute.mockRestore();
});
it('browser CLI entrypoint reports a failed prerequisite with a nonzero exit code and does not execute when imported', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined); const previous = process.exitCode;
    await browserEntrypoint(['node', fileURLToPath(new URL('../../tooling/browser_cli.mts', import.meta.url)), 'invalid']);
    expect(process.exitCode).toBe(1); expect(error).toHaveBeenCalled(); process.exitCode = previous; error.mockRestore();
});

it('rejects an expanded live permission manifest and retains only its own nonsecret diagnostic artifact', async () => {
    const driver = fakeDriver('chrome'); const evaluate = driver.evaluate;
    driver.evaluate = vi.fn(async (script: string, args?: unknown[]) => script.includes('getManifest')
        ? { id: 'test', session: true, manifest: { ...targetManifest('chrome'), permissions: ['cookies'] } } : evaluate(script, args)) as BrowserDriver['evaluate'];
    await expect(runBrowserHarness(temporary, 'chrome', driver, environment)).rejects.toThrow('exact-generated-manifest-loaded');
    expect(JSON.parse(await readFile(path.join(temporary, '.tmp/extension-browser-evidence/chrome-manifest.json'), 'utf8')).permissions).toEqual(['cookies']);
});

it('receipt environment records native macOS identity or native Unix kernel identity without substituting a browser', async () => {
    const childProcess = await import('node:child_process'); const execute = vi.spyOn(childProcess, 'execFileSync').mockReturnValue('macOS exact identity');
    for (const host of ['darwin', 'linux'] as const) {
        vi.mocked(platform).mockReturnValue(host); const env = localHarnessEnvironment('driver', 'container');
        expect(env.os).toEqual(host === 'darwin' ? 'macOS exact identity' : expect.stringContaining('linux'));
    }
    const actual = await vi.importActual<typeof import('node:os')>('node:os'); vi.mocked(platform).mockImplementation(actual.platform);
    execute.mockRestore();
});

it('settings acceptance rejects external destinations and a different Safari extension identity', async () => {
    const external = fakeDriver('chrome'); vi.mocked(external.openRuntimeOptions).mockResolvedValue('https://evil.invalid/runtime.html');
    await expect(runBrowserHarness(temporary, 'chrome', external, environment)).rejects.toThrow('native-runtime-settings-navigation');
    const safari = fakeDriver('safari'); const evaluate = safari.evaluate;
    safari.evaluate = vi.fn(async (script: string, args?: unknown[]) => script.includes('getManifest')
        ? { id: 'unrelated.extension', session: true, manifest: targetManifest('safari') } : evaluate(script, args)) as BrowserDriver['evaluate'];
    await expect(runBrowserHarness(temporary, 'safari', safari, environment)).rejects.toThrow('actual-safari-containing-extension-loaded');
});
it('eligible navigation must resume the owned panel before settings is clicked', async () => {
    for (const resume of [false, true]) {
        const driver = fakeDriver('chrome'); const evaluate = driver.evaluate; let protectedNavigation = false; let resumeCalls = 0;
        driver.evaluate = vi.fn(async (script: string, args?: unknown[]) => {
            if (script.includes('/settings/tokens')) protectedNavigation = true;
            if (protectedNavigation && script.includes('querySelectorAll')) {
                if (resumeCalls++ === 0 || !resume || resumeCalls === 2) return 0;
            }
            return evaluate(script, args);
        }) as BrowserDriver['evaluate'];
        if (resume) expect((await runBrowserHarness(temporary, 'chrome', driver, environment)).assertions).toContain('eligible-navigation-resumes-owned-ui');
        else { await expect(runBrowserHarness(temporary, 'chrome', driver, environment)).rejects.toThrow('eligible-navigation-resumes-owned-ui'); expect(driver.openRuntimeOptions).not.toHaveBeenCalled(); }
    }
});

it.each([false, true])('native fixture visibility %s is a real prerequisite after an owned pointer focus', async eventuallyVisible => {
    const driver = fakeDriver('safari'); const evaluate = driver.evaluate; let checks = 0;
    driver.evaluate = vi.fn(async (script: string, args?: unknown[]) => script.includes('visibilityState')
        ? eventuallyVisible && checks++ > 0 : evaluate(script, args)) as BrowserDriver['evaluate'];
    if (eventuallyVisible) expect((await runBrowserHarness(temporary, 'safari', driver, environment)).assertions).toContain('native-fixture-visible');
    else await expect(runBrowserHarness(temporary, 'safari', driver, environment)).rejects.toThrow('native-fixture-visible');
    expect(driver.focusFixture).toHaveBeenCalledExactlyOnceWith();
});
