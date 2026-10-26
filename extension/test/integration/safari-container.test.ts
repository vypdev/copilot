import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { buildSafariContainer, verifySafariContainer, CONTAINER_ID, type ContainerCommand } from '../../tooling/safari_container.mts';
import { safariEntrypoint } from '../../tooling/safari_cli.mts';

const root = fileURLToPath(new URL('../../../', import.meta.url)); let temporary: string; let app: string;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-h2-safari-container-unit-'));
    await buildDevelopmentSet(root, path.join(temporary, 'extension/dist')); app = path.join(temporary, 'CopilotH2.app');
    const resources = path.join(app, 'Contents/PlugIns/CopilotH2 Extension.appex/Contents/Resources'); await mkdir(resources, { recursive: true });
    for (const file of ['background.js', 'content.js', 'manifest.json', 'runtime.html', 'runtime.js']) await copyFile(path.join(temporary, 'extension/dist/safari', file), path.join(resources, file));
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });
function commands(): ContainerCommand {
    return vi.fn(async (file, args) => {
        if (file.endsWith('PlistBuddy')) return args[1].includes('ShortVersion') ? '0.1.0' : args[2].includes('.appex') ? `${CONTAINER_ID}.Extension` : CONTAINER_ID;
        if (file.endsWith('pluginkit')) return `${CONTAINER_ID}.Extension ${app}`;
        if (file.endsWith('xcodebuild')) return 'Xcode 27.1 build 25183.120.5';
        return '';
    });
}
it('github-browser-extension-runtime-C35/github-browser-extension-runtime-C37 verifies native containing-app identity, local code signature, registration and exact embedded resources', async () => {
    const run = commands(); const receipt = await verifySafariContainer(temporary, app, run);
    expect(receipt).toMatchObject({ appId: CONTAINER_ID, extensionId: `${CONTAINER_ID}.Extension`, version: '0.1.0', distribution: false });
    expect(receipt.sourceTreeSha256).toMatch(/^[a-f\d]{64}$/u);
    expect(run).toHaveBeenCalledWith('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
});
it('github-browser-extension-runtime-C36 refuses stale resources, mismatched identities, absent registration and unavailable native prerequisites', async () => {
    const resource = path.join(app, 'Contents/PlugIns/CopilotH2 Extension.appex/Contents/Resources/content.js'); const original = await readFile(resource);
    try { await writeFile(resource, 'changed'); await expect(verifySafariContainer(temporary, app, commands())).rejects.toThrow('resources-stale'); }
    finally { await writeFile(resource, original); }
    for (const wrong of ['app', 'extension', 'version', 'registration']) {
        const normal = commands(); const run: ContainerCommand = async (file, args) => {
            if (file.endsWith('PlistBuddy') && ((wrong === 'app' && !args[2].includes('.appex') && args[1].includes('Identifier'))
                || (wrong === 'extension' && args[2].includes('.appex')) || (wrong === 'version' && args[1].includes('ShortVersion')))) return 'wrong';
            if (wrong === 'registration' && file.endsWith('pluginkit')) return '';
            return normal(file, args);
        };
        await expect(verifySafariContainer(temporary, app, run)).rejects.toThrow('prerequisite:');
    }
    await expect(verifySafariContainer(temporary, app)).rejects.toThrow();
});
it('github-browser-extension-runtime-C35 builds the real converter/Xcode command plan and binds a receipt to the actual embedded resources', async () => {
    const target = path.join(temporary, '.tmp/safari-h2/derived/Build/Products/Debug/CopilotH2.app');
    const run: ContainerCommand = vi.fn(async (file, args) => {
        if (file.endsWith('xcrun')) {
            const project = path.join(temporary, '.tmp/safari-h2/project/CopilotH2/CopilotH2.xcodeproj'); await mkdir(project, { recursive: true });
            await writeFile(path.join(project, 'project.pbxproj'), 'invalid.extensions.copilot.CopilotH2 MARKETING_VERSION = 1.0;');
            const resources = path.join(target, 'Contents/PlugIns/CopilotH2 Extension.appex/Contents/Resources'); await mkdir(resources, { recursive: true });
            for (const asset of ['background.js', 'content.js', 'manifest.json', 'runtime.html', 'runtime.js']) await copyFile(path.join(temporary, 'extension/dist/safari', asset), path.join(resources, asset));
        }
        if (file.endsWith('pluginkit')) return `${CONTAINER_ID}.Extension ${target}`;
        return commands()(file, args);
    });
    expect(await buildSafariContainer(temporary, run)).toBe(target);
    expect(await readFile(path.join(temporary, '.tmp/safari-h2/project/CopilotH2/CopilotH2.xcodeproj/project.pbxproj'), 'utf8')).toContain('MARKETING_VERSION = 0.1.0;');
    expect(JSON.parse(await readFile(path.join(temporary, '.tmp/safari-h2/container.json'), 'utf8'))).toMatchObject({ distribution: false });
    const fail: ContainerCommand = async () => { throw new Error('native-prerequisite'); };
    await expect(buildSafariContainer(temporary, fail)).rejects.toThrow('native-prerequisite');
});
it('Safari CLI preserves import inertness, reports local app path only after build, and marks missing prerequisites as failure', async () => {
    const entry = fileURLToPath(new URL('../../tooling/safari_cli.mts', import.meta.url));
    const build = vi.fn(async () => app); const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined); const previous = process.exitCode;
    await safariEntrypoint([], build); await safariEntrypoint(['node', '/other'], build); expect(build).not.toHaveBeenCalled();
    await safariEntrypoint(['node', entry], build); expect(log).toHaveBeenCalled();
    await safariEntrypoint(['node', entry, 'unexpected'], build); expect(process.exitCode).toBe(1);
    await safariEntrypoint(['node', entry], async () => { throw new Error('private raw error'); });
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining('private raw error')); process.exitCode = previous; log.mockRestore(); error.mockRestore();
});

it('failed Xcode builds replace any stale success log with bounded captured diagnostics or an explicit unavailable-log fact', async () => {
    const project = path.join(temporary, '.tmp/safari-h2/project/CopilotH2/CopilotH2.xcodeproj'); await mkdir(project, { recursive: true });
    for (const failure of [Object.assign(new Error('build-failed'), { stdout: 'compiler output', stderr: 'compiler diagnostic' }), null, { stdout: 42, stderr: 'x'.repeat(4 * 1024 * 1024 + 1) }]) {
        await writeFile(path.join(project, 'project.pbxproj'), 'invalid.extensions.copilot.CopilotH2 MARKETING_VERSION = 1.0;');
        const run: ContainerCommand = async (file, args) => {
            if (file.endsWith('xcodebuild')) throw failure;
            return commands()(file, args);
        };
        await expect(buildSafariContainer(temporary, run)).rejects.toBe(failure);
        const log = await readFile(path.join(temporary, '.tmp/safari-h2/build.log'), 'utf8');
        expect(log.length).toBeLessThanOrEqual(4 * 1024 * 1024);
        expect(log).toBe(failure === null ? 'Xcode build failed without captured output.\n' : failure instanceof Error ? 'compiler output\ncompiler diagnostic' : 'x'.repeat(4 * 1024 * 1024));
    }
});
