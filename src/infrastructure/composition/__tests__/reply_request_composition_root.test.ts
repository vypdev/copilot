import { createReplyRequestReadPort } from '../reply_request_composition_root';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
const mockGet = jest.fn();
const mockClient = { rest: { issues: { getComment: mockGet }, pulls: { getReviewComment: jest.fn() } }, write: jest.fn() };
jest.mock('../../github/octokit_client_resolver', () => ({ getOctokitClient: () => mockClient }));
const snapshot = { surface: 'issue-comment' as const, commentId: 41, author: 'developer', bodyDigest: replyRequestBodyDigest('/copilot status'),
    target: { kind: 'issue' as const, number: 7 } };
beforeEach(() => { jest.resetAllMocks(); mockGet.mockResolvedValue({ url: 'https://api.github.com/repos/acme/widgets/issues/comments/41',
    data: { id: 41, body: '/copilot status', user: { login: 'developer' }, issue_url: 'https://api.github.com/repos/acme/widgets/issues/7' } }); });
describe('frozen native request read authority', () => {
    it('binds only matches without publication or mutation capability', async () => {
        const port = createReplyRequestReadPort({ owner: 'acme', repository: 'widgets', token: 'fixture' });
        expect(Object.keys(port)).toEqual(['matches']); expect(Object.isFrozen(port)).toBe(true);
        await expect(port.matches(snapshot)).resolves.toBe(true); expect(mockClient.write).not.toHaveBeenCalled();
    });
    it('captures repository and API configuration before caller mutation', async () => {
        const binding = { owner: 'acme', repository: 'widgets', token: 'fixture' };
        const previous = process.env.GITHUB_API_URL;
        try {
            process.env.GITHUB_API_URL = 'https://github.example/api/v3/';
            const port = createReplyRequestReadPort(binding); binding.repository = 'foreign';
            process.env.GITHUB_API_URL = 'https://foreign.example/';
            mockGet.mockResolvedValue({ url: 'https://github.example/api/v3/repos/acme/widgets/issues/comments/41',
                data: { id: 41, body: '/copilot status', user: { login: 'developer' }, issue_url: 'https://github.example/api/v3/repos/acme/widgets/issues/7' } });
            await expect(port.matches(snapshot)).resolves.toBe(true);
            expect(mockGet).toHaveBeenCalledWith(expect.objectContaining({ owner: 'acme', repo: 'widgets' }));
        } finally { if (previous === undefined) delete process.env.GITHUB_API_URL; else process.env.GITHUB_API_URL = previous; }
    });
});
