import type { AgentConfiguration, AgentProvider } from '../model/agent';
export interface AgentCliProvisioningEnvironment extends NodeJS.ProcessEnv {
    codexVersion?: string;
    opencodeVersion?: string;
    cursorInstallerSha256?: string;
}
export type AgentCliProvisioningTarget = AgentProvider | Pick<AgentConfiguration, 'provider' | 'command'>;
export declare class AgentCliProvisioner {
    provision(target: AgentCliProvisioningTarget, environment?: AgentCliProvisioningEnvironment): void;
    private resolveMode;
    private assertInstalled;
    private installPnpmPackage;
    private installCursor;
}
