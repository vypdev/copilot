import { execFileSync } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, isAbsolute, join } from 'node:path';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { getAgentRuntimeManifestEntry } from '../../infrastructure/agents/agent_runtime_manifest';
import {
    DEFAULT_AGENT_EXECUTABLES,
    provisioningDisabledError,
    resolveAgentProvisioningMode,
} from './agent_cli_provisioning_policy';
import { assertAgentRuntimeVersion } from '../../infrastructure/agents/agent_runtime_manifest';

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
        const selectedExecutable = typeof target === 'string' ? undefined : target.executable?.trim();
        const executable = typeof target === 'string'
            ? DEFAULT_AGENT_EXECUTABLES[provider]
            : selectedExecutable || DEFAULT_AGENT_EXECUTABLES[provider];
        const mode = resolveAgentProvisioningMode(environment.AGENT_PROVISIONING);

        if (this.provisionedExecutables.has(executable)) return;
        const executableAvailable = this.system.executableExists(executable, environment);
        if (executableAvailable && mode !== 'always') {
            try {
                this.assertVersion(executable, provider, environment);
                this.provisionedExecutables.add(executable);
                return;
            } catch (error) {
                if (mode === 'disabled' || !canRepairManifestExecutable(provider, selectedExecutable)) {
                    throw error;
                }
            }
        }
        if (mode === 'disabled') {
            throw provisioningDisabledError(provider, executable);
        }

        this.installProvider(provider, environment);
        this.assertInstalled(executable, provider, environment);
        this.assertVersion(executable, provider, environment);
        this.provisionedExecutables.add(executable);
    }

    private installProvider(provider: AgentProvider, _environment: NodeJS.ProcessEnv): void {
        const installers: Record<AgentProvider, () => void> = {
            codex: () => this.system.installPackage('@openai/codex', manifestSemver('codex')),
            opencode: () => this.system.installPackage('opencode-ai', manifestSemver('opencode')),
            cursor: () => {
                throw new Error(`Cursor ${getAgentRuntimeManifestEntry('cursor').version} must be preinstalled; automatic installation cannot guarantee the manifest version.`);
            },
        };
        installers[provider]();
    }

    private assertInstalled(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        if (!this.system.executableExists(executable, environment)) {
            throw new Error(`The ${provider} CLI was provisioned but executable "${executable}" is not available on PATH.`);
        }
    }

    private assertVersion(executable: string, provider: AgentProvider, environment: NodeJS.ProcessEnv): void {
        try {
            assertAgentRuntimeVersion(provider, this.system.readVersion(executable, environment));
        } catch (error) {
            throw Object.assign(
                new Error(`The ${provider} CLI failed exact-version preflight: ${error instanceof Error ? error.message : String(error)}`),
                { cause: error },
            );
        }
    }
}

function manifestSemver(provider: 'codex' | 'opencode'): string {
    return getAgentRuntimeManifestEntry(provider).version.replace(/^codex-cli\s+/, '');
}

function canRepairManifestExecutable(provider: AgentProvider, selectedExecutable: string | undefined): provider is 'codex' | 'opencode' {
    return provider !== 'cursor'
        && (selectedExecutable === undefined || selectedExecutable === DEFAULT_AGENT_EXECUTABLES[provider]);
}
