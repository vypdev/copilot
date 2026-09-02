import type { SetupCredentialCheck, SetupCredentialRequirement } from '../domain/setup';
import type { SetupRemoteCredentialHealthPort } from '../application/ports/setup_wizard_ports';
import type { GithubClientPort } from './github/ports/github_client_provider_port';
import type { GithubCredentialHealthClient } from './github/ports/github_credential_health_protocol';
export interface CredentialHealthAdapterOptions {
    waitMs?: number;
    pollMs?: number;
    sleep?: (milliseconds: number) => Promise<void>;
    bootstrapWhenMissing?: boolean;
    workflowContent?: string;
}
/** Dispatches the repository-owned health workflow; it cannot read or mutate Secret values. */
export declare class SetupRemoteCredentialHealthAdapter implements SetupRemoteCredentialHealthPort {
    private readonly githubClient;
    private readonly waitMs;
    private readonly pollMs;
    private readonly sleep;
    private readonly bootstrapWhenMissing;
    private readonly workflowContent;
    constructor(githubClient: GithubClientPort<GithubCredentialHealthClient>, options?: CredentialHealthAdapterOptions);
    validateExisting(owner: string, repository: string, token: string, ref: string, requirements: readonly SetupCredentialRequirement[]): Promise<readonly SetupCredentialCheck[] | undefined>;
    private bootstrapWorkflow;
    private removeTemporaryWorkflow;
    private findRun;
}
