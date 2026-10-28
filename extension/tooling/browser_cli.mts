import { fileURLToPath } from 'node:url';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { verifySafariContainer } from './safari_container.mts';
import { NativeDriver, type DriverConfiguration } from './webdriver.mts';
import { runBrowserHarness, localHarnessEnvironment, type HarnessTarget } from './runtime_harness.mts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
export function browserConfiguration(root: string, target: string, environment: NodeJS.ProcessEnv): DriverConfiguration {
    if (!['chrome', 'firefox', 'firefox-esr', 'safari'].includes(target)) throw new Error('Usage: test:browsers chrome|firefox|firefox-esr|safari');
    const key = target.replace('-', '_').toUpperCase();
    const driver = target === 'safari' ? '/usr/bin/safaridriver' : environment[`COPILOT_H2_${key}_DRIVER`];
    const binary = target === 'safari' ? '/Applications/Safari.app/Contents/MacOS/Safari' : environment[`COPILOT_H2_${key}_BINARY`];
    if (!driver || !binary || !path.isAbsolute(driver) || !path.isAbsolute(binary)) throw new Error(`prerequisite:explicit-${target}-binary-and-driver`);
    const artifact = target === 'safari' ? path.join(environment.COPILOT_H2_SAFARI_APP
        ?? path.join(root, '.tmp/safari-h2/derived/Build/Products/Debug/CopilotH2.app'), 'Contents/PlugIns/CopilotH2 Extension.appex/Contents/Resources')
        : path.join(root, 'extension/dist', target === 'firefox-esr' ? 'firefox' : target);
    return { target: target as HarnessTarget, driver, binary, artifact };
}
export async function browserMain(args: readonly string[], root = ROOT, environment = process.env): Promise<void> {
    const target = args[0] ?? 'missing';
    const output = path.join(root, '.tmp/extension-browser-evidence'); await mkdir(output, { recursive: true });
    let driver: NativeDriver | undefined;
    let phase = 'prerequisites';
    try {
        if (args.length !== 1) throw new Error('Usage: test:browsers chrome|firefox|firefox-esr|safari');
        const configuration = browserConfiguration(root, target, environment);
        const container = target === 'safari' ? JSON.stringify(await verifySafariContainer(root, environment.COPILOT_H2_SAFARI_APP
            ?? path.join(root, '.tmp/safari-h2/derived/Build/Products/Debug/CopilotH2.app'))) : '';
        driver = new NativeDriver(configuration); phase = 'native-driver-start'; await driver.start();
        phase = 'driver-identity';
        const driverVersion = execFileSync(configuration.driver, ['--version'], { encoding: 'utf8' }).split('\n')[0];
        phase = 'extension-loaded-assertions';
        const receipt = await runBrowserHarness(root, target as HarnessTarget, driver, localHarnessEnvironment(driverVersion, container));
        phase = 'native-driver-cleanup'; await driver.close(); driver = undefined;
        await rm(path.join(output, `${target}-failed.json`), { force: true });
        await writeFile(path.join(output, `${target}.json`), `${JSON.stringify(receipt, null, 2)}\n`);
        console.log(`PASS: ${target}; actual extension loaded; receipt ${path.join(output, `${target}.json`)}`);
    } catch (error) {
        const reason = error instanceof Error && /^(?:prerequisite:|assertion:|Usage:|webdriver:)/u.test(error.message) ? error.message : 'browser-execution-failed';
        const receipt = { schemaVersion: 1, evidence: 'failed', target: ['chrome', 'firefox', 'firefox-esr', 'safari'].includes(target) ? target : 'unknown', reason,
            substitution: 'none', acceptance: false, phase,
            errorCategory: error instanceof Error && ['TypeError', 'TimeoutError', 'AbortError', 'Error'].includes(error.name) ? error.name : 'unknown',
            providerCode: error !== null && typeof error === 'object' && 'code' in error && ['ENOENT', 'EACCES', 'ENOTEMPTY', 'EBUSY', 'ECONNREFUSED'].includes(String(error.code)) ? String(error.code) : undefined };
        await rm(path.join(output, `${receipt.target}.json`), { force: true });
        await writeFile(path.join(output, `${receipt.target}-failed.json`), `${JSON.stringify(receipt, null, 2)}\n`);
        throw new Error(`Browser acceptance failed: ${reason}; inspect ${output}`, { cause: error });
    } finally { await driver?.close(); }
}
export async function browserEntrypoint(argv: readonly string[]): Promise<void> {
    if (!argv[1] || path.resolve(argv[1]) !== fileURLToPath(import.meta.url)) return;
    try { await browserMain(argv.slice(2)); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}
await browserEntrypoint(process.argv);
