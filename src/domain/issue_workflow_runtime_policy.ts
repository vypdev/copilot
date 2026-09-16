import type { IssueWorkflowAdmission } from './issue_workflow_profile';

export type IssueWorkflowRuntimeMode =
  | 'execute'
  | 'noop'
  | 'block'
  | 'continuation-only'
  | 'durable-operation';

export interface IssueWorkflowRuntimeDecision {
  readonly mode: IssueWorkflowRuntimeMode;
  readonly message?: string;
}

export interface IssueWorkflowRuntimeContext {
  readonly admission?: IssueWorkflowAdmission;
  readonly unlinkedPullRequest: boolean;
  readonly route: 'issue' | 'pull-request' | 'push' | 'single-action' | 'other';
  readonly explicit: boolean;
  readonly singleAction?: string;
  readonly hasManagedState: boolean;
  readonly hasDurableOperation: boolean;
}

const DURABLE_CONTINUATION_ACTIONS = new Set([
  'continue_deployment_action',
  'published_deployment_action',
  'failed_deployment_action',
  'create_tag',
  'create_release',
]);

/**
 * Resolves whether an issue-bound run may cross the mutation boundary.
 *
 * Live issue state and durable state must already have been loaded. This
 * policy deliberately has no label precedence or provider fallback.
 */
export function decideIssueWorkflowRuntime(context: IssueWorkflowRuntimeContext): IssueWorkflowRuntimeDecision {
  // Failure reporting must remain reachable even when the issue itself is no
  // longer admitted; this action only publishes the already-bounded result.
  if (context.singleAction === 'publish_issue_comment') return { mode: 'execute' };
  if (context.unlinkedPullRequest || !context.admission) return { mode: 'execute' };
  if (context.admission.status === 'eligible') return { mode: 'execute' };
  if (context.admission.status === 'conflict') {
    return {
      mode: 'block',
      message: `Issue has conflicting workflow labels: ${context.admission.kinds.join(', ')}.`,
    };
  }
  if (context.admission.status === 'invalid') {
    const detail = context.admission.missingHeadings.length > 0
      ? `missing headings: ${context.admission.missingHeadings.join(', ')}`
      : `invalid fields: ${context.admission.invalidFields?.join(', ') ?? 'unknown'}`;
    return {
      mode: 'block',
      message: `The ${context.admission.kind} Issue Form is incomplete; ${detail}.`,
    };
  }

  const identity = context.admission.status === 'disabled'
    ? `Issue workflow "${context.admission.kind}" is disabled in the repository profile.`
    : 'Issue is unmanaged because no recognized issue workflow label was found.';

  if (context.hasDurableOperation) {
    if (context.singleAction === 'prepare_deployment_action') {
      return { mode: 'block', message: `${identity} A new deployment cannot start from disabled work.` };
    }
    if (context.route === 'single-action' && !DURABLE_CONTINUATION_ACTIONS.has(context.singleAction ?? '')) {
      return { mode: 'block', message: `${identity} Only the existing durable deployment operation may continue.` };
    }
    if (context.route === 'issue') return { mode: 'noop', message: identity };
    return { mode: 'durable-operation', message: identity };
  }

  if (context.hasManagedState) {
    if (context.route === 'pull-request' || context.route === 'push') {
      return { mode: 'continuation-only', message: identity };
    }
    if (context.explicit) {
      return { mode: 'block', message: `${identity} Existing work is limited to pull-request completion and cleanup.` };
    }
    return { mode: 'noop', message: identity };
  }

  return context.explicit
    ? { mode: 'block', message: identity }
    : { mode: 'noop', message: identity };
}
