import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), create: vi.fn(), journey: vi.fn(), pause: vi.fn(), failCleanupProgress: false }));
vi.mock('node:fs/promises', async original => {
    const actual = await original<typeof import('node:fs/promises')>();
    return { ...actual, writeFile: async (...args: Parameters<typeof actual.writeFile>) => {
        if (mocks.failCleanupProgress && String(args[0]).endsWith('-attempt.json') && String(args[1]).includes('owned-session-cleanup')) {
            mocks.failCleanupProgress = false; throw new Error('progress-unavailable');
        }
        return actual.writeFile(...args);
    } };
});
vi.mock('node:child_process', async original => ({ ...await original<object>(), execFileSync: mocks.execute }));
vi.mock('../../tooling/webdriver.mts', () => ({ NativeDriver: mocks.create, pauseDriver: mocks.pause }));
vi.mock('../../tooling/center_browser_journey.mts', () => ({ CENTER_BROWSER_VERSIONS: { chrome: '156.0.8078.80', firefox: '159.0' }, runCenterBrowserJourney: mocks.journey }));
import { centerBrowserConfiguration as configuration, centerBrowserMain as run, centerBrowserEntrypoint } from '../../tooling/center_browser_cli.mts';

let root: string; let environment: NodeJS.ProcessEnv;
const source = { sourceRevision: 'a'.repeat(40), sourceTreeSha256: 'b'.repeat(64) };
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function driver() {
    return { capabilities: { browserName: 'chrome', browserVersion: '156.0.8078.80' }, start: vi.fn(), close: vi.fn(), navigate: vi.fn(), focusFixture: vi.fn(),
        evaluate: vi.fn(async (script: string): Promise<unknown> => script.includes('copilotSourceTree') ? source.sourceTreeSha256 : true),
        openRuntimeOptions: vi.fn(async () => 'chrome-extension://owned/runtime.html'), page: { screenshot: vi.fn(async () => png) } };
}
let browser: ReturnType<typeof driver>;
beforeEach(async () => {
    vi.resetAllMocks(); mocks.failCleanupProgress = false; root = await fs.mkdtemp(path.join(tmpdir(), 'copilot-h3-cli-test-'));
    await fs.mkdir(path.join(root, 'extension/dist'), { recursive: true });
    await fs.writeFile(path.join(root, 'extension/dist/receipt.json'), JSON.stringify(source));
    await fs.writeFile(path.join(root, 'browser'), 'browser'); await fs.writeFile(path.join(root, 'driver'), 'driver');
    environment = { COPILOT_H3_CHROME_BINARY: path.join(root, 'browser'), COPILOT_H3_CHROME_DRIVER: path.join(root, 'driver') };
    mocks.execute.mockImplementation((file, args) => args[0] === 'status' ? '' : file === process.execPath ? '' : 'ChromeDriver 156.0.8078.80 (pinned)\n');
    browser = driver(); mocks.create.mockImplementation(function () { return browser; });
    mocks.journey.mockResolvedValue({ evidence: 'actual-native-center-component-journey', ...source, fullH3Acceptance: false });
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
async function report() {
    const output = path.join(root, '.tmp/extension-browser-center-evidence');
    const files = (await fs.readdir(output)).filter(name => name.endsWith('.json') && !name.endsWith('-attempt.json'));
    expect(files).toHaveLength(1); return JSON.parse(await fs.readFile(path.join(output, files[0]), 'utf8'));
}
it('accepts only explicit pinned-target paths and a closed visible switch; rejects Safari and arbitrary overrides', () => {
    expect(configuration(['chrome', '--visible'], root, environment)).toMatchObject({ target: 'chrome', visible: true, artifact: path.join(root, 'extension/dist/chrome') });
    expect(configuration(['chrome'], root, environment)).not.toHaveProperty('visible');
    expect(configuration(['firefox'], root, { COPILOT_H3_FIREFOX_BINARY: '/firefox', COPILOT_H3_FIREFOX_DRIVER: '/gecko' })).toMatchObject({ target: 'firefox' });
    for (const args of [[], ['safari'], ['edge'], ['chrome', '--output=/foreign'], ['chrome', '--visible', 'extra']]) expect(() => configuration(args, root, environment)).toThrow('Usage:');
    for (const values of [{}, { COPILOT_H3_CHROME_BINARY: 'relative', COPILOT_H3_CHROME_DRIVER: '/driver' },
        { COPILOT_H3_CHROME_BINARY: '/browser', COPILOT_H3_CHROME_DRIVER: 'relative' }]) expect(() => configuration(['chrome'], root, values)).toThrow('explicit-binary-driver');
});
it('uses a child validation command in the package cwd before starting and closes its own session before publishing success', async () => {
    const previous = process.cwd(); await run(['chrome'], root, environment);
    expect(process.cwd()).toBe(previous);
    expect(mocks.execute).toHaveBeenNthCalledWith(1, process.execPath, [path.join(root, 'extension/tooling/cli.mts'), 'validate'], {
        cwd: path.join(root, 'extension'), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
    });
    expect(browser.navigate).toHaveBeenCalledExactlyOnceWith('https://github.com/vypdev/copilot/issues/704');
    expect(browser.focusFixture).toHaveBeenCalledTimes(1); expect(browser.close).toHaveBeenCalledTimes(1);
    expect(mocks.journey).toHaveBeenCalledWith(browser, 'chrome', 'chrome-extension://owned/runtime.html', source, expect.any(Function));
    await mocks.journey.mock.calls[0][4](); expect(mocks.pause).toHaveBeenCalledWith(100);
    expect(await report()).toMatchObject({ cleanup: 'owned-session-closed', sourceState: 'committed-source', fullH3Acceptance: false, visible: false });
});
it('labels an unpublished changed working tree accurately and retains unique runs instead of overwriting historical evidence', async () => {
    const execute = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation((file, args, options) => args[0] === 'status' ? ' M extension/source.ts' : execute(file, args, options));
    await run(['chrome', '--visible'], root, environment); expect(await report()).toMatchObject({ sourceState: 'development-worktree', visible: true });
    await run(['chrome'], root, environment);
    const files = await fs.readdir(path.join(root, '.tmp/extension-browser-center-evidence'));
    expect(files.filter(name => name.endsWith('.json') && !name.endsWith('-attempt.json'))).toHaveLength(2);
});
it('fails a stale/nonreproducible package before any executable or browser access and redacts arbitrary validation output', async () => {
    mocks.execute.mockImplementationOnce(() => { throw new Error('private stale package diagnostic'); });
    await expect(run(['chrome'], root, environment)).rejects.toThrow('execution-failed');
    expect(mocks.create).not.toHaveBeenCalled(); expect(await report()).toMatchObject({ phase: 'current-source-package', cleanup: 'not-created', sourceRevision: null });
    expect(JSON.stringify(await report())).not.toContain('private');
});
it('requires Node24 and does not start a native session on usage/prerequisite failure', async () => {
    const descriptor = Object.getOwnPropertyDescriptor(process.versions, 'node')!;
    try {
        Object.defineProperty(process.versions, 'node', { value: '22.0.0', configurable: true });
        await expect(run(['chrome'], root, environment)).rejects.toThrow('prerequisite:center:node24');
    } finally { Object.defineProperty(process.versions, 'node', descriptor); }
    expect(mocks.create).not.toHaveBeenCalled(); expect(await report()).toMatchObject({ phase: 'prerequisites', cleanup: 'not-created' });
});
it('rejects an unreviewed driver version before launching, even if the browser path exists', async () => {
    const execute = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation((file, args, options) => file === environment.COPILOT_H3_CHROME_DRIVER ? 'ChromeDriver 155.0' : execute(file, args, options));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('pinned-driver-version'); expect(mocks.create).not.toHaveBeenCalled();
});
it('rejects a different native browser capability and always attempts cleanup after a failed start', async () => {
    browser.capabilities.browserVersion = '155.0';
    await expect(run(['chrome'], root, environment)).rejects.toThrow('pinned-browser-engine-version'); expect(browser.close).toHaveBeenCalledTimes(1);
    expect(mocks.journey).not.toHaveBeenCalled();
});
it('origin rejection never injects the fixture or opens settings', async () => {
    browser.evaluate.mockResolvedValue(false);
    await expect(run(['chrome'], root, environment)).rejects.toThrow('public-bootstrap-origin');
    expect(browser.evaluate).toHaveBeenCalledTimes(1); expect(browser.openRuntimeOptions).not.toHaveBeenCalled(); expect(browser.close).toHaveBeenCalledTimes(1);
});
it('bounds missing content mounting and preserves the original failure phase through cleanup', async () => {
    browser.evaluate.mockImplementation(async script => script.includes('location.origin'));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('owned-content-entry-missing');
    expect(mocks.pause).toHaveBeenCalledTimes(150); expect(browser.close).toHaveBeenCalledTimes(1);
    expect(await report()).toMatchObject({ phase: 'owned-content-entry', cleanup: 'owned-session-closed' });
});
it('content from another source cannot authorize the options transition', async () => {
    browser.evaluate.mockImplementation(async script => script.includes('copilotSourceTree') ? 'stale' : true);
    await expect(run(['chrome'], root, environment)).rejects.toThrow('content-source-mismatch'); expect(browser.openRuntimeOptions).not.toHaveBeenCalled();
});
it('a native-driver failure is sanitized and cannot produce a completed journey receipt', async () => {
    browser.start.mockRejectedValue(new Error('webdriver:session:private-details'));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('native-driver-failure'); expect(browser.close).toHaveBeenCalledTimes(1);
    expect(await report()).toMatchObject({ evidence: 'failed', phase: 'native-start' });
});
it('a journey assertion and simultaneous cleanup failure preserve the first failure without claiming cleanup', async () => {
    mocks.journey.mockRejectedValue(new Error('assertion:center:cancel-no-write')); browser.close.mockRejectedValue(new Error('private-cleanup'));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('cancel-no-write');
    expect(await report()).toMatchObject({ phase: 'center-component-journey', cleanup: 'cleanup-unconfirmed', evidence: 'failed' });
});
it('changed executable bytes during the run invalidate evidence before a success receipt', async () => {
    mocks.journey.mockImplementation(async () => { await fs.writeFile(path.join(root, 'browser'), 'changed'); return {}; });
    await expect(run(['chrome'], root, environment)).rejects.toThrow('executable-changed-during-run'); expect(browser.close).toHaveBeenCalledTimes(1);
});
it('failed owned-session cleanup cannot retain a native success', async () => {
    browser.close.mockRejectedValue(new Error('private cleanup'));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('execution-failed'); expect(await report()).toMatchObject({ phase: 'owned-session-cleanup', cleanup: 'cleanup-unconfirmed' });
});
it('still closes the owned driver when writing its cleanup progress receipt fails', async () => {
    mocks.failCleanupProgress = true;
    await expect(run(['chrome'], root, environment)).rejects.toThrow('execution-failed'); expect(browser.close).toHaveBeenCalledTimes(1);
    expect(await report()).toMatchObject({ cleanup: 'owned-session-closed', evidence: 'failed' });
});
it('entrypoint import is inert and actual invocations propagate arguments or set a failing exit without raw values', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined); const previous = process.exitCode;
    try {
        const entry = fileURLToPath(new URL('../../tooling/center_browser_cli.mts', import.meta.url)); const execute = vi.fn();
        await centerBrowserEntrypoint([], execute); await centerBrowserEntrypoint(['node', '/unrelated'], execute); expect(execute).not.toHaveBeenCalled();
        await centerBrowserEntrypoint(['node', entry, 'chrome'], execute); expect(execute).toHaveBeenCalledExactlyOnceWith(['chrome']);
        execute.mockRejectedValueOnce(new Error('Center browser verification failed: fixed reason'));
        await centerBrowserEntrypoint(['node', entry], execute); expect(error).toHaveBeenLastCalledWith('Center browser verification failed: fixed reason'); expect(process.exitCode).toBe(1);
        execute.mockRejectedValueOnce({ private: 'never-rendered' }); await centerBrowserEntrypoint(['node', entry], execute);
        expect(error).toHaveBeenLastCalledWith('Center browser verification failed.');
    } finally { process.exitCode = previous; }
});
it('records invalid target usage without starting, preserving an unknown-target failed receipt', async () => {
    await expect(run(['safari'], root, environment)).rejects.toThrow('usage'); expect(await report()).toMatchObject({ target: 'unknown', reason: 'usage', cleanup: 'not-created' });
});
it('rejects non-Error cleanup failures as failures, even after a complete journey', async () => {
    browser.close.mockRejectedValue(undefined);
    await expect(run(['chrome'], root, environment)).rejects.toThrow('execution-failed'); expect(await report()).toMatchObject({ evidence: 'failed', cleanup: 'cleanup-unconfirmed' });
});
it('captures a screenshot failure without promoting its journey and still cleans up', async () => {
    browser.page.screenshot.mockRejectedValue(new Error('webdriver:page:invalid-png'));
    await expect(run(['chrome'], root, environment)).rejects.toThrow('webdriver:page:invalid-png'); expect(await report()).toMatchObject({ phase: 'evidence-capture', cleanup: 'owned-session-closed' });
});
it('uses the Firefox-specific pin with no Chrome substitution', async () => {
    environment = { COPILOT_H3_FIREFOX_BINARY: path.join(root, 'browser'), COPILOT_H3_FIREFOX_DRIVER: path.join(root, 'driver') };
    browser.capabilities = { browserName: 'firefox', browserVersion: '159.0' }; const execute = mocks.execute.getMockImplementation()!;
    mocks.execute.mockImplementation((file, args, options) => file === environment.COPILOT_H3_FIREFOX_DRIVER ? 'geckodriver 0.37.1 (pinned)' : execute(file, args, options));
    await run(['firefox'], root, environment); expect(mocks.journey.mock.calls[0][1]).toBe('firefox'); expect(await report()).toMatchObject({ target: 'firefox', cleanup: 'owned-session-closed' });
});
