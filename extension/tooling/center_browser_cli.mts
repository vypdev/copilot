import { fileURLToPath } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { arch, platform, release } from 'node:os';
import path from 'node:path';
import { NativeDriver, pauseDriver, type DriverConfiguration } from './webdriver.mts';
import { CENTER_BROWSER_VERSIONS, runCenterBrowserJourney, type CenterBrowserTarget } from './center_browser_journey.mts';
import { GITHUB_FIXTURE } from '../test/fixtures/github.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const USAGE = 'Usage: test:center-browsers chrome|firefox [--visible]; Safari uses the separate verified containing-app/native UI procedure.';
export function centerBrowserConfiguration(args: readonly string[], root: string, environment: NodeJS.ProcessEnv): DriverConfiguration {
    if (args.length < 1 || args.length > 2 || !['chrome', 'firefox'].includes(args[0])
        || args.length === 2 && args[1] !== '--visible') throw new Error(USAGE);
    const target = args[0] as CenterBrowserTarget; const key = target.toUpperCase();
    const binary = environment[`COPILOT_H3_${key}_BINARY`]; const driver = environment[`COPILOT_H3_${key}_DRIVER`];
    if (!binary || !driver || !path.isAbsolute(binary) || !path.isAbsolute(driver)) throw new Error(`prerequisite:center:${target}-explicit-binary-driver`);
    return { target, binary, driver, artifact: path.join(root, 'extension/dist', target), ...(args.length === 2 ? { visible: true } : {}) };
}
/** Owns a fresh browser profile. Only this concrete native-driver composition can publish run receipts. */
export async function centerBrowserMain(args: readonly string[], root = ROOT, environment = process.env): Promise<void> {
    const output = path.join(root, '.tmp/extension-browser-center-evidence'); await mkdir(output, { recursive: true });
    const target = ['chrome', 'firefox'].includes(args[0]) ? args[0] as CenterBrowserTarget : 'unknown';
    const runId = randomUUID(); const report = path.join(output, `${target}-${runId}.json`);
    const attemptPath = path.join(output, `${target}-attempt.json`);
    let phase = 'prerequisites'; let driver: NativeDriver | undefined; let failure: unknown; let failedPhase: string | undefined;
    let sessionClosed = false;
    let sourceRevision: string | null = null; let sourceTreeSha256: string | null = null;
    let receipt: Readonly<Record<string, unknown>> | undefined;
    const attempt = (state: 'running' | 'failed' | 'verified') => writeFile(attemptPath, JSON.stringify({
        schemaVersion: 1, runId, target, phase, state, sourceRevision, sourceTreeSha256, report: path.basename(report), fullH3Acceptance: false,
    }, null, 2) + '\n');
    await attempt('running');
    try {
        if (process.versions.node.split('.')[0] !== '24') throw new Error('prerequisite:center:node24');
        const configuration = centerBrowserConfiguration(args, root, environment);
        phase = 'current-source-package'; await attempt('running');
        // The package command owns the compiler working directory; never mutate this process's cwd.
        execFileSync(process.execPath, [path.join(root, 'extension/tooling/cli.mts'), 'validate'], {
            cwd: path.join(root, 'extension'), encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
        });
        const source = JSON.parse(await readFile(path.join(root, 'extension/dist/receipt.json'), 'utf8'));
        sourceRevision = source.sourceRevision; sourceTreeSha256 = source.sourceTreeSha256;
        const sourceState = execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim()
            ? 'development-worktree' : 'committed-source';
        phase = 'native-executables'; await attempt('running');
        const driverVersion = execFileSync(configuration.driver, ['--version'], { encoding: 'utf8', maxBuffer: 16384, timeout: 10000 }).split('\n')[0];
        const expectedDriver = target === 'chrome' ? /^ChromeDriver 156\.0\.8078\.80(?:\s|$)/u : /^geckodriver 0\.37\.1(?:\s|$)/u;
        if (!expectedDriver.test(driverVersion)) throw new Error('prerequisite:center:pinned-driver-version');
        const digest = async (file: string) => createHash('sha256').update(await readFile(file)).digest('hex');
        const executableHashes = { browser: await digest(configuration.binary), driver: await digest(configuration.driver) };
        phase = 'native-start'; await attempt('running'); driver = new NativeDriver(configuration); await driver.start();
        if (target === 'unknown' || driver.capabilities.browserName !== target || driver.capabilities.browserVersion !== CENTER_BROWSER_VERSIONS[target]) {
            throw new Error('prerequisite:center:pinned-browser-engine-version');
        }
        phase = 'public-github-fixture'; await attempt('running');
        await driver.navigate('https://github.com/vypdev/copilot/issues/704');
        if (await driver.evaluate('return location.origin === "https://github.com";') !== true) throw new Error('assertion:center:public-bootstrap-origin');
        // Original inert HTML prepares the content origin; extension APIs and product input events are never replaced.
        await driver.evaluate('document.documentElement.innerHTML=arguments[0];history.replaceState({},"","/octo/example/issues/42");dispatchEvent(new Event("turbo:render"));',
            [GITHUB_FIXTURE.replace(/^<!doctype html><html lang="en">/u, '').replace(/<\/html>$/u, '')]);
        await driver.focusFixture();
        phase = 'owned-content-entry'; await attempt('running'); let mounted = false;
        for (let i = 0; i < 150; i++) {
            mounted = await driver.evaluate('return !!document.querySelector("[data-copilot-open-settings]");') === true;
            if (mounted) break; await pauseDriver(100);
        }
        if (!mounted) throw new Error('assertion:center:owned-content-entry-missing');
        if (await driver.evaluate('return document.querySelector("[data-copilot-runtime]")?.dataset.copilotSourceTree;') !== sourceTreeSha256) {
            throw new Error('assertion:center:content-source-mismatch');
        }
        phase = 'native-options-transition'; await attempt('running'); const options = await driver.openRuntimeOptions();
        phase = 'center-component-journey'; await attempt('running');
        const observations = await runCenterBrowserJourney(driver, target, options, source, () => pauseDriver(100));
        phase = 'evidence-capture'; await attempt('running');
        const png = await driver.page.screenshot(); const screenshot = `${target}-${runId}.png`; await writeFile(path.join(output, screenshot), png);
        if (await digest(configuration.binary) !== executableHashes.browser || await digest(configuration.driver) !== executableHashes.driver) {
            throw new Error('assertion:center:executable-changed-during-run');
        }
        receipt = { ...observations, target, sourceRevision, sourceTreeSha256, fullH3Acceptance: false,
            sourceState, runId, observedAt: new Date().toISOString(), driverVersion, executableHashes,
            os: { platform: platform(), release: release(), arch: arch() }, visible: configuration.visible === true,
            fixtureSha256: createHash('sha256').update(GITHUB_FIXTURE).digest('hex'),
            screenshot: { file: screenshot, sha256: createHash('sha256').update(png).digest('hex'), inspection: 'separate rendered-image review required' },
            fixtureScope: 'Unauthenticated public GitHub bootstrap, then independently authored inert DOM; no live GitHub mutation or real credential.',
        };
    } catch (error) { failure = error; failedPhase = phase; }
    finally {
        try { if (driver) {
            phase = 'owned-session-cleanup';
            try { await attempt('running'); } finally { await driver.close(); sessionClosed = true; }
        } }
        catch (error) { if (failedPhase === undefined) { failure = error; failedPhase = phase; } }
    }
    // Every normal try completion assigns its receipt; every thrown value records its phase.
    if (failedPhase !== undefined) {
        phase = failedPhase;
        const message = failure instanceof Error ? failure.message : '';
        const reason = /^(?:prerequisite:center:|assertion:center:|webdriver:page:)[a-z0-9-]+$/u.test(message) ? message
            : message === USAGE ? 'usage' : message.startsWith('webdriver:') ? 'native-driver-failure' : 'execution-failed';
        await writeFile(report, JSON.stringify({ schemaVersion: 1, evidence: 'failed', runId, target, sourceRevision, sourceTreeSha256,
            phase, reason, fullH3Acceptance: false, cleanup: driver ? sessionClosed ? 'owned-session-closed' : 'cleanup-unconfirmed' : 'not-created' }, null, 2) + '\n');
        await attempt('failed'); throw new Error(`Center browser verification failed: ${reason}; inspect ${report}`, { cause: failure });
    }
    await writeFile(report, JSON.stringify({ ...receipt, cleanup: 'owned-session-closed' }, null, 2) + '\n');
    phase = 'complete'; await attempt('verified'); console.log(`PASS: ${target} native center component journey; ${report}; full H3 acceptance remains separate.`);
}
export async function centerBrowserEntrypoint(argv: readonly string[], run = centerBrowserMain): Promise<void> {
    if (!argv[1] || path.resolve(argv[1]) !== fileURLToPath(import.meta.url)) return;
    try { await run(argv.slice(2)); } catch (error) { console.error(error instanceof Error ? error.message : 'Center browser verification failed.'); process.exitCode = 1; }
}
await centerBrowserEntrypoint(process.argv);
