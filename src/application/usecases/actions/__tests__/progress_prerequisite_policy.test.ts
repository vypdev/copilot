import { validateProgressPrerequisites } from '../progress_prerequisite_policy';

describe('progress prerequisite policy', () => {
    it('reports the first missing prerequisite in stable order', () => {
        expect(validateProgressPrerequisites({ agentReady: false, issueNumber: -1 })).toContain('Missing required agent configuration');
        expect(validateProgressPrerequisites({ agentReady: true, issueNumber: -1 })).toContain('Issue number not found');
        expect(validateProgressPrerequisites({ agentReady: true, issueNumber: 12, issueDescription: '' })).toContain('Could not retrieve issue description');
        expect(validateProgressPrerequisites({ agentReady: true, issueNumber: 12, issueDescription: 'body' })).toContain('Could not find branch');
    });

    it('accepts complete prerequisites', () => {
        expect(validateProgressPrerequisites({ agentReady: true, issueNumber: 12, issueDescription: 'body', branch: 'feature/12-fix' })).toBeUndefined();
    });
});
