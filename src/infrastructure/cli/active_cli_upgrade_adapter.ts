import { getExecOutput } from '@actions/exec';
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { basename, delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ApplicationError } from '../../application/errors/application_error';
import type { CliUpgradePort, CliUpgradeResult } from '../../application/ports/cli_upgrade_ports';
import { COPILOT_PACKAGE_NAME } from './copilot_package';

type PackageManager = CliUpgradeResult['packageManager'];

export interface CliUpgradeProcess {
    (executable: string, args: string[], inheritOutput?: boolean): Promise<string>;
}

export interface ActiveCliUpgradeOptions {
    readonly entrypoint?: string;
    readonly environment?: NodeJS.ProcessEnv;
    readonly platform?: NodeJS.Platform;
    readonly run?: CliUpgradeProcess;
}

interface InstalledPackage {
    readonly root: string;
    readonly version: string;
    readonly entrypoint: string;
}

interface ActiveInstallation {
    readonly packageManager: PackageManager;
    readonly managerExecutable: string;
    readonly packagePath: string;
    readonly commandPath: string;
    readonly locationArgs: string[];
}

const VERSION_PATTERN = /^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?(?:\+[\da-zA-Z.-]+)?$/u;

/** Retain the PATH spelling: pnpm wrappers and npm links are replaced in place. */
export function resolveCliExecutable(
    name: string,
    environment: NodeJS.ProcessEnv,
    platform: NodeJS.Platform = process.platform,
): string {
    const extensions = platform === 'win32'
        ? (environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    for (const directory of (environment.PATH || environment.Path || '').split(delimiter)) {
        for (const extension of extensions) {
            const candidate = resolve(directory || '.', `${name}${extension}`);
            try {
                accessSync(candidate, constants.X_OK);
                if (statSync(candidate).isFile()) return candidate;
            } catch {
                // Continue to the next PATH candidate.
            }
        }
    }
    throw new ApplicationError('configuration.invalid', `The ${name} command is unavailable on PATH. Restore the active installation's command and retry.`);
}

function readInstalledPackage(packagePath: string): InstalledPackage {
    const root = realpathSync(packagePath);
    const metadata = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        name?: unknown; version?: unknown; bin?: Record<string, unknown>;
    };
    const bin = metadata.bin?.copilot;
    if (metadata.name !== COPILOT_PACKAGE_NAME || typeof metadata.version !== 'string'
        || !VERSION_PATTERN.test(metadata.version) || typeof bin !== 'string' || isAbsolute(bin)) {
        throw new Error('Invalid Copilot package identity or executable.');
    }
    const entrypoint = realpathSync(resolve(root, bin));
    const relation = relative(root, entrypoint);
    if (!relation || relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
        throw new Error('Copilot executable escaped its package.');
    }
    if (!statSync(entrypoint).isFile()) throw new Error('Copilot executable is not a file.');
    return { root, version: metadata.version, entrypoint };
}

function readInvokedPackage(entrypoint: string): InstalledPackage {
    const invoked = realpathSync(entrypoint);
    let directory = dirname(invoked);
    while (directory !== dirname(directory)) {
        try {
            const installed = readInstalledPackage(directory);
            if (installed.entrypoint === invoked) return installed;
        } catch {
            // The published package root is above build/cli, not necessarily cwd.
        }
        directory = dirname(directory);
    }
    throw new ApplicationError('configuration.unsupported', 'The running Copilot package could not be identified. Reinstall it globally with npm or pnpm and retry.');
}

/** System adapter owns package-manager discovery, mutation and fresh process probes. */
export class ActiveCliUpgradeAdapter implements CliUpgradePort {
    private readonly environment: Record<string, string>;
    private readonly platform: NodeJS.Platform;
    private readonly entrypoint: string;
    private readonly run: CliUpgradeProcess;

    constructor(options: ActiveCliUpgradeOptions = {}) {
        this.environment = {};
        for (const [name, value] of Object.entries(options.environment ?? process.env)) {
            if (typeof value === 'string') this.environment[name] = value;
        }
        this.platform = options.platform ?? process.platform;
        this.entrypoint = options.entrypoint ?? process.argv[1];
        this.run = options.run ?? (async (executable, args, inheritOutput = false) => {
            // The toolkit handles Windows .cmd quoting as well as native executables.
            const result = await getExecOutput(`"${executable.replace(/"/gu, '\\"')}"`, args, {
                env: this.environment,
                silent: !inheritOutput,
            });
            return result.stdout.trim();
        });
    }

