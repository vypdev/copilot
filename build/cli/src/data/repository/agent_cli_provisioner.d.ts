import type { AgentConfiguration, AgentProvider } from '../model/agent';
export type AgentCliProvisioningEnvironment = NodeJS.ProcessEnv;
export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'command'>;
export interface AgentCliProvisioningSystem {
    executableExists(executable: string, environment: AgentCliProvisioningEnvironment): boolean;
    installPackage(packageName: string, version: string): void;
    installCursor(expectedSha256: string): void;
}
export declare class AgentCliProvisioner {
    private readonly system;
    private readonly provisionedExecutables;
    constructor(system?: AgentCliProvisioningSystem);
    provision(target: AgentCliProvisioningTarget, environment?: AgentCliProvisioningEnvironment): void;
    private resolveMode;
    private assertInstalled;
}
