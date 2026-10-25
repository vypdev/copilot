import { build as viteBuild } from 'vite';
import { mkdir, mkdtemp, readFile, rename, rm, writeFile, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { TARGETS, TARGET_POLICY, type BrowserTarget } from '../src/domain/target.ts';
import { targetManifest } from '../src/infrastructure/target_manifests.ts';
import { readSources } from './source_graph.mts';
import { validateArchitecture } from './architecture_validation.mts';
import { assetHashes, readTarget, validateTarget, validateArtifactSet } from './artifact_validation.mts';
import { FoundationGateError, PublishedCleanupError } from './gate_error.mts';

export type BundlePort = (target: BrowserTarget, output: string) => Promise<void>;
interface BuildEnvironment {
    revision?: () => string;
    publish?: (staging: string, output: string) => Promise<void>;
}
interface PublishPort {
    rename: (from: string, to: string) => Promise<void>;
    rm: (file: string, options: { recursive: boolean }) => Promise<void>;
    lstat: (file: string) => Promise<unknown>;
}
export interface BuildReceipt {
    readonly schemaVersion: 1;
    readonly evidence: 'development-build-only';
    readonly sourceRevision: string;
    readonly sourceTreeSha256: string;
    readonly targets: Readonly<Record<BrowserTarget, Readonly<Record<string, string>>>>;
}
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

export async function bundleTarget(packageRoot: string, target: BrowserTarget, output: string): Promise<void> {
    for (const entry of ['background', 'content'] as const) {
        await viteBuild({ configFile: false, root: packageRoot, publicDir: false, logLevel: 'silent',
            build: { outDir: output, emptyOutDir: false, copyPublicDir: false, minify: false,
                target: TARGET_POLICY[target].syntax, sourcemap: false,
                lib: { entry: path.join(packageRoot, `src/infrastructure/${entry}_entry.ts`),
                    name: 'CopilotDevelopmentEntry',
                    formats: [entry === 'background' ? TARGET_POLICY[target].backgroundFormat : 'iife'],
                    fileName: () => `${entry}.js` },
            },
        });
    }
}

/** Internal API accepts trusted test directories; CLI exposes only package-local dist. */
export async function buildDevelopmentSet(root: string, output: string, bundle: BundlePort =
    (target, directory) => bundleTarget(path.join(root, 'extension'), target, directory), environment: BuildEnvironment = {}): Promise<BuildReceipt> {
    const lock = `${output}.lock`;
    await mkdir(path.dirname(output), { recursive: true });
    try { await mkdir(lock); } catch { throw new Error('build: output locked; wait for the active build, then retry'); }
    let staging: string | undefined;
    let target: BrowserTarget | 'preflight' | 'publish' = 'preflight';
    try {
        const sources = await readSources(root);
        validateArchitecture(root, sources);
        const metadata = [...sources.entries()];
        for (const file of ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'extension/package.json',
            'extension/tsconfig.json']) metadata.push([file, await readFile(path.join(root, file), 'utf8')]);
        for (const entry of await readSources(root, ['extension/tooling'])) metadata.push(entry);
        const sourceRevision = environment.revision ? environment.revision()
            : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
        if (!/^[a-f0-9]{40}$/u.test(sourceRevision)) throw new FoundationGateError('source-revision: expected commit SHA');
        staging = await mkdtemp(`${output}.staging-`);
        const hashes = {} as Record<BrowserTarget, Record<string, string>>;
        for (target of TARGETS) {
            const directory = path.join(staging, target);
            await mkdir(directory);
            await bundle(target, directory);
            await writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(targetManifest(target), null, 2)}\n`);
            const files = await readTarget(directory);
            validateTarget(target, files);
            hashes[target] = assetHashes(files);
        }
        const receipt: BuildReceipt = { schemaVersion: 1, evidence: 'development-build-only', sourceRevision,
            sourceTreeSha256: digest(JSON.stringify(metadata.sort(([a], [b]) => a.localeCompare(b)))), targets: hashes };
        await writeFile(path.join(staging, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
        await validateArtifactSet(staging);
        target = 'publish';
        await (environment.publish ?? replaceCompleteSet)(staging, output);
        return receipt;
    } catch (error) {
        if (error instanceof PublishedCleanupError) throw new Error('build/publish: the complete NEW set is present; previous backup cleanup failed. Inspect output.previous before retry.', { cause: error });
        const reason = error instanceof FoundationGateError ? `\n${error.message}` : '';
        throw new Error(`build/${target}: development set not replaced; correct this phase and retry. Previous complete output is retained.${reason}`, { cause: error });
    } finally {
        if (staging) await rm(staging, { recursive: true, force: true });
        await rm(lock, { recursive: true });
    }
}

export async function replaceCompleteSet(staging: string, output: string, io: PublishPort = { rename, rm, lstat }): Promise<void> {
    const previous = `${output}.previous`;
    // A previous backup is evidence of interrupted replacement, never delete it blindly.
    if (await io.lstat(previous).then(() => true, error => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        return false;
    })) throw new FoundationGateError('publish: interrupted backup exists; inspect output.previous before retry');
    let saved = false;
    try { await io.rename(output, previous); saved = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    try { await io.rename(staging, output); }
    catch (error) { if (saved) await io.rename(previous, output); throw error; }
    if (saved) {
        try { await io.rm(previous, { recursive: true }); }
        catch { throw new PublishedCleanupError('New set published; old backup retained for inspection.'); }
    }
}
