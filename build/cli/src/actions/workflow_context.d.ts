/**
 * Resolves the workflow file accepted by GitHub's workflow-runs endpoint from
 * the default GITHUB_WORKFLOW_REF value.
 */
export declare function resolveWorkflowIdentifier(workflowRef: string | undefined): string | undefined;
