import * as github from '@actions/github';
import { IssueTypeAssignmentRepository } from '../issue/issue_type_assignment_repository';
import { OctokitGraphqlTransportClientAdapter } from '../../../infrastructure/github/octokit_project_adapters';
import { IssueTypes } from '../../model/issue_types';
import { Labels } from '../../model/labels';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ logDebugInfo: jest.fn(), logError: jest.fn() }));

const mockGraphql = jest.fn();
const mockGetId = jest.fn().mockResolvedValue('I_1');
const issueTypes = new IssueTypes(
    'Task', 'Task desc', 'BLUE', 'Bug', 'Bug desc', 'RED', 'Feature', 'Feature desc', 'GREEN',
    'Docs', 'Docs desc', 'GREY', 'Maintenance', 'Maint desc', 'GREY', 'Hotfix', 'Hotfix desc', 'RED',
    'Release', 'Release desc', 'BLUE', 'Question', 'Q desc', 'PURPLE', 'Help', 'Help desc', 'PURPLE',
);

const labels = (currentIssueLabels: string[]) => {
    const value = new Labels(
        'launch', 'bug', 'bugfix', 'hotfix', 'enhancement', 'feature', 'release', 'question', 'help',
        'deploy', 'deployed', 'docs', 'documentation', 'chore', 'maintenance', 'priority-high',
        'priority-medium', 'priority-low', 'priority-none', 'xxl', 'xl', 'l', 'm', 's', 'xs',
    );
    value.currentIssueLabels = currentIssueLabels;
    return value;
};

describe('IssueTypeAssignmentRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (github.getOctokit as jest.Mock).mockReturnValue({ graphql: mockGraphql });
    });

    it('uses the hotfix type when multiple labels match', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T', name: 'Hotfix' }] } } })
            .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
        await new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType('org', 'repo', 1, labels(['hotfix', 'bug']), issueTypes, 'token');
        expect(mockGraphql.mock.calls[1][1]).toEqual({ issueId: 'I_1', issueTypeId: 'T' });
    });

    it('creates a missing type and updates the issue', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [] } } })
            .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'T_NEW' } } })
            .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
        await new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType('org', 'repo', 1, labels(['feature']), issueTypes, 'token');
        expect(mockGraphql).toHaveBeenCalledTimes(3);
        expect(mockGraphql.mock.calls[2][1]).toEqual({ issueId: 'I_1', issueTypeId: 'T_NEW' });
    });

    it('falls back without updating when type creation fails', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [] } } })
            .mockRejectedValueOnce(new Error('Create failed'));
        await expect(new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType('org', 'repo', 1, labels(['release']), issueTypes, 'token')).resolves.toBeUndefined();
        expect(mockGraphql).toHaveBeenCalledTimes(2);
    });
});
