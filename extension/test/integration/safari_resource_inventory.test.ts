import { beforeAll, beforeEach, afterAll, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { verifySafariContainer, type ContainerCommand } from '../../tooling/safari_container.mts';

let root: string; let app: string; let resources: string;
beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'copilot-safari-resource-inventory-'));
    await buildDevelopmentSet(fileURLToPath(new URL('../../../', import.meta.url)), path.join(root, 'extension/dist'));
    app = path.join(root, 'CopilotH3.app'); resources = path.join(app, 'Contents/PlugIns/CopilotH3 Extension.appex/Contents/Resources');
}, 60000);
beforeEach(async () => {
    await rm(resources, { recursive: true, force: true }); await mkdir(path.dirname(resources), { recursive: true });
    await cp(path.join(root, 'extension/dist/safari'), resources, { recursive: true });
});
afterAll(async () => { await rm(root, { recursive: true, force: true }); });
// Real resource filesystem; native command boundary is a deterministic fixture, never native acceptance.
function commands(): ContainerCommand {
    return vi.fn(async (file, args) => {
        if (file.endsWith('PlistBuddy')) return args[1].includes('ShortVersion') ? '0.1.0'
            : args[2].includes('.appex') ? 'invalid.extensions.copilot.h3.Extension' : 'invalid.extensions.copilot.h3';
        if (file.endsWith('pluginkit')) return `invalid.extensions.copilot.h3.Extension ${app}`;
        if (file.endsWith('xcodebuild')) return 'Xcode 27.2'; return '';
    });
}
it('rejects an undeclared historical web chunk even when all declared resources still match their exact hashes', async () => {
    await writeFile(path.join(resources, 'center-DataPage-0000000000000000.js'), 'export const historicalView = true;');
    const run = commands(); await expect(verifySafariContainer(root, app, run, 'h3')).rejects.toThrow('resources-extra');
    expect(run).not.toHaveBeenCalled();
});
it('rejects an undeclared web chunk hidden inside an otherwise permitted native localization folder', async () => {
    await mkdir(path.join(resources, 'en.lproj')); await writeFile(path.join(resources, 'en.lproj/old.js'), 'export {};');
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-extra');
});
it('rejects a declared resource symlink instead of following it even when its destination contains matching bytes', async () => {
    const file = path.join(resources, 'content.js'); const outside = path.join(root, 'outside-content.js');
    await writeFile(outside, await readFile(file)); await rm(file); await symlink(outside, file);
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-boundary');
});
it('allows regular generated native localization metadata without treating it as a declared web asset', async () => {
    await mkdir(path.join(resources, 'en.lproj')); await writeFile(path.join(resources, 'en.lproj/InfoPlist.strings'), '"CFBundleDisplayName" = "Copilot";');
    const result = await verifySafariContainer(root, app, commands(), 'h3');
    expect(result.resources).not.toHaveProperty('en.lproj/InfoPlist.strings'); expect(result.distribution).toBe(false);
});
it('allows the regular native compiled asset catalog while keeping every web resource bound to the source receipt', async () => {
    await writeFile(path.join(resources, 'Assets.car'), new Uint8Array([0, 1, 2, 3]));
    const result = await verifySafariContainer(root, app, commands(), 'h3');
    expect(result.resources).not.toHaveProperty('Assets.car'); expect(result.sourceTreeSha256).toMatch(/^[a-f0-9]{64}$/u);
});
it('refuses a resource-root symlink instead of accepting a matching web tree outside the containing app', async () => {
    await rm(resources, { recursive: true }); await symlink(path.join(root, 'extension/dist/safari'), resources, 'dir');
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-boundary');
});
it('refuses a nested directory inside native localization metadata', async () => {
    await mkdir(path.join(resources, 'en.lproj/old'), { recursive: true });
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-boundary');
});
it('refuses an undeclared root directory instead of recursively trusting arbitrary resources', async () => {
    await mkdir(path.join(resources, 'old-web-runtime'));
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-boundary');
});
it('refuses a missing declared web resource before native identity or signature calls', async () => {
    await rm(path.join(resources, 'runtime.js')); const run = commands();
    await expect(verifySafariContainer(root, app, run, 'h3')).rejects.toThrow('resources-stale'); expect(run).not.toHaveBeenCalled();
});
it('rejects malformed UTF-8 in a declared resource rather than hashing replacement characters', async () => {
    await writeFile(path.join(resources, 'content.js'), new Uint8Array([0xc3, 0x28]));
    await expect(verifySafariContainer(root, app, commands(), 'h3')).rejects.toThrow('resources-boundary');
});
