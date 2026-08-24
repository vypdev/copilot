import type { BranchLifecyclePort } from '../../application/ports/branch_lifecycle_ports';
import type { GithubBranchClient } from '../../application/ports/github_branch_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
export declare class BranchLifecycleRepository implements BranchLifecyclePort {
    private readonly branchClient;
    constructor(branchClient: GithubClientPort<GithubBranchClient>);
    removeBranch: (owner: string, repository: string, branch: string, token: string) => Promise<boolean>;
    getListOfBranches: (owner: string, repository: string, token: string) => Promise<string[]>;
}
