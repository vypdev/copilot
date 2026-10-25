import { expectedNativeWorkflowGroup, hasNativeWorkflowCoordination } from '../native_workflow_coordination_policy';
import type { PreviousWorkflowRunsQuery } from '../../ports/workflow_run_ports';

const group = 'copilot-pr-${{ github.repository }}-${{ github.event.pull_request.number }}-analysis';
const native = {
  workflowRef: 'org/repo/.github/workflows/custom.yml@refs/heads/main',
  workflowRevision: 'a'.repeat(40), jobId: 'review', eventName: 'pull_request', pullRequestNumber: 21,
};
const query: PreviousWorkflowRunsQuery = {
  owner: 'org', repository: 'repo', currentRunId: 200, workflowIdentifier: 'custom.yml', nativeCoordination: native,
};
const workflow = (concurrency: unknown = { group, 'cancel-in-progress': true }) => ({
  jobs: { review: { steps: [], concurrency } },
});

describe('native workflow coordination policy', () => {
  it.each([
    ['pull_request', undefined, 21, group],
    ['pull_request_review', undefined, 21, group.replace('analysis', 'review-state')],
    ['push', 'refs/heads/feature/work', undefined, 'copilot-push-${{ github.repository }}-${{ github.ref_name }}'],
  ])('recognizes the exact %s lane with valid resource identity', (eventName, ref, pullRequestNumber, expected) => {
    expect(expectedNativeWorkflowGroup({ ...query, nativeCoordination: { ...native, eventName, ref, pullRequestNumber } })).toBe(expected);
    expect(hasNativeWorkflowCoordination(workflow({ group: expected, 'cancel-in-progress': true }), 'review', expected)).toBe(true);
  });

  it.each([
    { nativeCoordination: undefined },
    { currentRunId: Number.NaN }, { currentRunId: 0 },
    { workflowIdentifier: '../custom.yml' }, { workflowIdentifier: undefined },
    { nativeCoordination: { ...native, workflowRef: 'elsewhere/repo/.github/workflows/custom.yml@main' } },
    { nativeCoordination: { ...native, workflowRef: 'org/repo/.github/workflows/custom.yml@' } },
    { nativeCoordination: { ...native, workflowRevision: 'main' } },
    { nativeCoordination: { ...native, jobId: '' } },
    { nativeCoordination: { ...native, pullRequestNumber: 0 } },
    { nativeCoordination: { ...native, pullRequestNumber: undefined } },
    { nativeCoordination: { ...native, pullRequestNumber: 1.5 } },
    { nativeCoordination: { ...native, eventName: 'issues' } },
    { nativeCoordination: { ...native, eventName: 'push', ref: 'refs/tags/v3' } },
    { nativeCoordination: { ...native, eventName: 'push', ref: undefined } },
    { nativeCoordination: { ...native, eventName: 'push', ref: 'refs/heads/', pullRequestNumber: undefined } },
  ])('retains the conservative queue for invalid or unrelated metadata %j', patch => {
    expect(expectedNativeWorkflowGroup({ ...query, ...patch })).toBeUndefined();
  });

  it.each([
    undefined, null, [], {}, { concurrency: {} }, { jobs: [] }, { jobs: { review: null } },
    { jobs: { review: { uses: 'org/repo/workflow.yml@v1', concurrency: { group, 'cancel-in-progress': true } } } },
    { ...workflow(), concurrency: 'outer' },
    { jobs: { ...workflow().jobs, other: { uses: 'org/repo/workflow.yml@v1' } } },
    workflow('custom'), workflow({ group: 'custom', 'cancel-in-progress': true }),
    workflow({ group, 'cancel-in-progress': false }),
    workflow({ group, 'cancel-in-progress': '${{ true }}' }),
    workflow({ group, 'cancel-in-progress': true, queue: 'max' }),
  ])('does not infer native protection from a custom or incomplete workflow %j', value => {
    expect(hasNativeWorkflowCoordination(value, 'review', group)).toBe(false);
  });

  it('accepts explicit single-pending native queue semantics', () => {
    expect(hasNativeWorkflowCoordination(workflow({ group, 'cancel-in-progress': true, queue: 'single' }), 'review', group)).toBe(true);
  });
});
