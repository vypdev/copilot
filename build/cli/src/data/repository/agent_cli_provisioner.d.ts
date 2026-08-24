import type { AgentProvider } from '../model/agent';
export interface AgentCliProvisioningEnvironment {
    codexVersion?: string;
    opencodeVersion?: string;
    cursorInstallerSha256?: string;
}
export declare class AgentCliProvisioner {
    provision(provider: AgentProvider, environment?: AgentCliProvisioningEnvironment): void;
    private installPnpmPackage;
    private installCursor;
}
