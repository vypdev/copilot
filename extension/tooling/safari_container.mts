import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { assetHashes, validateArtifactSet } from './artifact_validation.mts';
import { isDeepStrictEqual } from 'node:util';

const execute = promisify(execFile);
export type ContainerCommand = (file: string, args: readonly string[]) => Promise<string>;
const command: ContainerCommand = async (file, args) => (await execute(file, [...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
export const CONTAINER_ID = 'invalid.extensions.copilot.h2';
export async function verifySafariContainer(root: string, app: string, run: ContainerCommand = command) {
    const output = path.join(root, 'extension/dist'); await validateArtifactSet(output);
    const build = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'));
    const extension = path.join(app, 'Contents/PlugIns/CopilotH2 Extension.appex');
    const resources = path.join(extension, 'Contents/Resources');
    // Apple's generated app may add localized non-executable assets; verify every declared web resource exactly.
    const expected = Object.keys(build.targets.safari);
    const selected = new Map(await Promise.all(expected.map(async name => [name, await readFile(path.join(resources, name), 'utf8')] as const)));
    if (!isDeepStrictEqual(assetHashes(selected), build.targets.safari)) throw new Error('prerequisite:safari-container-resources-stale');
    const plist = (bundle: string, key: string) => run('/usr/libexec/PlistBuddy', ['-c', `Print:${key}`, path.join(bundle, 'Contents/Info.plist')]);
    const appId = (await plist(app, 'CFBundleIdentifier')).trim();
    const extensionId = (await plist(extension, 'CFBundleIdentifier')).trim();
    const version = (await plist(app, 'CFBundleShortVersionString')).trim();
    if (appId !== CONTAINER_ID || extensionId !== `${CONTAINER_ID}.Extension` || version !== '0.1.0') throw new Error('prerequisite:safari-containing-app-identity');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const registration = await run('/usr/bin/pluginkit', ['-m', '-A', '-D', '-v', '-p', 'com.apple.Safari.web-extension']);
    if (!registration.includes(extensionId) || !registration.includes(app)) throw new Error('prerequisite:safari-container-not-registered');
    return { appId, extensionId, version, xcode: (await run('/usr/bin/xcodebuild', ['-version'])).trim(),
        sourceTreeSha256: build.sourceTreeSha256, resources: build.targets.safari,
        signature: 'local-ad-hoc-development-only', distribution: false };
}
export async function buildSafariContainer(root: string, run: ContainerCommand = command): Promise<string> {
    const output = path.join(root, 'extension/dist'); await validateArtifactSet(output);
    const workspace = path.join(root, '.tmp/safari-h2'); await mkdir(workspace, { recursive: true });
    const project = path.join(workspace, 'project/CopilotH2/CopilotH2.xcodeproj');
    const derived = path.join(workspace, 'derived');
    const app = path.join(derived, 'Build/Products/Debug/CopilotH2.app');
    await run('/usr/bin/xcrun', ['safari-web-extension-converter', path.join(output, 'safari'), '--project-location', path.join(workspace, 'project'),
        '--app-name', 'CopilotH2', '--bundle-identifier', CONTAINER_ID, '--macos-only', '--swift', '--copy-resources', '--no-open', '--no-prompt', '--force']);
    const file = path.join(project, 'project.pbxproj'); const source = await readFile(file, 'utf8');
    await writeFile(file, source.replaceAll('invalid.extensions.copilot.CopilotH2', CONTAINER_ID).replaceAll('MARKETING_VERSION = 1.0;', 'MARKETING_VERSION = 0.1.0;'));
    const log = await run('/usr/bin/xcodebuild', ['-project', project, '-scheme', 'CopilotH2', '-configuration', 'Debug', '-derivedDataPath', derived,
        'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=', 'build']);
    await writeFile(path.join(workspace, 'build.log'), log);
    await run('/usr/bin/open', [app]);
    const receipt = await verifySafariContainer(root, app, run);
    const receiptPath = path.join(workspace, 'container.json'); await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
    return app;
}
