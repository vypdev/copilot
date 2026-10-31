import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { assetHashes, validateArtifactSet } from './artifact_validation.mts';
import { isDeepStrictEqual } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { safariContainerProfile, type SafariContainerKind } from './safari_profile.mts';
import { prepareSafariProject, type SafariProjectFormat } from './safari_generated_project.mts';

const execute = promisify(execFile);
export type ContainerCommand = (file: string, args: readonly string[]) => Promise<string>;
const command: ContainerCommand = async (file, args) => (await execute(file, [...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
export const CONTAINER_ID = 'invalid.extensions.copilot.h2';
export const CENTER_CONTAINER_ID = 'invalid.extensions.copilot.h3';
export async function verifySafariContainer(root: string, app: string, run: ContainerCommand = command, kind: SafariContainerKind = 'h2') {
    const profile = safariContainerProfile(kind);
    const output = path.join(root, 'extension/dist'); await validateArtifactSet(output);
    const build = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'));
    const extension = path.join(app, `Contents/PlugIns/${profile.appName} Extension.appex`);
    const resources = path.join(extension, 'Contents/Resources');
    // Apple's generated app may add localized non-executable assets; verify every declared web resource exactly.
    const expected = Object.keys(build.targets.safari);
    const selected = new Map(await Promise.all(expected.map(async name => [name, await readFile(path.join(resources, name), 'utf8')] as const)));
    if (!isDeepStrictEqual(assetHashes(selected), build.targets.safari)) throw new Error('prerequisite:safari-container-resources-stale');
    const plist = (bundle: string, key: string) => run('/usr/libexec/PlistBuddy', ['-c', `Print:${key}`, path.join(bundle, 'Contents/Info.plist')]);
    const appId = (await plist(app, 'CFBundleIdentifier')).trim();
    const extensionId = (await plist(extension, 'CFBundleIdentifier')).trim();
    const version = (await plist(app, 'CFBundleShortVersionString')).trim();
    if (appId !== profile.identifier || extensionId !== `${profile.identifier}.Extension` || version !== '0.1.0') throw new Error('prerequisite:safari-containing-app-identity');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    const registration = await run('/usr/bin/pluginkit', ['-m', '-A', '-D', '-v', '-p', 'com.apple.Safari.web-extension']);
    if (!registration.includes(extensionId) || !registration.includes(app)) throw new Error('prerequisite:safari-container-not-registered');
    return { appId, extensionId, version, xcode: (await run('/usr/bin/xcodebuild', ['-version'])).trim(),
        sourceTreeSha256: build.sourceTreeSha256, resources: build.targets.safari,
        signature: 'local-ad-hoc-development-only', distribution: false };
}
export async function buildSafariContainer(root: string, run: ContainerCommand = command, kind: SafariContainerKind = 'h2'): Promise<string> {
    const profile = safariContainerProfile(kind);
    const output = path.join(root, 'extension/dist');
    const workspace = path.join(root, '.tmp', profile.folder);
    try { if (!(await lstat(workspace)).isDirectory()) throw new Error('prerequisite:safari-workspace-not-regular'); }
    catch (error) { if ((error as NodeJS.ErrnoException | null)?.code !== 'ENOENT') throw error; await mkdir(workspace, { recursive: true }); }
    const project = path.join(workspace, 'project', profile.appName, `${profile.appName}.xcodeproj`);
    const derived = path.join(workspace, 'derived');
    const app = path.join(derived, `Build/Products/Debug/${profile.appName}.app`);
    let phase = 'artifact-validation'; let projectFormat: SafariProjectFormat | undefined; let sourceTreeSha256: string | null = null;
    const attempt = (state: 'building' | 'failed' | 'verified') => writeFile(path.join(workspace, 'attempt.json'), JSON.stringify({
        schemaVersion: 1, state, phase, profile: kind, sourceTreeSha256, projectFormat, distribution: false,
    }, null, 2) + '\n');
    await attempt('building');
    try {
        await validateArtifactSet(output); sourceTreeSha256 = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8')).sourceTreeSha256;
        phase = 'conversion'; await attempt('building');
        await run('/usr/bin/xcrun', ['safari-web-extension-converter', path.join(output, 'safari'), '--project-location', path.join(workspace, 'project'),
            '--app-name', profile.appName, '--bundle-identifier', profile.identifier, '--macos-only', '--swift', '--copy-resources', '--no-open', '--no-prompt', '--force']);
        phase = 'project-normalization'; await attempt('building'); projectFormat = await prepareSafariProject(project, kind);
        phase = 'compilation'; await attempt('building');
        const log = await run('/usr/bin/xcodebuild', ['-project', project, '-scheme', profile.appName, '-configuration', 'Debug', '-derivedDataPath', derived,
            'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=', 'build']);
        await writeFile(path.join(workspace, 'build.log'), log);
        phase = 'registration'; await attempt('building'); await run('/usr/bin/open', [app]);
        phase = 'verification'; await attempt('building'); const receipt = await verifySafariContainer(root, app, run, kind);
        await writeFile(path.join(workspace, 'container.json'), JSON.stringify({ ...receipt, profile: kind, projectFormat }, null, 2) + '\n');
        phase = 'complete'; await attempt('verified'); return app;
    } catch (error) {
        const failure = error as { stdout?: unknown; stderr?: unknown } | null;
        const bytes = Buffer.from([failure?.stdout, failure?.stderr].filter(value => typeof value === 'string').join('\n'), 'utf8');
        const captured = new StringDecoder('utf8').write(bytes.subarray(0, 4 * 1024 * 1024));
        await writeFile(path.join(workspace, 'build.log'), captured || (phase === 'compilation' ? 'Xcode build failed without captured output.\n'
            : `Safari preparation failed during ${phase} without captured output.\n`));
        await attempt('failed');
        throw error;
    }
}
