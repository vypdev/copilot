/**
 * Resolves the workflow file accepted by GitHub's workflow-runs endpoint from
 * the default GITHUB_WORKFLOW_REF value.
 */
export function resolveWorkflowIdentifier(workflowRef: string | undefined): string | undefined {
    const reference = workflowRef?.trim();
    if (!reference) {
        return undefined;
    }

    const workflowPath = reference.split('@', 1)[0] ?? '';
    const workflowMarker = '/.github/workflows/';
    const markerIndex = workflowPath.indexOf(workflowMarker);
    if (markerIndex < 0) {
        return undefined;
    }

    const workflowIdentifier = workflowPath.slice(markerIndex + workflowMarker.length).trim();
    return workflowIdentifier || undefined;
}
