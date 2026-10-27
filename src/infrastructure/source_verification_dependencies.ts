import { execFile } from 'node:child_process';
import { lstatSync, realpathSync, existsSync, openSync, closeSync, fstatSync, readSync, constants } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';
import { load, JSON_SCHEMA } from 'js-yaml';
import { SourceDependencyError } from '../application/policies/source_verification_dependency_policy';
import { verificationExecutable } from './verification_executable';
import { verificationCandidateIdentity } from './native_verification_candidate';
import { logInfo } from '../application/ports/logging_ports';

export type SourceDependencyPreparation = (environment: Record<string, string>) => Promise<void>;
export type SourceDependencyProcess = (node: string, args: readonly string[], workspace: string, environment: Record<string, string>) => Promise<string>;

const run: SourceDependencyProcess = (node, args, cwd, env) => new Promise((resolve, reject) => {
    // Do not forward registry errors, URLs, paths or runner command syntax into public output.
    execFile(node, [...args], { cwd, env, timeout: 300_000, maxBuffer: 65_536, windowsHide: true },
        (error, stdout) => error ? reject(new SourceDependencyError('install-failed')) : resolve(stdout));
});
const inside = (root: string, path: string): boolean => {
    const part = relative(root, path);
    return part === '' || !isAbsolute(part) && part !== '..' && !part.startsWith(`..${sep}`);
};

/** Capture the provisioned source-only tool before any candidate checkout or fixer mutation. */
export function captureSourceDependencyPreparation(
    metadata: NodeJS.ProcessEnv = process.env,
    workspace = process.cwd(),
    execute: SourceDependencyProcess = run,
    platform: NodeJS.Platform = process.platform,
): SourceDependencyPreparation {
    if (metadata.GITHUB_ACTIONS !== 'true' || metadata.GITHUB_REPOSITORY !== 'vypdev/copilot' || metadata.COPILOT_PREPARE_VERIFICATION !== 'true') return async () => {};
    let root: string;
    let pnpm: string;
    try {
        root = realpathSync(workspace);
        const home = metadata.PNPM_HOME;
        if (home) {
            // pnpm/action-setup owns this metadata. Prefer its installed package
            // entry even if a later setup-node step shadows PATH with Corepack.
            if (!isAbsolute(home) || inside(root, realpathSync(home))) throw new Error('unavailable');
            pnpm = realpathSync(join(dirname(realpathSync(home)), 'pnpm/bin/pnpm.cjs'));
        } else {
            pnpm = realpathSync(verificationExecutable('pnpm', metadata as Record<string, string>));
        }
        // Source callers provision pnpm/action-setup on Linux, macOS or Windows. No Corepack download,
        // candidate node_modules tool, arbitrary shell wrapper or inferred consumer installer.
        if (!['linux', 'darwin', 'win32'].includes(platform) || basename(pnpm) !== 'pnpm.cjs' || inside(root, pnpm)) throw new Error('unavailable');
    } catch { return async () => { throw new SourceDependencyError('tool-unavailable'); }; }
    return async environment => {
        if (realpathSync(process.cwd()) !== root) throw new SourceDependencyError('candidate-changed');
        validateGraph(root);
        const identity = candidateIdentity(root, environment);
        try {
            const flags = ['--config.manage-package-manager-versions=false', '--ignore-pnpmfile'];
            const version = await execute(process.execPath, [pnpm, ...flags, '--version'], dirname(pnpm), environment);
            if (version.trim() !== '10.12.4') throw new SourceDependencyError('tool-unavailable');
            logInfo('Preparing candidate workspace dependencies (pnpm 10.12.4; frozen lockfile; scripts and pnpmfile hooks disabled).');
            await execute(process.execPath, [pnpm, ...flags, 'install', '--frozen-lockfile', '--ignore-scripts', '--prod=false', '--reporter=silent', '--store-dir', join(root, '.tmp/copilot-verification-store')], root, environment);
        } catch (error) { throw error instanceof SourceDependencyError ? error : new SourceDependencyError('install-failed'); }
        if (candidateIdentity(root, environment) !== identity) throw new SourceDependencyError('candidate-changed');
    };
}

/** Deliberately bounded source graph, not a generic package-manager configuration interpreter. */
function validateGraph(root: string): void {
    try {
        const read = (path: string, maximum: number): string => {
            const file = join(root, path);
            const stat = lstatSync(file, {bigint:true});
            if (!stat.isFile() || stat.nlink !== 1n || stat.size > BigInt(maximum) || !inside(root, realpathSync(file))) throw new Error('unsafe');
            const descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
            try {
                const opened = fstatSync(descriptor, {bigint:true});
                if (opened.dev !== stat.dev || opened.ino !== stat.ino || opened.size !== stat.size || opened.nlink !== 1n) throw new Error('changed');
                const bytes = Buffer.alloc(maximum + 1);
                const size = readSync(descriptor, bytes, 0, bytes.length, 0);
                if (size !== Number(opened.size)) throw new Error('changed');
                return bytes.subarray(0,size).toString('utf8');
            } finally { closeSync(descriptor); }
        };
        for (const path of ['.tmp', '.tmp/copilot-verification-store']) {
            if (existsSync(join(root, path)) && lstatSync(join(root, path)).isSymbolicLink()) throw new Error('unsafe cache');
        }
        const manifest = JSON.parse(read('package.json', 131_072));
        const workspace = load(read('pnpm-workspace.yaml', 131_072), { schema: JSON_SCHEMA }) as Record<string, unknown>;
        read('pnpm-lock.yaml', 4_194_304);
        if (manifest.name !== '@vypdev/copilot' || manifest.packageManager !== 'pnpm@10.12.4'
            || Object.keys(manifest.pnpm ?? {}).some(key => key !== 'overrides')
            || !workspace || typeof workspace !== 'object' || Array.isArray(workspace)
            || Object.keys(workspace).some(key => key !== 'packages' && key !== 'overrides')) throw new Error('unsupported');
        const packages = workspace.packages ?? [];
        if (!Array.isArray(packages) || packages.length > 32) throw new Error('unsupported');
        for (const path of ['', ...packages]) {
            if (typeof path !== 'string' || path.length > 200 || path !== '' && !/^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/u.test(path)) throw new Error('unsafe');
            if (existsSync(join(root, path, '.npmrc'))) throw new Error('unsupported');
            if (path) {
                const member = JSON.parse(read(`${path}/package.json`, 131_072));
                if (member.pnpm !== undefined) throw new Error('unsupported');
            }
        }
    } catch { throw new SourceDependencyError('unsupported-graph'); }
}

function candidateIdentity(root: string, environment: Record<string, string>): string {
    try { return verificationCandidateIdentity(root, environment); }
    catch { throw new SourceDependencyError('candidate-changed'); }
}
