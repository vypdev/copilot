import { JSON_SCHEMA, load } from 'js-yaml';
import type {
    NativeWorkflowCoordinationQueryPort,
    PreviousWorkflowRunsQuery,
    WorkflowQueueRequestContext,
} from '../../../application/ports/workflow_run_ports';
import {
    expectedNativeWorkflowGroup,
    hasNativeWorkflowCoordination,
} from '../../../application/policies/native_workflow_coordination_policy';
import type { GithubWorkflowDefinitionClient } from '../../../infrastructure/github/ports/github_workflow_provider_ports';
import { withWorkflowRunsRetry, WORKFLOW_RUNS_RETRY_POLICY, type WorkflowRunsRetryPolicy } from './workflow_runs_retry';

const MAX_WORKFLOW_BYTES = 256 * 1024;
type RetryDependencies = Parameters<typeof withWorkflowRunsRetry>[1];

/** Reads the workflow GitHub executed, never the possibly modified checkout. */
export class NativeWorkflowCoordinationRepository implements NativeWorkflowCoordinationQueryPort {
    constructor(
        private readonly client: GithubWorkflowDefinitionClient,
        private readonly retry: Omit<RetryDependencies, 'deadlineAtMilliseconds' | 'policy'> & { policy?: WorkflowRunsRetryPolicy },
    ) {}

    async isCoordinated(query: PreviousWorkflowRunsQuery, context: WorkflowQueueRequestContext): Promise<boolean> {
        const group = expectedNativeWorkflowGroup(query);
        const native = query.nativeCoordination;
        if (!group || !native) return false;

        const response = await withWorkflowRunsRetry(() => this.client.rest.repos.getContent({
            owner: query.owner,
            repo: query.repository,
            path: `.github/workflows/${query.workflowIdentifier}`,
            ref: native.workflowRevision,
        }), { ...this.retry, policy: this.retry.policy ?? WORKFLOW_RUNS_RETRY_POLICY,
            deadlineAtMilliseconds: context.deadlineAtMilliseconds });
        const file = response.data as { type?: string; encoding?: string; content?: string } | null;
        if (!file || Array.isArray(file) || file.type !== 'file' || file.encoding !== 'base64'
            || typeof file.content !== 'string' || file.content.length > MAX_WORKFLOW_BYTES * 2) {
            throw new Error('Executing workflow content is unavailable.');
        }
        const encoded = file.content.replace(/\s/gu, '');
        const bytes = Buffer.from(encoded, 'base64');
        if (bytes.toString('base64') !== encoded) throw new Error('Executing workflow encoding is invalid.');
        if (bytes.length > MAX_WORKFLOW_BYTES) throw new Error('Executing workflow exceeds the inspection limit.');
        const workflow: unknown = load(bytes.toString('utf8'), { schema: JSON_SCHEMA });
        return hasNativeWorkflowCoordination(workflow, native.jobId, group);
    }
}
