import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { platform, release, arch } from 'node:os';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { CONTAINER_ID } from './safari_container.mts';
import { loadedManifestMatches } from './loaded_manifest.mts';
import { validateArtifactSet } from './artifact_validation.mts';
import type { BrowserDriver } from './webdriver.mts';
import { GITHUB_FIXTURE } from '../test/fixtures/github.ts';

export type HarnessTarget = 'chrome' | 'firefox' | 'firefox-esr' | 'safari';
const EXPECTED = { chrome: '156.0.8078.47', firefox: '158.0.1', 'firefox-esr': '153.5.1', safari: '27.0.1' };
export interface HarnessEnvironment { readonly os: string; readonly driver: string; readonly container: string; readonly wait: () => Promise<void> }
export function localHarnessEnvironment(driver: string, container: string): HarnessEnvironment {
    return { os: platform() === 'darwin' ? execFileSync('sw_vers', [], { encoding: 'utf8' }).trim() : `${platform()} ${release()} ${arch()}`,
        driver, container, wait: () => new Promise(resolve => setTimeout(resolve, 100)) };
}
export async function runBrowserHarness(root: string, target: HarnessTarget, driver: BrowserDriver, environment: HarnessEnvironment) {
    const output = path.join(root, 'extension/dist'); await validateArtifactSet(output);
    const receipt = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'));
    const browser = String(driver.capabilities.browserName).toLowerCase(); const version = String(driver.capabilities.browserVersion);
    const assertions: string[] = [];
    const assert = (condition: unknown, name: string) => { if (!condition) throw new Error(`assertion:${name}`); assertions.push(name); };
    assert(version === EXPECTED[target], 'exact-browser-version');
    assert(browser === (target.startsWith('firefox') ? 'firefox' : target), 'actual-browser-engine');
    assert(target !== 'safari' || (environment.os.includes('27.0.1') && environment.os.includes('26A434')
        && environment.container.includes('invalid.extensions.copilot.h2.Extension')), 'actual-safari-container-prerequisite');
    // An unauthenticated public bootstrap establishes the genuine github.com content-script origin.
    // Original HTML then replaces the main DOM via WebDriver; no extension JS/API is injected or mocked.
    await driver.navigate('https://github.com/vypdev/copilot/issues/703');
    await driver.evaluate('document.documentElement.innerHTML = arguments[0]; history.replaceState({}, "", "/octo/example/issues/42"); window.dispatchEvent(new Event("turbo:render"));',
        [GITHUB_FIXTURE.replace(/^<!doctype html><html lang="en">/u, '').replace(/<\/html>$/u, '')]);
    let mounted = false;
    for (let attempt = 0; attempt < 150; attempt++) {
        mounted = await driver.evaluate<boolean>('return !!document.querySelector("[data-copilot-open-settings]");');
        if (mounted) break; await environment.wait();
    }
    assert(mounted, 'packaged-content-entry-loaded');
    for (let attempt = 0; attempt < 30; attempt++) {
        if (await driver.evaluate<number>('return document.querySelectorAll("[data-copilot-runtime]").length;') === 1) break;
        await environment.wait();
    }
    assert(await driver.evaluate<number>('return document.querySelectorAll("[data-copilot-runtime]").length;') === 1, 'original-github-fixture-mounted-once');
    assert(await driver.evaluate<string>('return document.querySelector("[data-copilot-runtime]").dataset.copilotSourceTree;') === receipt.sourceTreeSha256, 'exact-content-build-loaded');
    const original = await driver.evaluate<string>('const draft=document.querySelector("textarea");draft.focus();draft.setSelectionRange(2,9);return draft.value;');
    for (let cycle = 0; cycle < 20; cycle++) {
        await driver.evaluate('history.pushState({}, "", arguments[0]); window.dispatchEvent(new Event("turbo:render"));',
            [cycle % 2 ? '/octo/example/issues/42' : '/octo/example/pull/42']);
    }
    assert(await driver.evaluate<number>('return document.querySelectorAll("[data-copilot-runtime]").length;') === 1, 'twenty-route-cycles-without-duplicates');
    assert(await driver.evaluate<boolean>('const draft=document.querySelector("textarea");return draft.value===arguments[0] && draft.selectionStart===2 && draft.selectionEnd===9 && document.activeElement===draft;', [original]), 'native-draft-selection-and-focus-preserved');
    await driver.evaluate('history.pushState({}, "", "/settings/tokens");window.dispatchEvent(new Event("turbo:render"));');
    assert(await driver.evaluate<number>('return document.querySelectorAll("[data-copilot-runtime]").length;') === 0, 'protected-navigation-disposes-owned-ui');
    await driver.evaluate('history.pushState({}, "", arguments[0]); window.dispatchEvent(new Event("turbo:render"));', ['/octo/example/issues/42']);
    let resumed = false;
    for (let attempt = 0; attempt < 150; attempt++) {
        resumed = await driver.evaluate<number>('return document.querySelectorAll("[data-copilot-runtime]").length;') === 1;
        if (resumed) break; await environment.wait();
    }
    assert(resumed, 'eligible-navigation-resumes-owned-ui');
    const options = await driver.openRuntimeOptions();
    assert(/^(?:chrome-extension|moz-extension|safari-web-extension):\/\/[^/]+\/runtime\.html$(?![\s\S])/u.test(options), 'native-runtime-settings-navigation');
    const native = await driver.evaluate<{ id: string; manifest: unknown; session: boolean }>('const api=globalThis.browser??globalThis.chrome;return {id:api.runtime.id,manifest:api.runtime.getManifest(),session:!!api.storage.session};');
    const matches = loadedManifestMatches(target === 'firefox-esr' ? 'firefox' : target, native.manifest, options.slice(0, -'runtime.html'.length));
    if (!matches) {
        await mkdir(path.join(root, '.tmp/extension-browser-evidence'), { recursive: true });
        await writeFile(path.join(root, '.tmp/extension-browser-evidence', `${target}-manifest.json`), JSON.stringify(native.manifest, null, 2));
    }
    assert(matches, 'exact-generated-manifest-loaded');
    assert(native.id.length > 0 && native.session, 'native-runtime-and-protected-session-api-present');
    assert(target !== 'safari' || [`${CONTAINER_ID}.Extension`, `${CONTAINER_ID}.Extension (UNSIGNED)`].includes(native.id), 'actual-safari-containing-extension-loaded');
    assert(await driver.evaluate<string>('return document.documentElement.dataset.copilotSourceTree;') === receipt.sourceTreeSha256, 'exact-options-build-loaded');
    const state = await driver.evaluateAsync<{ state: string; sourceTree: string }>('const done=arguments[arguments.length-1];(globalThis.browser??globalThis.chrome).runtime.sendMessage({version:1,method:"session.disconnect"}).then(done,()=>done({state:"failed"}));');
    assert(state.sourceTree === receipt.sourceTreeSha256, 'exact-background-build-loaded');
    assert(state.state === 'disconnected', 'explicit-native-session-revocation');
    const rejected = await driver.evaluateAsync<{ state: string }>('const done=arguments[arguments.length-1];(globalThis.browser??globalThis.chrome).runtime.sendMessage({version:1,method:"fetch",url:"https://evil.invalid"}).then(done,()=>done({state:"failed"}));');
    assert(rejected.state === 'rejected', 'closed-message-gateway-rejects-arbitrary-fetch');
    return { schemaVersion: 1, evidence: 'actual-extension-loaded', target, sourceRevision: receipt.sourceRevision,
        sourceTreeSha256: receipt.sourceTreeSha256, artifacts: receipt.targets[target === 'firefox-esr' ? 'firefox' : target],
        fixtureSha256: createHash('sha256').update(GITHUB_FIXTURE).digest('hex'), os: environment.os, browser, version,
        driver: environment.driver, containingApp: environment.container, extensionId: native.id, assertions,
        limitations: ['No real credential or private repository used.', 'Public github.com bootstrap; independently authored DOM fixture; genuine loaded extension APIs.',
            'Provider responses and API floors are separate deterministic suites.', 'Complete product, signing/store release, human UX and full multi-OS matrix remain pending.'] };
}
