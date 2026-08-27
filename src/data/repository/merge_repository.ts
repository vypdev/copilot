import { logDebugInfo, logError } from '../../utils/logger';
import type { GithubBranchMergeClient } from '../../application/ports/github_branch_ports';
import type { GithubClientPort } from '../../infrastructure/github/ports/github_client_provider_port';
import { Result } from '../model/result';
import { failedCheckRuns, pendingCheckRuns, pendingStatuses, selectPullRequestChecks } from './merge_checks_policy';

/**
 * Repository for merging branches: creates a PR, waits for that PR's check runs (or status checks),
 * then merges the PR; on failure, falls back to a direct Git merge.
 *
 * Check runs are filtered by PR (pull_requests) so we only wait for the current PR's checks,
 * not those of another PR sharing the same head (e.g. release→main vs release→develop).
 * If the PR has no check runs after a short wait, we proceed to merge (branch may have no required checks).
 *
 * @see docs/single-actions/deploy-label-and-merge.mdx for the deploy flow and check-wait behaviour.
 */
export class MergeRepository {
    constructor(private readonly githubClient: GithubClientPort<GithubBranchMergeClient>) {}

    mergeBranch = async (
        owner: string,
        repository: string,
        head: string,
        base: string,
        timeout: number,
        token: string,
    ): Promise<Result[]> => {
        const result: Result[] = [];
        try {
            const octokit = this.githubClient.getClient(token);
            logDebugInfo(`Creating merge from ${head} into ${base}`);

            // Build PR body with commit list
            const prBody = `🚀 Automated Merge  

This PR merges **${head}** into **${base}**.  

**Commits included:**`;

            // We need PAT for creating PR to ensure it can trigger workflows
            const { data: pullRequest } = await octokit.rest.pulls.create({
                owner: owner,
                repo: repository,
                head: head,
                base: base,
                title: `Merge ${head} into ${base}`,
                body: prBody,
            });

            logDebugInfo(`Pull request #${pullRequest.number} created, getting commits...`);

            // Get all commits in the PR
            const { data: commits } = await octokit.rest.pulls.listCommits({
                owner: owner,
                repo: repository,
                pull_number: pullRequest.number,
            });

            const commitMessages = commits.map(commit => commit.commit.message);

            logDebugInfo(`Found ${commitMessages.length} commits in PR`);

            // Update PR with commit list and footer
            await octokit.rest.pulls.update({
                owner: owner,
                repo: repository,
                pull_number: pullRequest.number,
                body: prBody + '\n' + commitMessages.map(msg => `- ${msg}`).join('\n') +
                    '\n\nThis PR was automatically created by [`copilot`](https://github.com/vypdev/copilot).',
            });

            const iteration = 10;
            /** Give workflows a short window to register check runs for this PR; after this, we allow merge with no check runs (e.g. branch has no required checks). */
            const maxWaitForPrChecksAttempts = 3;
            if (timeout > iteration) {
                // Wait for checks to complete - can use regular token for reading checks
                let checksCompleted = false;
                let attempts = 0;
                let waitForPrChecksAttempts = 0;
                const maxAttempts = timeout > iteration ? Math.floor(timeout / iteration) : iteration;

                while (!checksCompleted && attempts < maxAttempts) {
                    const { data: checkRuns } = await octokit.rest.checks.listForRef({
                        owner: owner,
                        repo: repository,
                        ref: head,
                    });

                    // Only consider check runs that are for this PR. When the same branch is used in
                    // multiple PRs (e.g. release→master and release→develop), listForRef returns runs
                    // for all PRs; we must wait for runs tied to the current PR or we may see completed
                    // runs from the other PR and merge before this PR's checks have run.
                    const runsForThisPr = selectPullRequestChecks(checkRuns.check_runs, pullRequest.number);

                    // Get commit status checks for the PR head commit
                    const { data: commitStatus } = await octokit.rest.repos.getCombinedStatusForRef({
                        owner: owner,
                        repo: repository,
                        ref: head,
                    });

                    logDebugInfo(`Combined status state: ${commitStatus.state}`);
                    logDebugInfo(`Number of check runs for this PR: ${runsForThisPr.length} (total on ref: ${checkRuns.check_runs.length})`);

                    // If there are check runs for this PR, wait for them to complete
                    if (runsForThisPr.length > 0) {
                        const pendingChecksForPullRequest = pendingCheckRuns(runsForThisPr);

                        if (pendingChecksForPullRequest.length === 0) {
                            checksCompleted = true;
                            logDebugInfo('All check runs have completed.');

                            // Verify if all checks passed
                            const failedChecks = failedCheckRuns(runsForThisPr);

                            if (failedChecks.length > 0) {
                                throw new Error(`Checks failed: ${failedChecks.map(check => check.name).join(', ')}`);
                            }
                        } else {
                            logDebugInfo(`Waiting for ${pendingChecksForPullRequest.length} check runs to complete:`);
                            pendingChecksForPullRequest.forEach(check => {
                                logDebugInfo(`  - ${check.name} (Status: ${check.status})`);
                            });
                            await new Promise(resolve => setTimeout(resolve, iteration * 1000));
                            attempts++;
                            continue;
                        }
                    } else if (checkRuns.check_runs.length > 0 && runsForThisPr.length === 0) {
                        // There are runs on the ref but none for this PR. Either workflows for this PR
                        // haven't registered yet, or this PR/base has no required checks.
                        waitForPrChecksAttempts++;
                        if (waitForPrChecksAttempts >= maxWaitForPrChecksAttempts) {
                            // Give up waiting for PR-specific check runs; fall back to status checks
                            // before proceeding to merge (PR may have required status checks).
                            commitStatus.statuses.forEach(status => {
                                logDebugInfo(`Status check (fallback): ${status.context} (State: ${status.state})`);
                            });
                            const pendingChecksFallback = pendingStatuses(commitStatus.statuses);

                            if (pendingChecksFallback.length === 0) {
                                checksCompleted = true;
                                logDebugInfo(
                                    `No check runs for this PR after ${maxWaitForPrChecksAttempts} polls; no pending status checks; proceeding to merge.`,
                                );
                            } else {
                                logDebugInfo(
                                    `No check runs for this PR after ${maxWaitForPrChecksAttempts} polls; falling back to status checks. Waiting for ${pendingChecksFallback.length} status checks to complete.`,
                                );
                                pendingChecksFallback.forEach(check => {
                                    logDebugInfo(`  - ${check.context} (State: ${check.state})`);
                                });
                                await new Promise(resolve => setTimeout(resolve, iteration * 1000));
                                attempts++;
                            }
                        } else {
                            logDebugInfo('Check runs exist on ref but none for this PR yet; waiting for workflows to register.');
                            await new Promise(resolve => setTimeout(resolve, iteration * 1000));
                            attempts++;
                        }
                        continue;
                    } else {
                        // Fall back to status checks if no check runs exist
                        commitStatus.statuses.forEach(status => {
                            logDebugInfo(`Status check: ${status.context} (State: ${status.state})`);
                        });
                        const pendingChecks = pendingStatuses(commitStatus.statuses);

                        if (pendingChecks.length === 0) {
                            checksCompleted = true;
                            logDebugInfo('All status checks have completed.');
                        } else {
                            logDebugInfo(`Waiting for ${pendingChecks.length} status checks to complete:`);
                            pendingChecks.forEach(check => {
                                logDebugInfo(`  - ${check.context} (State: ${check.state})`);
                            });
                            await new Promise(resolve => setTimeout(resolve, iteration * 1000));
                            attempts++;
                        }
                    }
                }

                if (!checksCompleted) {
                    throw new Error('Timed out waiting for checks to complete');
                }
            }

            // Need PAT for merging to ensure it can trigger subsequent workflows
            await octokit.rest.pulls.merge({
                owner: owner,
                repo: repository,
                pull_number: pullRequest.number,
                merge_method: 'merge',
                commit_title: `Merge ${head} into ${base}. Forced merge with PAT token.`,
            });

            result.push(
                new Result({
                    id: 'branch_repository',
                    success: true,
                    executed: true,
                    steps: [
                        `The branch \`${head}\` was merged into \`${base}\`.`,
                    ],
                }),
            );
        } catch (error) {
            logError(`Error in PR workflow: ${error}`);

            // If the PR workflow fails, we try to merge directly - need PAT for direct merge to ensure it can trigger workflows
            try {
                const octokit = this.githubClient.getClient(token);
                await octokit.rest.repos.merge({
                    owner: owner,
                    repo: repository,
                    base: base,
                    head: head,
                    commit_message: `Forced merge of ${head} into ${base}. Automated merge with PAT token.`,
                });

                result.push(
                    new Result({
                        id: 'branch_repository',
                        success: true,
                        executed: true,
                        steps: [
                            `The branch \`${head}\` was merged into \`${base}\` using direct merge.`,
                        ],
                    }),
                );
                return result;
            } catch (directMergeError) {
                logError(`Error in direct merge attempt: ${directMergeError}`);
                result.push(
                    new Result({
                        id: 'branch_repository',
                        success: false,
                        executed: true,
                        steps: [
                            `Failed to merge branch \`${head}\` into \`${base}\`.`,
                        ],
                    }),
                );
                result.push(
                    new Result({
                        id: 'branch_repository',
                        success: false,
                        executed: true,
                        error: error,
                    }),
                );
                result.push(
                    new Result({
                        id: 'branch_repository',
                        success: false,
                        executed: true,
                        error: directMergeError,
                    }),
                );
            }
        }
        return result;
    };
}
