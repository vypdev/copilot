import { delimiter } from 'node:path';
import { rmSync } from 'node:fs';
import type { AgentConfiguration, AgentProvider } from '../model/agent';
import { AGENT_EXECUTABLE_BASENAMES } from '../model/agent';
import {
    readAgentExecutableVersion,
    resolveAgentExecutablePath,
} from '../../infrastructure/agents/agent_executable_invocation';
import { installOfficialAgentCli, type OfficialAgentInstallation } from '../../infrastructure/agents/agent_official_installer';
import { readAgentRuntimeVersion } from '../../infrastructure/agents/agent_runtime_manifest';

export type AgentCliProvisioningEnvironment = NodeJS.ProcessEnv;
export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'executable'>;

export function agentExecutableExists(executable: string, environment: NodeJS.ProcessEnv): boolean {
    try {
        resolveAgentExecutablePath(executable, environment);
        return true;
    } catch {
        return false;
    }
}

export interface AgentCliProvisioningSystem {
    executableExists(executable: string, environment: AgentCliProvisioningEnvironment): boolean;
    readVersion(executable: string, provider: AgentProvider, environment: AgentCliProvisioningEnvironment): string;
    installOfficial(provider: AgentProvider): OfficialAgentInstallation;
}

const DEFAULT_SYSTEM: AgentCliProvisioningSystem = {
    executableExists: agentExecutableExists,
    readVersion: readAgentExecutableVersion,
    installOfficial: installOfficialAgentCli,
};

/** Prepare only active provider CLIs; installation never modifies an operator executable. */
export class AgentCliProvisioner {
    private readonly preparedExecutables = new Set<string>();

    constructor(private readonly system: AgentCliProvisioningSystem = DEFAULT_SYSTEM) {}

    provision(target: AgentCliProvisioningTarget, environment: AgentCliProvisioningEnvironment = process.env): void {
        const provider = typeof target === 'string' ? target : target.provider;
        const selectedExecutable = typeof target === 'string' ? undefined : target.executable?.trim() || undefined;
        const executable = selectedExecutable || AGENT_EXECUTABLE_BASENAMES[provider];
        const key = `${provider}:${executable}`;
        if (this.preparedExecutables.has(key)) return;

        if (this.system.executableExists(executable, environment)) {
            this.preparedExecutables.add(key);
            return;
        }
        if (selectedExecutable) {
            throw new Error(`The explicitly selected ${provider} executable is unavailable; operator executables are never installed or replaced.`);
        }

        const installed = this.system.installOfficial(provider);
        const previousPath = environment.PATH;
        environment.PATH = `${installed.directory}${delimiter}${environment.PATH || environment.Path || ''}`;
        try {
            if (!this.system.executableExists(executable, environment)) {
                throw new Error(`The official ${provider} installer did not expose its executable.`);
            }
            const actual = resolveAgentExecutablePath(executable, environment);
            const sameExecutable = process.platform === 'win32'
                ? actual.toLowerCase() === installed.executable.toLowerCase()
                : actual === installed.executable;
            if (!sameExecutable) {
                throw new Error(`The official ${provider} installer resolved to another executable.`);
            }
            readAgentRuntimeVersion(provider, this.system.readVersion(actual, provider, environment));
            this.preparedExecutables.add(key);
        } catch (error) {
            if (previousPath === undefined) delete environment.PATH;
            else environment.PATH = previousPath;
            rmSync(installed.root, { recursive: true, force: true });
            throw error;
        }
    }
}
