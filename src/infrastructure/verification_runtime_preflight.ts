import { spawnSync } from 'node:child_process';
import { posix, win32 } from 'node:path';
import { readVerificationRuntimeManifest } from './verification_runtime_manifest';
import { VerificationPrerequisiteError, VERIFICATION_RUNTIME_SPECS, verificationRuntimeMatches,
    verificationRuntimeVersion, type VerificationRuntimeRequirement } from '../application/policies/verification_runtime_policy';

export interface VerificationRuntimeProbe { readonly status: number | null; readonly output: string; readonly failed?: boolean }
export type VerificationRuntimeProbeRunner = (program: string, args: readonly string[], environment: Record<string, string>) => VerificationRuntimeProbe;

const probe: VerificationRuntimeProbeRunner = (program, args, environment) => {
    const result = spawnSync(program, [...args], { env: environment, encoding: 'utf8', shell: false,
        windowsHide: true, timeout: 5_000, maxBuffer: 8_192, stdio: ['ignore', 'pipe', 'pipe'] });
    return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`, failed: !!result.error };
};
const hasControlCharacter = (value: string): boolean => [...value].some(character => character.charCodeAt(0) < 32);

/** Fixed version probes only; never installs a runtime or executes a repository-provided bootstrap. */
export function assertVerificationRuntimePrerequisites(
    environment: Record<string, string>,
    root = process.cwd(),
    run: VerificationRuntimeProbeRunner = probe,
    platform: NodeJS.Platform = process.platform,
    job = process.env.GITHUB_JOB,
): void {
    for (const requirement of readVerificationRuntimeManifest(root)) {
        checkRuntime(requirement, environment, run, platform, job);
    }
}

function checkRuntime(requirement: VerificationRuntimeRequirement, environment: Record<string, string>,
    run: VerificationRuntimeProbeRunner, platform: NodeJS.Platform, job?: string): void {
    const spec = VERIFICATION_RUNTIME_SPECS[requirement.runtime];
    let program: string = spec.program;
    let args: readonly string[] = spec.args;
    if (requirement.runtime === 'java' && environment.JAVA_HOME) {
        const paths = platform === 'win32' ? win32 : posix;
        if (!paths.isAbsolute(environment.JAVA_HOME) || hasControlCharacter(environment.JAVA_HOME)) {
            throw new VerificationPrerequisiteError('unavailable', requirement, undefined, job);
        }
        program = paths.join(environment.JAVA_HOME, 'bin', platform === 'win32' ? 'java.exe' : 'java');
    } else if (requirement.runtime === 'python' && platform === 'win32') program = 'python';
    else if (requirement.runtime === 'pnpm' && platform === 'win32') {
        const systemRoot = environment.SystemRoot;
        if (!systemRoot || !win32.isAbsolute(systemRoot) || hasControlCharacter(systemRoot)) {
            throw new VerificationPrerequisiteError('unavailable', requirement, undefined, job);
        }
        program = win32.join(systemRoot, 'System32', 'cmd.exe');
        args = ['/d', '/s', '/c', 'pnpm --version'];
    }
    let result: VerificationRuntimeProbe;
    try { result = run(program, args, environment); }
    catch { throw new VerificationPrerequisiteError('unavailable', requirement, undefined, job); }
    if (result.failed || result.status !== 0 || result.output.length > 8_192) {
        throw new VerificationPrerequisiteError('unavailable', requirement, undefined, job);
    }
    const observed = verificationRuntimeVersion(requirement.runtime, result.output);
    if (!observed) throw new VerificationPrerequisiteError('unreadable-version', requirement, undefined, job);
    if (!verificationRuntimeMatches(requirement.version, observed)) {
        throw new VerificationPrerequisiteError('version-mismatch', requirement, observed, job);
    }
}
