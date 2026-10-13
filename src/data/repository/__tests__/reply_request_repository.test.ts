import { ReplyRequestRepository } from '../reply_request_repository';
import { replyRequestBodyDigest } from '../../../domain/reply_request_digest';
import type { ReplyRequestSnapshot } from '../../../application/ports/reply_request_read_ports';
const root = 'https://api.github.com/repos/acme/widgets';
const body = '/copilot fix "finding:42"';
const snapshot: ReplyRequestSnapshot = { surface: 'issue-comment', commentId: 41, author: 'developer',
    bodyDigest: replyRequestBodyDigest(body), target: { kind: 'pull-request', number: 7 } };
function fixture() {
    const response = { url: root + '/issues/comments/41', data: { id: 41, body, user: { login: 'developer' }, issue_url: root + '/issues/7' } };
    const client = { rest: { issues: { getComment: jest.fn(async (_parameters: unknown) => response) }, pulls: { getReviewComment: jest.fn(async (_parameters: unknown) => response) } } };
    const binding = { owner: 'acme', repository: 'widgets', apiBaseUrl: 'https://api.github.com' };
    return { response, client, binding, repository: new ReplyRequestRepository(client, binding) };
}
describe('exact native request freshness', () => {
    it('verifies the native source and disables redirects without echoing its body', async () => {
        const f = fixture(); await expect(f.repository.matches(snapshot)).resolves.toBe(true);
        expect(f.client.rest.issues.getComment).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets', comment_id: 41, request: { redirect: 'error' } });
        expect(f.client.rest.pulls.getReviewComment).not.toHaveBeenCalled();
    });
    it('reads a review source through its own endpoint and verifies the parent PR', async () => {
        const f = fixture(); f.response.url = root + '/pulls/comments/41';
        Object.assign(f.response.data, { pull_request_url: root + '/pulls/7' });
        await expect(f.repository.matches({ ...snapshot, surface: 'review-comment' })).resolves.toBe(true);
        expect(f.client.rest.issues.getComment).not.toHaveBeenCalled();
    });
    it('supports a captured enterprise API prefix', async () => {
        const f = fixture(); f.binding.apiBaseUrl = 'https://github.example/api/v3/';
        const enterprise = 'https://github.example/api/v3/repos/acme/widgets';
        f.response.url = enterprise + '/issues/comments/41'; f.response.data.issue_url = enterprise + '/issues/7';
        await expect(new ReplyRequestRepository(f.client, f.binding).matches(snapshot)).resolves.toBe(true);
    });
    it('captures the original repository binding without mutable aliases', async () => {
        const f = fixture(); f.binding.repository = 'foreign';
        await expect(f.repository.matches(snapshot)).resolves.toBe(true);
        expect(f.client.rest.issues.getComment.mock.calls[0][0]).toMatchObject({ repo: 'widgets' });
    });
    it.each(['foreign endpoint', 'wrong source id', 'missing body', 'oversized body', 'foreign author', 'foreign target', 'edited body',
        'missing DTO', 'array DTO', 'missing author', 'array author'] as const)('withholds %s', async scenario => {
        const f = fixture(), data = f.response.data as Record<string, unknown>;
        if (scenario === 'foreign endpoint') f.response.url = 'https://api.github.com/repos/foreign/widgets/issues/comments/41';
        if (scenario === 'wrong source id') data.id = 42;
        if (scenario === 'missing body') data.body = null;
        if (scenario === 'oversized body') data.body = 'x'.repeat(70_001);
        if (scenario === 'foreign author') data.user = { login: 'other' };
        if (scenario === 'foreign target') data.issue_url = root + '/issues/8';
        if (scenario === 'edited body') data.body = '/copilot fix "different:42"';
        if (scenario === 'missing DTO') (f.response as { data: unknown }).data = null;
        if (scenario === 'array DTO') (f.response as { data: unknown }).data = [];
        if (scenario === 'missing author') data.user = null;
        if (scenario === 'array author') data.user = [];
        await expect(f.repository.matches(snapshot)).resolves.toBe(false);
    });
    it.each(['http://api.github.com', 'https://user:password@api.github.com', 'https://api.github.com?private=1', 'https://api.github.com#private', 'not a URL'])('refuses an unsafe API base %s before provider access', async apiBaseUrl => {
        const f = fixture(); await expect(new ReplyRequestRepository(f.client, { ...f.binding, apiBaseUrl }).matches(snapshot)).resolves.toBe(false);
        expect(f.client.rest.issues.getComment).not.toHaveBeenCalled();
    });
    it.each([{ commentId: 0 }, { commentId: 1.5 }, { target: { kind: 'issue', number: 0 } },
        { target: { kind: 'unknown', number: 7 } }, { surface: 'unknown' }, { bodyDigest: 'not-a-digest' }, { author: '' },
        { surface: 'review-comment', target: { kind: 'issue', number: 7 } }])('rejects invalid request authority %# before reads', async changed => {
        const f = fixture(); await expect(f.repository.matches({ ...snapshot, ...changed } as ReplyRequestSnapshot)).resolves.toBe(false);
        expect(f.client.rest.issues.getComment).not.toHaveBeenCalled(); expect(f.client.rest.pulls.getReviewComment).not.toHaveBeenCalled();
    });
    it('contains provider denial without exposing a private diagnostic', async () => {
        const f = fixture(); f.client.rest.issues.getComment.mockRejectedValue(new Error('PRIVATE-TOKEN'));
        await expect(f.repository.matches(snapshot)).resolves.toBe(false);
    });
    it('requires the exact Unicode request bytes without language normalization', async () => {
        const f = fixture(); f.response.data.body = '/copilot remember café';
        await expect(f.repository.matches({ ...snapshot, bodyDigest: replyRequestBodyDigest('/copilot remember cafe\u0301') })).resolves.toBe(false);
    });
});
