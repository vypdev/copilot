import { beforeAll, afterAll, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDevelopmentSet } from '../../tooling/build.mts';
import { buildSafariContainer, CONTAINER_ID, type ContainerCommand } from '../../tooling/safari_container.mts';

let temporary: string;
beforeAll(async () => {
    temporary = await mkdtemp(path.join(tmpdir(), 'copilot-safari-json-project-test-'));
    await buildDevelopmentSet(fileURLToPath(new URL('../../../', import.meta.url)), path.join(temporary, 'extension/dist'));
});
afterAll(async () => { await rm(temporary, { recursive: true, force: true }); });
it('Safari container preparation supports the actual modern converter JSONC layout instead of assuming a PBX project', async () => {
    const target = path.join(temporary, '.tmp/safari-h2/derived/Build/Products/Debug/CopilotH2.app');
    const run: ContainerCommand = async (file, args) => {
        if (file.endsWith('xcrun')) {
            const project = path.join(temporary, '.tmp/safari-h2/project/CopilotH2/CopilotH2.xcodeproj');
            await mkdir(project, { recursive: true });
            await writeFile(path.join(project, 'project.xcproj'), `{
                // Native converter permits trailing commas.
                "targets": [
                    {"name":"CopilotH2","product-type":"application","build-settings":{"PRODUCT_BUNDLE_IDENTIFIER":"invalid.extensions.copilot.CopilotH2","MARKETING_VERSION":"1.0",}},
                    {"name":"CopilotH2 Extension","product-type":"app-extension","build-settings":{"PRODUCT_BUNDLE_IDENTIFIER":"${CONTAINER_ID}.Extension","MARKETING_VERSION":"1.0",}},
                ],
            }`);
            const resources = path.join(target, 'Contents/PlugIns/CopilotH2 Extension.appex/Contents/Resources'); await mkdir(resources, { recursive: true });
            for (const asset of await readdir(path.join(temporary, 'extension/dist/safari'))) await copyFile(path.join(temporary, 'extension/dist/safari', asset), path.join(resources, asset));
        }
        if (file.endsWith('PlistBuddy')) return args[1].includes('ShortVersion') ? '0.1.0' : args[2].includes('.appex') ? `${CONTAINER_ID}.Extension` : CONTAINER_ID;
        if (file.endsWith('pluginkit')) return `${CONTAINER_ID}.Extension ${target}`;
        return '';
    };
    expect(await buildSafariContainer(temporary, run)).toBe(target);
});
