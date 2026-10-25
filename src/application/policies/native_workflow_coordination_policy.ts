import type { PreviousWorkflowRunsQuery } from '../ports/workflow_run_ports';

const PUSH_GROUP = 'copilot-push-${{ github.repository }}-${{ github.ref_name }}';
const PR_GROUP = 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}';

/** Closed recognition of the installed contract, without evaluating expressions. */
export function expectedNativeWorkflowGroup(query: PreviousWorkflowRunsQuery): string | undefined {
    const native = query.nativeCoordination;
    if (!native || !Number.isSafeInteger(query.currentRunId) || query.currentRunId <= 0
        || !/^[\w.-]+\.ya?ml$/u.test(query.workflowIdentifier ?? '')
        || !native.workflowRef.startsWith(`${query.owner}/${query.repository}/.github/workflows/${query.workflowIdentifier}@`)
        || native.workflowRef.endsWith('@')
        || !/^[a-f\d]{40}$/iu.test(native.workflowRevision)
        || !/^[a-zA-Z_][\w-]*$/u.test(native.jobId)) return undefined;

    if (native.eventName === 'push' && native.ref?.startsWith('refs/heads/')
        && native.ref.length > 'refs/heads/'.length) return PUSH_GROUP;
    const pullRequestNumber = native.pullRequestNumber;
    if (typeof pullRequestNumber !== 'number' || !Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) return undefined;
    if (native.eventName === 'pull_request') return `${PR_GROUP}-analysis`;
    if (native.eventName === 'pull_request_review') return `${PR_GROUP}-review-state`;
    return undefined;
}

export function hasNativeWorkflowCoordination(workflow: unknown, jobId: string, expectedGroup: string): boolean {
    const definition = record(workflow);
    const jobs = record(definition?.jobs);
    const job = record(jobs?.[jobId]);
    const concurrency = record(job?.concurrency);
    // Custom/reusable/workflow-level contracts retain conservative polling.
    // A single direct job also avoids confusing a reusable callee's job ID
    // with a different protected job in its caller's workflow context.
    return definition?.concurrency === undefined && jobs !== undefined && Object.keys(jobs).length === 1
        && Array.isArray(job?.steps)
        && job?.uses === undefined && concurrency?.group === expectedGroup
        && concurrency?.['cancel-in-progress'] === true
        && (concurrency.queue === undefined || concurrency.queue === 'single');
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : undefined;
}
