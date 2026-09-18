import * as core from '@actions/core';
import * as github from '@actions/github';
import { ObservePullRequestApprovalUseCase } from '../application/usecases/pull_request_approval/observe_pull_request_approval_use_case';
import { PullRequestApprovalRepository } from '../data/repository/pull_request/pull_request_approval_repository';
import type { ApprovalObservationTarget } from '../application/ports/pull_request_approval_ports';
import { getGithubActionInput } from './github_action_input';
import { parseDelimitedValues } from './input_values_policy';
import { readGithubActionLocaleInputs } from './github_action_locale_inputs';
import { renderApprovalRunSummary } from '../application/policies/pull_request_approval_presentation_policy';

/** Dedicated trusted-default-branch route. It never calls the agent or checks out PR code. */
export async function runPullRequestApprovalAction(token: string): Promise<void> {
    const repository = github.context.payload.repository;
    const repositoryId = repository?.id;
    if (!Number.isSafeInteger(repositoryId) || !repositoryId || repositoryId <= 0) {
        throw new Error('Approval observer requires a bound repository ID.');
    }
    const owner = github.context.repo.owner;
    const repo = github.context.repo.repo;
    let locale = 'en-US';
    try { locale = readGithubActionLocaleInputs(getGithubActionInput).pullRequest; } catch {
        // A malformed optional locale must not change approval eligibility.
    }
    const targetNumbers = await resolvePullNumbers(token, owner, repo);
    if (targetNumbers.length === 0) {
        await core.summary.addRaw('Copilot approval: no unambiguous same-repository PR matched this wakeup.').write();
        return;
    }
    const port = new PullRequestApprovalRepository(token, {
        mainBranch: getGithubActionInput('main-branch') || 'master',
        developmentBranch: getGithubActionInput('development-branch') || 'develop',
        branchPrefixes: {
            feature: getGithubActionInput('feature-tree') || 'feature',
            bugfix: getGithubActionInput('bugfix-tree') || 'bugfix',
            documentation: getGithubActionInput('docs-tree') || 'docs',
            chore: getGithubActionInput('chore-tree') || 'chore',
        },
        bugbotSeverity: getGithubActionInput('bugbot-severity') || 'low',
        bugbotDryRun: getGithubActionInput('bugbot-dry-run') === 'true',
        bugbotIgnorePatterns: parseDelimitedValues(getGithubActionInput('ai-ignore-files')),
        githubToken: process.env.COPILOT_APPROVAL_CHECK_TOKEN,
        locale,
    });
    const useCase = new ObservePullRequestApprovalUseCase(port);
    const failedPulls: number[] = [];
    for (const pullNumber of targetNumbers) {
        const target: ApprovalObservationTarget = { owner, repository: repo, repositoryId, pullNumber };
        const result = await useCase.execute(target);
        const safeCode = result.decision.code.replace(/[^a-z0-9-]/gu, '').slice(0, 60);
        core.info(`PR #${pullNumber}: ${result.decision.status} (${safeCode}); assessment ${result.publication}.`);
        if (result.publication === 'failed' || [
            'invalid-policy', 'evidence-unavailable', 'target-mismatch',
            'pre-submit-unavailable', 'publication-unknown',
        ].includes(result.decision.code)) failedPulls.push(pullNumber);
        if (result.evidence) {
            core.summary.addRaw(renderApprovalRunSummary({
                target, evidence: result.evidence, decision: result.decision,
                ...(result.reviewId ? { reviewId: result.reviewId } : {}),
                mode: result.mode ?? 'unknown', publication: result.publication,
                wakeup: github.context.eventName, locale,
            }) + '\n');
        } else {
            core.summary.addRaw(`PR #${pullNumber}: ${result.decision.status} (${safeCode}). Assessment: ${result.publication}.\n`);
        }
    }
    await core.summary.write();
    if (failedPulls.length > 0) {
        throw new Error(`Approval observation needs attention for PR(s) ${failedPulls.join(', ')}; inspect the Job Summary and rerun after recovery.`);
    }
}

async function resolvePullNumbers(token: string, owner: string, repo: string): Promise<number[]> {
    const octokit = github.getOctokit(token);
    if (github.context.eventName === 'workflow_dispatch') {
        const raw = getGithubActionInput('pr-approval-pr-number');
        const pullNumber = Number(raw);
        if (!Number.isSafeInteger(pullNumber) || pullNumber <= 0) throw new Error('A positive PR number is required for manual approval observation.');
        const permission = await octokit.rest.repos.getCollaboratorPermissionLevel({
            owner, repo, username: github.context.actor,
        });
        if (!['admin', 'maintain', 'write'].includes(permission.data.permission)) {
            throw new Error('Manual approval observation requires repository write permission.');
        }
        return [pullNumber];
    }
    if (github.context.eventName !== 'workflow_run' || github.context.payload.action !== 'completed') return [];
    const run = github.context.payload.workflow_run;
    if (!run || run.head_repository?.id !== github.context.payload.repository?.id) return [];
    const associatedPulls = Array.isArray(run.pull_requests) ? run.pull_requests as Array<{ number?: number }> : [];
    const candidates = associatedPulls.filter(pull => Number.isSafeInteger(pull.number) && Number(pull.number) > 0)
        .map(pull => Number(pull.number));
    if (new Set(candidates).size === 1) return [candidates[0]];
    if (candidates.length > 1) return [];
    const headSha = run.head_sha;
    if (!/^[a-f0-9]{40}$/iu.test(headSha ?? '')) return [];
    const matches: number[] = [];
    let scanned = 0;
    for await (const response of octokit.paginate.iterator(octokit.rest.pulls.list, { owner, repo, state: 'open', per_page: 100 })) {
        for (const pull of response.data) {
            scanned += 1;
            if (scanned > 3000) return [];
            if ((pull.head.sha === headSha || pull.merge_commit_sha === headSha)
                && pull.head.repo?.id === github.context.payload.repository?.id) matches.push(pull.number);
        }
        if (matches.length > 1) return [];
    }
    return matches.length === 1 ? matches : [];
}
