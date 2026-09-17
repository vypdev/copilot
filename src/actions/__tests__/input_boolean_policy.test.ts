import { isEnabledInput, parseIssueWorkflowBoolean } from '../input_boolean_policy';

describe('input boolean policy', () => {
    it('accepts string and boolean true values', () => {
        expect(isEnabledInput('true')).toBe(true);
        expect(isEnabledInput(true)).toBe(true);
    });

    it('rejects other values', () => {
        expect(isEnabledInput('false')).toBe(false);
        expect(isEnabledInput(false)).toBe(false);
        expect(isEnabledInput(undefined)).toBe(false);
    });

    it('bounds issue workflow settings to explicit booleans', () => {
        expect(parseIssueWorkflowBoolean(undefined, 'pre-branch-sdd', false)).toBe(false);
        expect(parseIssueWorkflowBoolean('true', 'pre-branch-sdd', false)).toBe(true);
        expect(parseIssueWorkflowBoolean(false, 'issue-managed-branches', true)).toBe(false);
        expect(() => parseIssueWorkflowBoolean('yes', 'pre-branch-sdd', false)).toThrow('pre-branch-sdd must be true or false');
    });
});
