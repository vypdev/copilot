import * as github from '@actions/github';
import { IssueTypeAssignmentRepository } from '../issue/issue_type_assignment_repository';
import { OctokitGraphqlTransportClientAdapter } from '../../../infrastructure/github/octokit_project_adapters';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));
jest.mock('../../../utils/logger', () => ({ logDebugInfo: jest.fn(), logError: jest.fn() }));

const mockGraphql = jest.fn();
const mockGetId = jest.fn().mockResolvedValue('I_1');
describe('IssueTypeAssignmentRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (github.getOctokit as jest.Mock).mockReturnValue({ graphql: mockGraphql });
    });

    it('assigns the already selected issue type', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [{ id: 'T', name: 'Hotfix' }] } } })
            .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
        await new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType(
            'org', 'repo', 1, { name: 'Hotfix', description: 'Hotfix desc', color: 'RED' }, 'token',
        );
        expect(mockGraphql.mock.calls[1][1]).toEqual({ issueId: 'I_1', issueTypeId: 'T' });
    });

    it('creates a missing type and updates the issue', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [] } } })
            .mockResolvedValueOnce({ createIssueType: { issueType: { id: 'T_NEW' } } })
            .mockResolvedValueOnce({ updateIssueIssueType: { issue: { id: 'I_1' } } });
        await new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType(
            'org', 'repo', 1, { name: 'Feature', description: 'Feature desc', color: 'GREEN' }, 'token',
        );
        expect(mockGraphql).toHaveBeenCalledTimes(3);
        expect(mockGraphql.mock.calls[2][1]).toEqual({ issueId: 'I_1', issueTypeId: 'T_NEW' });
    });

    it('falls back without updating when type creation fails', async () => {
        mockGraphql
            .mockResolvedValueOnce({ organization: { id: 'O_1', issueTypes: { nodes: [] } } })
            .mockRejectedValueOnce(new Error('Create failed'));
        await expect(new IssueTypeAssignmentRepository(mockGetId, new OctokitGraphqlTransportClientAdapter()).setIssueType(
            'org', 'repo', 1, { name: 'Release', description: 'Release desc', color: 'BLUE' }, 'token',
        )).resolves.toBeUndefined();
        expect(mockGraphql).toHaveBeenCalledTimes(2);
    });
});
