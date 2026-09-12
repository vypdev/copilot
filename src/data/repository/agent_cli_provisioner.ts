import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import {
    assertInstalledAgentRuntimeVersion,
    getAgentRuntimeManifestEntry,
} from '../../infrastructure/agents/agent_runtime_manifest';
import {
    DEFAULT_AGENT_EXECUTABLES,
    provisioningDisabledError,
    resolveAgentProvisioningMode,
} from './agent_cli_provisioning_policy';

export type AgentCliProvisioningEnvironment = NodeJS.ProcessEnv;

export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'executable'>;

export function agentExecutableExists(executable: string, environment: NodeJS.ProcessEnv): boolean {
    if (isAbsolute(executable) || executable.includes('/')) {
        try {
            accessSync(executable, constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }

    const pathEntries = (environment.PATH || '').split(delimiter).filter(Boolean);
    const extensions = process.platform === 'win32'
        ? (environment.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
        : [''];
    return pathEntries.some((directory) => extensions.some((extension) => {
        try {
            accessSync(join(directory, `${executable}${extension}`), constants.X_OK);
            return true;
        } catch {
            return false;
        }
    }));
}

export interface AgentCliProvisioningSystem {
    executableExists(executable: string, environment: AgentCliProvisioningEnvironment): boolean;
    readVersion(executable: string, environment: AgentCliProvisioningEnvironment): string;
    installPackage(packageName: string, version: string): void;
}

function installPackageGlobally(packageName: string, version: string): void {
    // npm uses the runner's system Node directly and avoids the Intel macOS
    // SEA binary issue that can affect Corepack-managed pnpm installations.
    execFileSync('npm', ['install', '--global', `${packageName}@${version}`], { stdio: 'inherit' });
}

const DEFAULT_SYSTEM: AgentCliProvisioningSystem = {
    executableExists: agentExecutableExists,
    readVersion(executable, environment) {
        return execFileSync(executable, ['--version'], {
            env: environment,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 15_000,
        });
    },
    installPackage: installPackageGlobally,
};

export class AgentCliProvisioner {
    private readonly provisionedExecutables = new Set<string>();

    constructor(private readonly system: AgentCliProvisioningSystem = DEFAULT_SYSTEM) {}

    provision(target: AgentCliProvisioningTarget, environment: AgentCliProvisioningEnvironment = process.env): void {
        const provider = typeof target === 'string' ? target : target.provider;
        const selectedExecutable = typeof target === 'string' ? undefined : target.executable?.trim() || undefined;
        const executable = typeof target === 'string'
            ? DEFAULT_AGENT_EXECUTABLES[provider]
            : selectedExecutable || DEFAULT_AGENT_EXECUTABLES[provider];
        const mode = resolveAgentProvisioningMode(environment.AGENT_PROVISIONING);

        if (this.provisionedExecutables.has(executable)) return;
        const executableAvailable = this.system.executableExists(executable, environment);
        if (selectedExecutable !== undefined) {
            if (!executableAvailable) {
                throw new Error(`The explicitly selected ${provider} executable "${executable}" is not available; explicit executables are never installed or replaced.`);
            }
            this.provisionedExecutables.add(executable);
            return;
        }
        if (executableAvailable && mode !== 'always') {
            this.provisionedExecutables.add(executable);
            return;
        }
        if (mode === 'disabled') {
            throw provisioningDisabledError(provider, executable);
        }

        this.installProvider(provider);
        this.assertInstalled(executable, provider, environment);
        this.assertInstalledVersion(executable, provider, environment);
        this.provisionedExecutables.add(executable);
    }

    private installProvider(provider: AgentProvider): void {
        const installation = getAgentRuntimeManifestEntry(provider).installation;
        if (!installation) {
            throw new Error(`The ${provider} CLI must be preinstalled because Copilot has no reviewed automatic installer for it.`);
        }
        this.system.installPackage(installation.package, installation.version);
    }

    private assertInstalled(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        if (!this.system.executableExists(executable, environment)) {
            throw new Error(`The ${provider} CLI was provisioned but executable "${executable}" is not available on PATH.`);
        }
    }

    private assertInstalledVersion(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        try {
            assertInstalledAgentRuntimeVersion(provider, this.system.readVersion(executable, environment));
        } catch (error) {
            throw Object.assign(
                new Error(`The Copilot-installed ${provider} CLI failed pinned-version verification: ${error instanceof Error ? error.message : String(error)}`),
                { cause: error },
            );
        }
    }
}