    async upgrade(): Promise<CliUpgradeResult> {
        const invoked = readInvokedPackage(this.entrypoint);
        const installation = await this.resolveInstallation(invoked);
        this.assertEffectiveCommand(installation, false);

        let version: string;
        try {
            const response: unknown = JSON.parse(await this.run(installation.managerExecutable,
                ['view', `${COPILOT_PACKAGE_NAME}@latest`, 'version', '--json']));
            if (typeof response !== 'string' || !VERSION_PATTERN.test(response)) throw new Error('Invalid version.');
            version = response;
        } catch (cause) {
            throw new ApplicationError('provider.unavailable', 'Unable to determine the latest Copilot version. No installation was changed; check the package registry connection and retry.', { cause });
        }

        try {
            const verb = installation.packageManager === 'npm' ? 'install' : 'add';
            await this.run(installation.managerExecutable,
                [verb, '--global', ...installation.locationArgs, `${COPILOT_PACKAGE_NAME}@${version}`], true);
        } catch (cause) {
            throw new ApplicationError('provider.unavailable', `The ${installation.packageManager} upgrade did not complete. Check its output and the active installation's permissions before retrying.`, { cause });
        }

        try {
            const installed = readInstalledPackage(installation.packagePath);
            const effectiveCommand = this.assertEffectiveCommand(installation, true);
            if (installation.packageManager === 'npm' && this.platform !== 'win32'
                && realpathSync(effectiveCommand) !== installed.entrypoint) throw new Error('The npm executable points outside its package.');
            const effectiveVersion = (await this.run(effectiveCommand, ['--version'])).trim();
            if (installed.version !== version || effectiveVersion !== version) throw new Error('Version mismatch.');
            return { version, packageManager: installation.packageManager, executablePath: effectiveCommand };
        } catch (cause) {
            throw new ApplicationError('workflow.failed', 'The installer completed, but the effective Copilot version could not be verified. Check "copilot --version" and PATH, refresh your shell command cache or open a new terminal, then retry. The installation may already be updated.', { cause });
        }
    }

    private async resolveInstallation(invoked: InstalledPackage): Promise<ActiveInstallation> {
        // A pnpm store package is not an npm prefix, even on Windows.
        const modules = dirname(dirname(invoked.root));
        const npmPrefix = this.platform === 'win32' ? dirname(modules) : dirname(dirname(modules));
        if (basename(modules) === 'node_modules' && !modules.includes(`${sep}.pnpm${sep}`)
            && (this.platform === 'win32' || basename(dirname(modules)) === 'lib')) {
            try {
                const managerExecutable = resolveCliExecutable('npm', this.environment, this.platform);
                const root = (await this.run(managerExecutable, ['root', '--global', '--prefix', npmPrefix])).trim();
                const packagePath = join(root, ...COPILOT_PACKAGE_NAME.split('/'));
                const bin = this.platform === 'win32' ? npmPrefix : join(npmPrefix, 'bin');
                if (isAbsolute(root) && readInstalledPackage(packagePath).root === invoked.root) {
                    accessSync(join(bin, this.commandName()), constants.X_OK);
                    if (this.platform !== 'win32' && realpathSync(join(bin, this.commandName())) !== invoked.entrypoint) {
                        throw new Error('The npm executable does not belong to the invoked package.');
                    }
                    return {
                        packageManager: 'npm', managerExecutable, packagePath,
                        commandPath: join(bin, this.commandName()), locationArgs: ['--prefix', npmPrefix],
                    };
                }
            } catch {
                // Probe pnpm rather than installing into an unrelated npm prefix.
            }
        }
        try {
            const managerExecutable = resolveCliExecutable('pnpm', this.environment, this.platform);
            const root = (await this.run(managerExecutable, ['root', '--global'])).trim();
            const packagePath = join(root, ...COPILOT_PACKAGE_NAME.split('/'));
            if (isAbsolute(root) && readInstalledPackage(packagePath).root === invoked.root) {
                const relation = relative(realpathSync(root), invoked.root);
                if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
                    throw new Error('A linked source checkout is not an installed pnpm package.');
                }
                const bin = (await this.run(managerExecutable, ['bin', '--global'])).trim();
                if (!isAbsolute(bin)) throw new Error('Invalid global bin directory.');
                return {
                    packageManager: 'pnpm', managerExecutable, packagePath,
                    commandPath: join(bin, this.commandName()),
                    locationArgs: ['--global-dir', dirname(root), '--global-bin-dir', bin],
                };
            }
        } catch {
            // Unknown/local/linked installations must not mutate another installation.
        }
        throw new ApplicationError('configuration.unsupported', 'The active Copilot installation could not be matched to npm or pnpm. Restore its original package manager or reinstall it globally, then retry. No installation was changed.');
    }

    private commandName(): string {
        return this.platform === 'win32' ? 'copilot.cmd' : 'copilot';
    }

    private assertEffectiveCommand(installation: ActiveInstallation, afterInstall: boolean): string {
        const effective = resolveCliExecutable('copilot', this.environment, this.platform);
        if (realpathSync(effective) !== realpathSync(installation.commandPath)) {
            throw new ApplicationError('configuration.invalid', afterInstall
                ? 'Another Copilot installation is taking priority on PATH.'
                : 'The running Copilot installation differs from the command on PATH. Fix PATH or invoke its active command, then retry. No installation was changed.');
        }
        return effective;
    }
}
