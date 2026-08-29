import { resolveWorkflowIdentifier } from '../workflow_context';

describe('resolveWorkflowIdentifier', () => {
    it('resolves the workflow file from GITHUB_WORKFLOW_REF', () => {
        expect(resolveWorkflowIdentifier(
            'vypdev/copilot/.github/workflows/copilot_issue.yml@refs/heads/master',
        )).toBe('copilot_issue.yml');
    });

    it('preserves nested workflow paths', () => {
        expect(resolveWorkflowIdentifier(
            'org/repo/.github/workflows/automation/copilot.yml@refs/heads/develop',
        )).toBe('automation/copilot.yml');
    });

    it.each([undefined, '', 'org/repo/workflow.yml@refs/heads/master'])(
        'returns undefined for an unusable workflow reference: %s',
        (workflowRef) => {
            expect(resolveWorkflowIdentifier(workflowRef)).toBeUndefined();
        },
    );
});
