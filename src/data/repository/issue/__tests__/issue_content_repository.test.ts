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
const mockDeleteComment = jest.fn();
const mockIterator = jest.fn();

jest.mock('@actions/github', () => ({
    getOctokit: () => ({
        rest: {
            issues: {
                update: mockUpdate,
                get: mockGet,
                createComment: mockCreateComment,
                updateComment: mockUpdateComment,
                deleteComment: mockDeleteComment,
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

    it('publishes exactly the semantic body without a visible branding footer', async () => {
        mockCreateComment.mockResolvedValue(undefined);
        mockUpdateComment.mockResolvedValue(undefined);

        await repository.addComment('owner', 'repo', 7, 'comment', 'token');
        await repository.updateComment('owner', 'repo', 7, 12, 'updated', 'token');

        expect(mockCreateComment).toHaveBeenCalledWith(expect.objectContaining({ issue_number: 7, body: 'comment' }));
        expect(mockUpdateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 12, body: 'updated' }));
    });

    it.each(['', '   ', '\n<!-- copilot metadata -->\n'])('does not publish an empty comment body: %j', async (comment) => {
        await repository.addComment('owner', 'repo', 7, comment, 'token');
        await repository.updateComment('owner', 'repo', 7, 12, comment, 'token');

        expect(mockCreateComment).not.toHaveBeenCalled();
        expect(mockUpdateComment).not.toHaveBeenCalled();
    });

    it('removes an exact duplicate comment', async () => {
        mockDeleteComment.mockResolvedValue(undefined);

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token')).resolves.toBe('removed');

        expect(mockDeleteComment).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', comment_id: 12 });
    });

    it('treats an already-absent duplicate as removed', async () => {
        mockDeleteComment.mockRejectedValue({ status: 404 });

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token')).resolves.toBe('removed');
    });

    it('requests compact fallback only when deletion is forbidden', async () => {
        mockDeleteComment.mockRejectedValue({ status: 403, message: 'Resource not accessible by integration' });

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token'))
            .resolves.toBe('compaction-required');
    });

    it('keeps the compact fallback for a generic forbidden deletion response', async () => {
        mockDeleteComment.mockRejectedValue({ status: 403, message: 'Forbidden' });

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token'))
            .resolves.toBe('compaction-required');
    });

    it('propagates transient duplicate-removal failures', async () => {
        mockDeleteComment.mockRejectedValue({ status: 503, message: 'unavailable' });

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token'))
            .rejects.toMatchObject({ status: 503 });
    });

    it('propagates rate-limit responses instead of disguising them as permission fallbacks', async () => {
        mockDeleteComment.mockRejectedValue({
            status: 403,
            message: 'Forbidden',
            response: { headers: { 'x-ratelimit-remaining': '0' } },
        });

        await expect(repository.removeComment('owner', 'repo', 7, 12, 'token'))
            .rejects.toMatchObject({ status: 403 });
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
