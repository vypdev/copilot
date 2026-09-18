import * as github from '@actions/github';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ApprovalReadinessFacts, SetupApprovalReadinessPort } from '../application/ports/setup_approval_readiness_port';
import type { SetupConfiguration } from '../domain/setup';
import { renderApprovalObserverWorkflow } from '../domain/setup_approval_workflow';

export class GithubSetupApprovalReadinessAdapter implements SetupApprovalReadinessPort {
    async inspect(owner: string, repository: string, setupToken: string, configuration: Readonly<SetupConfiguration>): Promise<ApprovalReadinessFacts> {
        const octokit = github.getOctokit(setupToken);
        const policy = configuration.pullRequestApproval;
        const branches = policy.targetRoles.map(role => ({
            role,
            branch: role === 'development' ? configuration.repository.developmentBranch : configuration.repository.mainBranch,
        }));
        const rules = await Promise.all(branches.map(async ({ role, branch }) => {
            try {
                const effective = await octokit.request('GET /repos/{owner}/{repo}/rules/branches/{branch}', {
                    owner, repo: repository, branch,
                });
                const items = Array.isArray(effective.data) ? effective.data as Array<Record<string, unknown>> : [];
                let classic: Record<string, unknown> | undefined;
                try {
                    const response = await octokit.rest.repos.getBranchProtection({ owner, repo: repository, branch });
                    classic = response.data as unknown as Record<string, unknown>;
                } catch (error) { if (statusOf(error) !== 404) throw error; }
                const reviews = items.filter(item => item.type === 'pull_request');
                const classicReview = record(classic?.required_pull_request_reviews);
                const dismissesStaleReviews = (reviews.length > 0 || Boolean(classicReview))
                    && reviews.every(item => record(item.parameters)?.dismiss_stale_reviews === true)
                    && (!classicReview || classicReview.dismiss_stale_reviews === true);
                const classicChecks = record(classic?.required_status_checks);
                const required = [
                    ...array(classicChecks?.contexts),
                    ...array(classicChecks?.checks).map(check => record(check)?.context),
                    ...items.filter(item => item.type === 'required_status_checks')
                        .flatMap(item => array(record(item.parameters)?.required_status_checks).map(check => record(check)?.context)),
                ];
                return { role, branch, readable: true, dismissesStaleReviews, approvalCheckCycle: required.includes('Copilot / Approval') };
            } catch {
                return { role, branch, readable: false, dismissesStaleReviews: false, approvalCheckCycle: false };
            }
        }));
        const defaultBranchWorkflow = await this.compareDefaultBranchWorkflow(octokit, owner, repository, configuration);
        const requiredNames = [...new Set(['Copilot - Pull Request', ...policy.testChecks.map(check => check.workflowName)])];
        let missingWorkflowNames: string[];
        try {
            const workflows = await octokit.paginate(octokit.rest.actions.listRepoWorkflows, { owner, repo: repository, per_page: 100 }) as Array<{ state: string; name: string }>;
            const names = new Set(workflows.filter(workflow => workflow.state === 'active').map(workflow => workflow.name));
            missingWorkflowNames = requiredNames.filter(name => !names.has(name));
        } catch {
            missingWorkflowNames = requiredNames;
        }
        return { defaultBranchWorkflow, rules, missingWorkflowNames };
    }

    private async compareDefaultBranchWorkflow(
        octokit: ReturnType<typeof github.getOctokit>,
        owner: string,
        repository: string,
        configuration: Readonly<SetupConfiguration>,
    ): Promise<ApprovalReadinessFacts['defaultBranchWorkflow']> {
        try {
            const repo = await octokit.rest.repos.get({ owner, repo: repository });
            const response = await octokit.rest.repos.getContent({
                owner, repo: repository, path: '.github/workflows/copilot_pull_request_approval.yml', ref: repo.data.default_branch,
            });
            if (Array.isArray(response.data) || response.data.type !== 'file' || !('content' in response.data)) return 'drift';
            const installed = Buffer.from(response.data.content, 'base64').toString('utf8');
            if (owner.toLowerCase() === 'vypdev' && repository.toLowerCase() === 'copilot') {
                // The source repository runs the unreleased local Action only from its
                // trusted default branch. This is a reviewed variant, not template drift.
                const sourceObserver = readFileSync(join(__dirname, '..', '..', 'setup', 'source-workflows', 'copilot_pull_request_approval.yml'), 'utf8');
                return installed === sourceObserver ? 'matching' : 'drift';
            }
            const source = readFileSync(join(__dirname, '..', '..', 'setup', 'workflows', 'copilot_pull_request_approval.yml'), 'utf8');
            const expected = renderApprovalObserverWorkflow(source, configuration.pullRequestApproval);
            return installed === expected ? 'matching' : 'drift';
        } catch (error) {
            return statusOf(error) === 404 ? 'missing' : 'unavailable';
        }
    }
}

function statusOf(error: unknown): number | undefined {
    return error && typeof error === 'object' && 'status' in error ? Number((error as { status: unknown }).status) : undefined;
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
