import { logDebugInfo, logError } from '../../utils/logger';
import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { Result } from '../model/result';
import { MergeChecksWaiter } from './merge_checks_waiter';
import { createMergePullRequest, mergePullRequest, updateMergePullRequestBody } from './merge_pull_request_flow';

/**
 * Repository for merging branches: creates a PR, waits for that PR's check runs
 * (or status checks), then merges the PR. Direct merge is only attempted when
 * PR creation itself fails, before a PR exists and before checks can be evaluated.
 */
export class MergeRepository {
    constructor(
        private readonly githubClient: GithubClientPort<GithubBranchMergeClient>,
        private readonly checksWaiter = new MergeChecksWaiter(),
    ) {}

    mergeBranch = async (
        owner: string,
        repository: string,
        head: string,
        base: string,
        timeout: number,
        token: string,
    ): Promise<Result[]> => {
        let pullRequestCreated = false;
        try {
            const client = this.githubClient.getClient(token);
            logDebugInfo(`Creating merge from ${head} into ${base}`);

            const pullRequest = await createMergePullRequest(client, owner, repository, head, base);
            pullRequestCreated = true;
            await updateMergePullRequestBody(client, owner, repository, pullRequest.number, head, base);
            await this.checksWaiter.wait(client, owner, repository, head, pullRequest.number, timeout);
            await mergePullRequest(client, owner, repository, pullRequest.number, head, base);

            return [this.successResult(head, base)];
        } catch (error: unknown) {
            logError(`Error in PR workflow: ${error}`);
            if (!pullRequestCreated) {
                return this.tryDirectMerge(owner, repository, head, base, token, error);
            }
            return this.mergeFailureResults(head, base, error);
        }
    };

    private async tryDirectMerge(
        owner: string,
        repository: string,
        head: string,
        base: string,
        token: string,
        originalError: unknown,
    ): Promise<Result[]> {
        try {
            const client = this.githubClient.getClient(token);
            const { data } = await client.rest.repos.merge({
                owner,
                repo: repository,
                base,
                head,
                commit_message: `Forced merge of ${head} into ${base}. Automated merge with PAT token.`,
            });
            if (!data.merged) {
                throw new Error(`Direct merge was not completed: ${data.message ?? 'GitHub rejected the merge.'}`);
            }
            return [this.successResult(head, base, true)];
        } catch (directMergeError: unknown) {
            logError(`Error in direct merge attempt: ${directMergeError}`);
            return this.mergeFailureResults(head, base, originalError, directMergeError);
        }
    }

    private successResult(head: string, base: string, direct = false): Result {
        return new Result({
            id: 'branch_repository',
            success: true,
            executed: true,
            steps: [`The branch \`${head}\` was merged into \`${base}\`${direct ? ' using direct merge.' : '.'}`],
        });
    }

    private mergeFailureResults(
        head: string,
        base: string,
        error: unknown,
        directMergeError?: unknown,
    ): Result[] {
        return [
            new Result({
                id: 'branch_repository',
                success: false,
                executed: true,
                steps: [`Failed to merge branch \`${head}\` into \`${base}\`.`],
                errors: [error, ...(directMergeError === undefined ? [] : [directMergeError])],
            }),
        ];
    }
}
