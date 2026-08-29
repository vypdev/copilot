import { IssueContentRepository } from "../issue_content_repository";
import { OctokitIssueContentClientAdapter } from "../../../../infrastructure/github/octokit_issue_adapters";

jest.mock('../../../../utils/logger', () => ({
    logError: jest.fn(),
    logDebugInfo: jest.fn(),
}));

const mockUpdate = jest.fn();
const mockGet = jest.fn();
const mockCreateComment = jest.fn();
const mockUpdateComment = jest.fn();
const mockIterator = jest.fn();

jest.mock('@actions/github', () => ({
    getOctokit: () => ({
        rest: {
            issues: {
                update: mockUpdate,
                get: mockGet,
                createComment: mockCreateComment,
                updateComment: mockUpdateComment,
                listComments: jest.fn(),
            },
        },
        paginate: { iterator: mockIterator },
    }),
}));

describe('IssueContentRepository', () => {
    const repository = new IssueContentRepository(new OctokitIssueContentClientAdapter());

    beforeEach(() => jest.clearAllMocks());

    it('updates and reads issue descriptions', async () => {
        mockUpdate.mockResolvedValue(undefined);
        mockGet.mockResolvedValue({ data: { body: 'body' } });

        await repository.updateDescription('owner', 'repo', 7, 'new body', 'token');
        const body = await repository.getDescription('owner', 'repo', 7, 'token');

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ body: 'new body' }));
        expect(body).toBe('body');
    });

    it('reads the strict issue description contract', async () => {
        mockGet.mockResolvedValue({ data: { body: null } });
        await expect(repository.getIssueDescription('owner', 'repo', 7, 'token')).resolves.toBe('');
    });

    it('preserves issue access failures instead of presenting them as an empty description', async () => {
        mockGet.mockRejectedValue(new Error('Not Found'));

        await expect(repository.getDescription('owner', 'repo', 7, 'token')).rejects.toThrow('Not Found');
    });

    it('preserves the comment watermark contract', async () => {
        mockCreateComment.mockResolvedValue(undefined);
        mockUpdateComment.mockResolvedValue(undefined);

        await repository.addComment('owner', 'repo', 7, 'comment', 'token');
        await repository.updateComment('owner', 'repo', 7, 12, 'updated', 'token');

        expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7 }));
        expect(mockUpdateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 12 }));
    });

    it('aggregates paginated comments', async () => {
        mockIterator.mockReturnValue((async function* () {
            yield { data: [{ id: 1, body: 'first', user: { login: 'one' } }] };
            yield { data: [{ id: 2, body: null, user: null }] };
        })());

        await expect(repository.listIssueComments('owner', 'repo', 7, 'token')).resolves.toEqual([
            { id: 1, body: 'first', user: { login: 'one' } },
            { id: 2, body: null, user: null },
        ]);
    });
});
