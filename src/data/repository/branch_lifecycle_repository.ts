import type { BranchLifecyclePort } from '../../application/ports/branch_lifecycle_ports';
import type { GithubBranchClient } from '../../application/ports/github_branch_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { logDebugInfo, logError } from '../../utils/logger';

export class BranchLifecycleRepository implements BranchLifecyclePort {
    constructor(private readonly branchClient: GithubClientPort<GithubBranchClient>) {}

    removeBranch = async (owner: string, repository: string, branch: string, token: string): Promise<boolean> => {
        const octokit = this.branchClient.getClient(token);
        const ref = `heads/${branch}`;
        try {
            const { data } = await octokit.rest.git.getRef({ owner, repo: repository, ref });
            logDebugInfo(`Branch found: ${data.ref}`);
            await octokit.rest.git.deleteRef({ owner, repo: repository, ref });
            logDebugInfo(`Successfully deleted branch: ${branch}`);
            return true;
        } catch (error) {
            logError(`Error processing branch ${branch}: ${error}`);
            throw error;
        }
    };

    getListOfBranches = async (owner: string, repository: string, token: string): Promise<string[]> => {
        const octokit = this.branchClient.getClient(token);
        const allBranches: string[] = [];
        let page = 1;
        while (true) {
            const { data } = await octokit.rest.repos.listBranches({ owner, repo: repository, per_page: 100, page });
            if (data.length === 0) break;
            allBranches.push(...data.map(branch => branch.name));
            page++;
        }
        return allBranches;
    };
}
