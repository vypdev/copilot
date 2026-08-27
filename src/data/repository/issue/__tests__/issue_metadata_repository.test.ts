import { IssueMetadataRepository } from '../issue_metadata_repository';
import { OctokitGraphqlTransportClientAdapter } from '../../../../infrastructure/github/octokit_project_adapters';
import { OctokitIssueMetadataClientAdapter } from '../../../../infrastructure/github/octokit_issue_adapters';

const mockGet = jest.fn();
const mockPullGet = jest.fn();
const mockGraphql = jest.fn();

jest.mock('@actions/github', () => ({
    getOctokit: () => ({
        rest: { issues: { get: mockGet }, pulls: { get: mockPullGet } },
        graphql: (...args: unknown[]) => mockGraphql(...args),
    }),
}));

describe('IssueMetadataRepository', () => {
    const repository = new IssueMetadataRepository(new OctokitIssueMetadataClientAdapter(), new OctokitGraphqlTransportClientAdapter());

    beforeEach(() => jest.clearAllMocks());

    it('maps issue metadata and distinguishes issues from pull requests', async () => {
        mockGraphql.mockResolvedValue({ repository: { issue: { id: 'node-7' } } });
        mockGet.mockResolvedValue({ data: { milestone: { id: 1, title: 'v1', description: null }, pull_request: undefined } });

        await expect(repository.getId('owner', 'repo', 7, 'token')).resolves.toBe('node-7');
        await expect(repository.getMilestone('owner', 'repo', 7, 'token')).resolves.toMatchObject({ title: 'v1' });
        await expect(repository.isIssue('owner', 'repo', 7, 'token')).resolves.toBe(true);
    });

    it('returns pull request title and head branch', async () => {
        mockGet.mockResolvedValueOnce({ data: { title: 'title', pull_request: {} } });
        mockGet.mockResolvedValueOnce({ data: { pull_request: {} } });
        mockPullGet.mockResolvedValue({ data: { head: { ref: 'feature/7' } } });

        await expect(repository.getTitle('owner', 'repo', 7, 'token')).resolves.toBe('title');
        await expect(repository.getHeadBranch('owner', 'repo', 7, 'token')).resolves.toBe('feature/7');
    });

    it('returns no head branch for a regular issue', async () => {
        mockGet.mockResolvedValue({ data: { pull_request: undefined } });

        await expect(repository.getHeadBranch('owner', 'repo', 7, 'token')).resolves.toBeUndefined();
        expect(mockPullGet).not.toHaveBeenCalled();
    });
});
