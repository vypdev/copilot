import { execFileSync } from 'node:child_process';
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import type { AgentProvider } from '../../domain/agent';
import { getAgentRuntimeManifestEntry } from './agent_runtime_manifest';
import { validateAgentExecutableFile } from './agent_executable_file';

export interface AgentExecutableInvocation {
    readonly executable: string;
    readonly prefixArgs: readonly string[];
}

export function resolveAgentExecutablePath(
    selected: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform = process.platform,
): string {
    if (isAbsolute(selected)) return realpathSync(selected);
    const extensions = platform === 'win32'
        ? (environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    for (const directory of (environment.PATH || environment.Path || '').split(delimiter).filter(Boolean)) {
        for (const extension of extensions) {
            const candidate = join(directory, `${selected}${extension}`);
            try {
                accessSync(candidate, constants.X_OK);
                return realpathSync(candidate);
            } catch {
                // Continue through the trusted PATH candidates.
            }
        }
    }
    throw new Error(`Agent executable "${selected}" was not found on PATH.`);
}

/** Resolve npm's Windows command shim without ever passing agent argv to cmd.exe. */
export function resolveAgentExecutableInvocation(
    selected: string,
    provider: AgentProvider,
    platform: NodeJS.Platform = process.platform,
): AgentExecutableInvocation {
    if (platform === 'win32' && !/\.(exe|cmd)$/iu.test(selected)) {
        throw new Error('Windows agent executable must be a native executable or a reviewed npm command shim.');
    }
    if (platform !== 'win32' || !/\.cmd$/iu.test(selected)) {
        return { executable: selected, prefixArgs: [] };
    }

    const manifest = getAgentRuntimeManifestEntry(provider);
    const installation = manifest.installation;
    if (!installation || basename(selected).toLowerCase() !== `${manifest.executable}.cmd`) {
        throw new Error('Windows agent command shim does not match a reviewed npm runtime.');
    }
    const packageRoot = realpathSync(join(dirname(selected), 'node_modules', ...installation.package.split('/')));
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8')) as {
        name?: unknown;
        bin?: unknown;
    };
    if (packageJson.name !== installation.package) {
        throw new Error('Windows agent command shim resolves to an unexpected package.');
    }
    const bin = typeof packageJson.bin === 'string'
        ? packageJson.bin
        : packageJson.bin && typeof packageJson.bin === 'object'
            ? (packageJson.bin as Record<string, unknown>)[manifest.executable]
            : undefined;
    if (typeof bin !== 'string' || !bin || isAbsolute(bin) || win32.isAbsolute(bin)) {
        throw new Error('Windows agent package has no safe executable bin.');
    }
    const target = realpathSync(resolve(packageRoot, bin));
    const relation = relative(packageRoot, target);
    if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error('Windows agent package bin escaped its package directory.');
    }
    if (!statSync(target).isFile()) throw new Error('Windows agent package bin is not a file.');
    switch (extname(target).toLowerCase()) {
        case '.js': return { executable: process.execPath, prefixArgs: [target] };
        case '.exe': return { executable: target, prefixArgs: [] };
        default: throw new Error('Windows agent package bin is not a supported direct executable.');
    }
}

/** Verify every file that may execute before a version or login probe starts. */
export function validateResolvedAgentInvocation(selected: string, provider: AgentProvider): AgentExecutableInvocation {
    validateAgentExecutableFile(selected);
    const invocation = resolveAgentExecutableInvocation(selected, provider);
    if (invocation.executable !== selected) validateAgentExecutableFile(invocation.executable);
    for (const prefixArg of invocation.prefixArgs) validateAgentExecutableFile(prefixArg);
    return invocation;
}

export function readAgentExecutableVersion(
    selected: string,
    provider: AgentProvider,
    environment: NodeJS.ProcessEnv,
): string {
    const path = resolveAgentExecutablePath(selected, environment);
    const invocation = validateResolvedAgentInvocation(path, provider);
    return execFileSync(invocation.executable, [...invocation.prefixArgs, '--version'], {
        env: environment,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
    });
}

export function installAgentNpmPackage(packageName: string, version: string): void {
    const invocation = resolveNpmInstallInvocation(packageName, version);
    if (process.platform === 'win32') {
        validateAgentExecutableFile(invocation.executable);
        validateAgentExecutableFile(invocation.prefixArgs[0]);
    }
    execFileSync(invocation.executable, invocation.prefixArgs, { stdio: 'inherit' });
}

export function resolveNpmInstallInvocation(
    packageName: string,
    version: string,
    platform: NodeJS.Platform = process.platform,
    environment: NodeJS.ProcessEnv = process.env,
): AgentExecutableInvocation {
    const args = ['install', '--global', `${packageName}@${version}`];
    if (platform === 'win32') {
        // JavaScript Actions run under the runner's embedded Node, which has no npm.
        // setup-node adds the npm-bearing installation to the job PATH.
        const nodeExecutable = resolveAgentExecutablePath('node', environment, platform);
        const npmCli = join(dirname(nodeExecutable), 'node_modules', 'npm', 'bin', 'npm-cli.js');
        try {
            if (!statSync(npmCli).isFile()) throw new Error('not a file');
        } catch {
            throw new Error('The job Node installation has no npm CLI script.');
        }
        return {
            executable: nodeExecutable,
            prefixArgs: [npmCli, ...args],
        };
    }
    return { executable: 'npm', prefixArgs: args };
}
