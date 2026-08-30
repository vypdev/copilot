import { logDebugInfo } from '../../utils/logger';
import type { GithubBranchMergeClient } from '../../infrastructure/github/ports/github_branch_provider_ports';
import {
    blockingCheckRuns,
    blockingStatuses,
    isBlockingCombinedStatus,
    pendingStatuses,
} from './merge_checks_policy';
import { assessMergeChecksPoll, type MergeChecksPollAssessment } from './merge_checks_waiter_policy';

/** Polls only the checks relevant to one pull request before a merge. */
export class MergeChecksWaiter {
    async wait(
        octokit: GithubBranchMergeClient,
        owner: string,
        repository: string,
        head: string,
        pullRequestNumber: number,
        timeout: number,
    ): Promise<void> {
        const pollIntervalSeconds = 10;
        const maxWaitForPrChecksAttempts = 3;
        let attempts = 0;
        let waitForPrChecksAttempts = 0;
        const maxAttempts = timeout === 0
            ? Number.POSITIVE_INFINITY
            : Math.max(1, Math.ceil(timeout / pollIntervalSeconds));

        while (attempts < maxAttempts) {
            const { data: checkRuns } = await octokit.rest.checks.listForRef({ owner, repo: repository, ref: head });
            const { data: commitStatus } = await octokit.rest.repos.getCombinedStatusForRef({ owner, repo: repository, ref: head });

            logDebugInfo(`Combined status state: ${commitStatus.state}`);
            const assessment = assessMergeChecksPoll({
                checkRuns: checkRuns.check_runs,
                pullRequestNumber,
                combinedStatus: commitStatus.state,
                statuses: commitStatus.statuses,
                registrationAttempts: waitForPrChecksAttempts,
                maximumRegistrationAttempts: maxWaitForPrChecksAttempts,
            });
            waitForPrChecksAttempts = assessment.nextRegistrationAttempts;
            if (this.handleAssessment(assessment, commitStatus.state, commitStatus.statuses, maxWaitForPrChecksAttempts)) return;

            await this.waitForNextCheckPoll(pollIntervalSeconds);
            attempts++;
        }

        throw new Error('Timed out waiting for checks to complete');
    }

    private handleAssessment(
        assessment: MergeChecksPollAssessment,
        combinedStatus: string,
        statuses: ReadonlyArray<{ context: string; state: string }>,
        maximumRegistrationAttempts: number,
    ): boolean {
        if (assessment.kind === 'completed') {
            if (assessment.source === 'pull-request-checks') {
                this.assertChecksPassed(assessment.checkRuns, combinedStatus, statuses);
                logDebugInfo('All check runs have completed.');
            } else {
                this.assertStatusChecksPassed(combinedStatus, statuses);
                logDebugInfo(`No check runs for this PR after ${maximumRegistrationAttempts} polls; no pending status checks; proceeding to merge.`);
            }
            return true;
        }
        if (assessment.kind === 'pending-check-runs') {
            this.logPendingCheckRuns(assessment.pendingChecks);
        } else if (assessment.kind === 'waiting-for-registration') {
            logDebugInfo('Check runs exist on ref but none for this PR yet; waiting for workflows to register.');
        } else if (assessment.kind === 'fallback-status-checks') {
            logDebugInfo(`No check runs for this PR after ${maximumRegistrationAttempts} polls; falling back to status checks.`);
            this.logPendingStatusChecks(assessment.statuses, 'fallback');
        } else {
            this.logPendingStatusChecks(assessment.statuses);
        }
        return false;
    }

    private logPendingCheckRuns(checks: ReadonlyArray<{ name: string; status: string }>): void {
        logDebugInfo(`Waiting for ${checks.length} check runs to complete:`);
        checks.forEach(check => logDebugInfo(`  - ${check.name} (Status: ${check.status})`));
    }

    private logPendingStatusChecks(
        statuses: ReadonlyArray<{ context: string; state: string }>,
        label = '',
    ): void {
        const prefix = label ? `Status check (${label})` : 'Status check';
        const pendingChecks = pendingStatuses(statuses);
        statuses.forEach(status => logDebugInfo(`${prefix}: ${status.context} (State: ${status.state})`));
        logDebugInfo(`Waiting for ${pendingChecks.length} status checks to complete:`);
        pendingChecks.forEach(check => logDebugInfo(`  - ${check.context} (State: ${check.state})`));
    }

    private async waitForNextCheckPoll(pollIntervalSeconds: number): Promise<void> {
        await new Promise(resolve => setTimeout(resolve, pollIntervalSeconds * 1000));
    }

    private assertChecksPassed(
        checkRuns: ReadonlyArray<{ status: string; conclusion: string | null; name: string }>,
        combinedStatus: string,
        statuses: ReadonlyArray<{ context: string; state: string }>,
    ): void {
        const blockingChecks = blockingCheckRuns(checkRuns);
        if (blockingChecks.length > 0) {
            throw new Error(`Checks did not pass: ${blockingChecks.map(check => `${check.name} (${check.conclusion ?? check.status})`).join(', ')}`);
        }
        this.assertStatusChecksPassed(combinedStatus, statuses);
    }

    private assertStatusChecksPassed(
        combinedStatus: string,
        statuses: ReadonlyArray<{ context: string; state: string }>,
    ): void {
        const blockingStatusChecks = blockingStatuses(statuses);
        if (isBlockingCombinedStatus(combinedStatus) || blockingStatusChecks.length > 0) {
            const statusDescription = blockingStatusChecks.map(status => `${status.context} (${status.state})`).join(', ');
            throw new Error(`Status checks did not pass: ${statusDescription || combinedStatus}`);
        }
    }
}
