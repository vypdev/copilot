import { vi } from 'vitest';
import { mkdir, writeFile, readFile, readdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import type { ContainerCommand } from '../../tooling/safari_container.mts';

/** Command-plan fixture only: native build, signature and registration evidence are separate. */
export function safariH3Build(root: string, format: 'jsonc' | 'pbx' = 'jsonc') {
    const workspace = path.join(root, '.tmp/safari-h3'); let project = '';
    const app = path.join(workspace, 'derived/Build/Products/Debug/CopilotH3.app');
    let appId = ''; let extensionId = ''; let version = '';
    const execute: ContainerCommand = vi.fn(async (file, args) => {
        if (file.endsWith('xcrun')) {
            project = path.join(args[args.indexOf('--project-location') + 1], 'CopilotH3/CopilotH3.xcodeproj');
            await mkdir(project, { recursive: true });
            await writeFile(path.join(project, format === 'jsonc' ? 'project.xcproj' : 'project.pbxproj'), format === 'jsonc' ? JSON.stringify({ targets: [
                { name: 'CopilotH3', 'product-type': 'application', 'build-settings': { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.CopilotH3', MARKETING_VERSION: '1.0' } },
                { name: 'CopilotH3 Extension', 'product-type': 'app-extension', 'build-settings': { PRODUCT_BUNDLE_IDENTIFIER: 'invalid.extensions.copilot.h3.Extension', MARKETING_VERSION: '1.0' } },
            ] }) : 'APP = invalid.extensions.copilot.CopilotH3; EXT = invalid.extensions.copilot.h3.Extension; MARKETING_VERSION = 1.0;');
        }
        if (file.endsWith('xcodebuild') && args.includes('build')) {
            if (format === 'jsonc') {
                const value = JSON.parse(await readFile(path.join(project, 'project.xcproj'), 'utf8'));
                appId = value.targets[0]['build-settings'].PRODUCT_BUNDLE_IDENTIFIER; extensionId = value.targets[1]['build-settings'].PRODUCT_BUNDLE_IDENTIFIER;
                version = value.targets[0]['build-settings'].MARKETING_VERSION;
            } else {
                const value = await readFile(path.join(project, 'project.pbxproj'), 'utf8');
                appId = /APP = ([^;]+);/u.exec(value)![1]; extensionId = /EXT = ([^;]+);/u.exec(value)![1]; version = /MARKETING_VERSION = ([^;]+);/u.exec(value)![1];
            }
            const candidate = path.join(args[args.indexOf('-derivedDataPath') + 1], 'Build/Products/Debug/CopilotH3.app');
            const resources = path.join(candidate, 'Contents/PlugIns/CopilotH3 Extension.appex/Contents/Resources'); await mkdir(resources, { recursive: true });
            for (const asset of await readdir(path.join(root, 'extension/dist/safari'))) await copyFile(path.join(root, 'extension/dist/safari', asset), path.join(resources, asset));
            return 'Actual native compilation is not performed by this deterministic command fixture.';
        }
        if (file.endsWith('PlistBuddy')) return args[1].includes('ShortVersion') ? version : args[2].includes('.appex') ? extensionId : appId;
        if (file.endsWith('pluginkit')) return `${extensionId} ${app}`;
        return '';
    });
    return { execute, workspace, get project() { return project; }, app, attempt: async () => JSON.parse(await readFile(path.join(workspace, 'attempt.json'), 'utf8')) };
}
