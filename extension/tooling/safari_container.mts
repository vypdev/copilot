import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { assetHashes, validateArtifactSet } from './artifact_validation.mts';
import { isDeepStrictEqual } from 'node:util';
import { StringDecoder } from 'node:string_decoder';
import { safariContainerProfile, type SafariContainerKind } from './safari_profile.mts';
import { prepareSafariProject, type SafariProjectFormat } from './safari_generated_project.mts';
import { readSafariResources } from './safari_resources.mts';
import { prepareSafariBuildPaths, withSafariBuildLock, writeSafariEvidence } from './safari_build_paths.mts';
import { replaceCompleteSet } from './build.mts';
import { PublishedCleanupError } from './gate_error.mts';

const execute = promisify(execFile);
export type ContainerCommand = (file: string, args: readonly string[]) => Promise<string>;
const command: ContainerCommand = async (file, args) => (await execute(file, [...args], { maxBuffer: 4 * 1024 * 1024 })).stdout;
export const CONTAINER_ID = 'invalid.extensions.copilot.h2';
export const CENTER_CONTAINER_ID = 'invalid.extensions.copilot.h3';
async function inspectSafariCandidate(root: string, app: string, run: ContainerCommand, kind: SafariContainerKind) {
    const profile = safariContainerProfile(kind);
    const output = path.join(root, 'extension/dist'); await validateArtifactSet(output);
    const build = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8'));
    const extension = path.join(app, `Contents/PlugIns/${profile.appName} Extension.appex`);
    const resources = path.join(extension, 'Contents/Resources');
    const selected = await readSafariResources(resources, Object.keys(build.targets.safari));
    if (!isDeepStrictEqual(assetHashes(selected), build.targets.safari)) throw new Error('prerequisite:safari-container-resources-stale');
    const plist = (bundle: string, key: string) => run('/usr/libexec/PlistBuddy', ['-c', `Print:${key}`, path.join(bundle, 'Contents/Info.plist')]);
    const appId = (await plist(app, 'CFBundleIdentifier')).trim();
    const extensionId = (await plist(extension, 'CFBundleIdentifier')).trim();
    const version = (await plist(app, 'CFBundleShortVersionString')).trim();
    if (appId !== profile.identifier || extensionId !== `${profile.identifier}.Extension` || version !== '0.1.0') throw new Error('prerequisite:safari-containing-app-identity');
    await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
    return { appId, extensionId, version, sourceTreeSha256: build.sourceTreeSha256, resources: build.targets.safari };
}
export async function verifySafariContainer(root: string, app: string, run: ContainerCommand = command, kind: SafariContainerKind = 'h2') {
    const inspected = await inspectSafariCandidate(root, app, run, kind);
    const registration = await run('/usr/bin/pluginkit', ['-m', '-A', '-D', '-v', '-p', 'com.apple.Safari.web-extension']);
    if (!registration.includes(inspected.extensionId) || !registration.includes(app)) throw new Error('prerequisite:safari-container-not-registered');
    return { ...inspected, xcode: (await run('/usr/bin/xcodebuild', ['-version'])).trim(),
        signature: 'local-ad-hoc-development-only', distribution: false };
}
export async function buildSafariContainer(root: string, run: ContainerCommand = command, kind: SafariContainerKind = 'h2'): Promise<string> {
    const paths = await prepareSafariBuildPaths(root, kind);
    return withSafariBuildLock(paths.workspace, () => buildSafariCandidate(root, run, kind, paths));
}
async function buildSafariCandidate(root: string, run: ContainerCommand, kind: SafariContainerKind,
    { profile, workspace, app }: Awaited<ReturnType<typeof prepareSafariBuildPaths>>): Promise<string> {
    const output = path.join(root, 'extension/dist');
    let phase = 'artifact-validation'; let projectFormat: SafariProjectFormat | undefined; let sourceTreeSha256: string | null = null;
    let staging: string | undefined; let appReplaced = false; let cleanup: 'not-created' | 'pending' | 'complete' | 'failed' = 'not-created';
    let failed = false; let failure: unknown; let receipt: Awaited<ReturnType<typeof verifySafariContainer>> | undefined;
    const attempt = (state: 'building' | 'failed' | 'verified') => writeSafariEvidence(path.join(workspace, 'attempt.json'), JSON.stringify({
        schemaVersion: 1, state, phase, profile: kind, sourceTreeSha256, projectFormat, appReplaced, cleanup, distribution: false,
    }, null, 2) + '\n');
    await attempt('building');
    try {
        await validateArtifactSet(output); sourceTreeSha256 = JSON.parse(await readFile(path.join(output, 'receipt.json'), 'utf8')).sourceTreeSha256;
        staging = await mkdtemp(path.join(workspace, 'candidate-')); cleanup = 'pending';
        const projectRoot = path.join(staging, 'project'); const derived = path.join(staging, 'derived');
        const project = path.join(projectRoot, profile.appName, `${profile.appName}.xcodeproj`);
        const candidate = path.join(derived, `Build/Products/Debug/${profile.appName}.app`);
        phase = 'conversion'; await attempt('building');
        await run('/usr/bin/xcrun', ['safari-web-extension-converter', path.join(output, 'safari'), '--project-location', projectRoot,
            '--app-name', profile.appName, '--bundle-identifier', profile.identifier, '--macos-only', '--swift', '--copy-resources', '--no-open', '--no-prompt', '--force']);
        phase = 'project-normalization'; await attempt('building'); projectFormat = await prepareSafariProject(project, kind);
        phase = 'compilation'; await attempt('building');
        const log = await run('/usr/bin/xcodebuild', ['-project', project, '-scheme', profile.appName, '-configuration', 'Debug', '-derivedDataPath', derived,
            'CODE_SIGN_IDENTITY=-', 'CODE_SIGNING_ALLOWED=YES', 'CODE_SIGN_STYLE=Manual', 'DEVELOPMENT_TEAM=', 'build']);
        await writeSafariEvidence(path.join(workspace, 'build.log'), log);
        phase = 'candidate-verification'; await attempt('building'); await inspectSafariCandidate(root, candidate, run, kind);
        phase = 'publication'; await attempt('building'); await replaceCompleteSet(candidate, app); appReplaced = true;
        phase = 'registration'; await attempt('building'); await run('/usr/bin/open', [app]);
        phase = 'verification'; await attempt('building'); receipt = await verifySafariContainer(root, app, run, kind);
    } catch (error) {
        failed = true; failure = error; if (error instanceof PublishedCleanupError) appReplaced = true;
    } finally {
        if (staging) {
            try { await rm(staging, { recursive: true, force: true }); cleanup = 'complete'; }
            catch (error) { cleanup = 'failed'; if (!failed) { failed = true; failure = error; phase = 'staging-cleanup'; } }
        }
    }
    if (!failed) {
        try {
            phase = 'receipt-publication'; await attempt('building');
            await writeSafariEvidence(path.join(workspace, 'container.json'), JSON.stringify({ ...receipt, profile: kind, projectFormat }, null, 2) + '\n');
            phase = 'complete'; await attempt('verified');
        } catch (error) { failed = true; failure = error; phase = 'receipt-publication'; }
    }
    if (failed) {
        const detail = failure as { stdout?: unknown; stderr?: unknown } | null;
        const bytes = Buffer.from([detail?.stdout, detail?.stderr].filter(value => typeof value === 'string').join('\n'), 'utf8');
        const captured = new StringDecoder('utf8').write(bytes.subarray(0, 4 * 1024 * 1024));
        await writeSafariEvidence(path.join(workspace, 'build.log'), captured || (phase === 'compilation' ? 'Xcode build failed without captured output.\n'
            : `Safari preparation failed during ${phase} without captured output.\n`));
        await attempt('failed');
        throw failure;
    }
    return app;
}
