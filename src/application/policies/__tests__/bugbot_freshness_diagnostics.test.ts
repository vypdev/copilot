import { PullRequestLifecycleRepository } from '../../../data/repository/pull_request/pull_request_lifecycle_repository';
import { readFileSync } from 'node:fs';
import { ApplicationError } from '../../errors/application_error';
import { bugbotFreshnessError } from '../../errors/bugbot_freshness_error';
import { PullRequestReviewOperationError } from '../../ports/pull_request_review_errors';
import type { BugbotContextPorts } from '../../ports/bugbot_context_ports';
import { hasNewerBugbotRevision } from '../../usecases/steps/commit/bugbot/bugbot_review_freshness';
import type { BugbotContext } from '../../usecases/steps/commit/bugbot/types';
import { isBugbotFreshnessDiagnostic } from '../../../domain/bugbot/review_freshness_failure';
import { BugbotReviewCompletenessError } from '../../../domain/bugbot/framed_review';
import { PullRequestChangesRepository } from '../../../data/repository/pull_request/pull_request_changes_repository';
import { pullRequestReviewProviderCode } from '../pull_request_review_provider_code_policy';
import { renderApplicationErrorMarkdown } from '../application_error_presentation_policy';
import { resolveStaticApplicationErrorCatalog } from '../application_error_message_catalog';

jest.mock('../../../utils/logger', () => ({ logError: jest.fn(), logDebugInfo: jest.fn() }));

const SHA = 'a'.repeat(40);
const facts = () => ({ operation: 'get-head-sha', providerStatus: 'http-403', providerReference: 'AB12:CD34', reason: 'provider-request-failed' } as const);
function fixture(head: unknown = SHA, framed = false) {
    const identity = { number: 100, state: 'open', draft: false, baseRepository: { owner: 'org', name: 'repo', id: 1 },
        headRepositoryOwner: 'org', headRepositoryName: 'repo', baseSha: 'b'.repeat(40), baseRefSha: 'b'.repeat(40),
        baseRef: 'develop', headRef: 'feature/100', headSha: SHA, changedFileCount: 1 };
    const context = { prContext: { prHeadSha: SHA }, canonicalPullRequest: identity, ...(framed ? { reviewFramedSource: {} } : {}) } as unknown as BugbotContext;
    const getPullRequestHeadSha = jest.fn().mockResolvedValue(head), getSourceBoundPullRequest = jest.fn().mockResolvedValue(identity);
    const ports = { getPullRequestHeadSha, getSourceBoundPullRequest } as unknown as BugbotContextPorts;
    return { context, ports, getPullRequestHeadSha, getSourceBoundPullRequest, identity };
}

it('freshness-C01: preserves the existing sanitized HTTP classification across freshness and mutation paths', () => {
    for (const [status, code] of [[401, 'authorization.credential-invalid'], [403, 'authorization.denied'], [404, 'provider.not-found'],
        [409, 'provider.conflict'], [429, 'provider.rate-limited'], [408, 'provider.unavailable'], [425, 'provider.unavailable'],
        [400, 'provider.contract-invalid'], [500, 'provider.unavailable'], [503, 'provider.unavailable'], [undefined, 'provider.unavailable'], [0, 'provider.unavailable']] as const) {
        expect(pullRequestReviewProviderCode(status)).toBe(code);
        const cause = new PullRequestReviewOperationError('get-head-sha', { providerStatus: status });
        expect(bugbotFreshnessError(cause, 'before-publication', 'get-head-sha').code).toBe(code);
    }
});
it('freshness-C02: rejects unknown or incoherent public facts before presentation', () => {
    const invalid = [null, undefined, 0, false, [], {}, { ...facts(), operation: 'PRIVATE' }, { ...facts(), providerStatus: 503 },
        ...['http-200', 'http-600', 'PRIVATE'].map(providerStatus => ({ ...facts(), providerStatus })),
        ...[0, '@team', '', 'x'.repeat(65)].map(providerReference => ({ ...facts(), providerReference })),
        { ...facts(), reason: 'PRIVATE' }, { ...facts(), reason: 'response-invalid' }];
    for (const variables of invalid) {
        expect(isBugbotFreshnessDiagnostic(variables)).toBe(false);
        expect(() => new ApplicationError('provider.unavailable', 'Safe', { recovery: {
            id: 'bugbot-freshness-before-publication', variables } as never })).toThrow(TypeError);
    }
    expect(isBugbotFreshnessDiagnostic(facts())).toBe(true);
    expect(() => new ApplicationError('provider.unavailable', 'Safe', { recovery: {
        id: 'bugbot-freshness-before-publication', variables: { ...facts(), privateBody: 'PRIVATE' } } as never })).toThrow(TypeError);
});
it('freshness-C03: captures only bounded metadata even if a typed carrier is mutated after construction', () => {
    for (const status of ['PRIVATE', 400.5, 399, 600, NaN, Infinity, 503, 599]) {
        const cause = new PullRequestReviewOperationError('get-head-sha');
        Object.assign(cause, { providerStatus: status, providerReference: '@PRIVATE\nsecret', message: 'PRIVATE provider prose', operation: 'PRIVATE' });
        const error = bugbotFreshnessError(cause, 'before-publication', 'get-head-sha');
        expect(error.recovery).toMatchObject({ variables: { operation: 'get-head-sha', providerReference: 'unavailable',
            providerStatus: status === 503 || status === 599 ? `http-${status}` : 'http-unavailable' } });
        expect(JSON.stringify(error)).not.toContain('PRIVATE');
    }
    expect(bugbotFreshnessError(undefined, 'before-publication', 'get-head-sha').code).toBe('provider.unavailable');
    const invalid = new PullRequestReviewOperationError('get-head-sha', { providerFailure: 'response-invalid' });
    expect(bugbotFreshnessError(invalid, 'before-publication', 'get-head-sha')).toMatchObject({ code: 'provider.contract-invalid', retryable: false });
    const denied = new PullRequestReviewOperationError('get-head-sha', { providerStatus: 403, providerFailure: 'response-invalid', providerReference: 'SAFE:01' });
    expect(bugbotFreshnessError(denied, 'before-publication', 'get-head-sha').code).toBe('authorization.denied');
});
it('freshness-C04: retains a typed legacy read failure without another read or false freshness', async () => {
    const f = fixture(); f.getPullRequestHeadSha.mockRejectedValue(new PullRequestReviewOperationError('get-head-sha', { providerStatus: 403, providerReference: 'AB12:CD34' }));
    await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toMatchObject({ code: 'authorization.denied', retryable: false,
        recovery: { id: 'bugbot-freshness-before-publication', variables: facts() } });
    expect(f.getPullRequestHeadSha).toHaveBeenCalledTimes(1); expect(f.getSourceBoundPullRequest).not.toHaveBeenCalled();
});
it('freshness-C05: identifies the source-bound read and preserves post-publication uncertainty', async () => {
    const f = fixture(SHA, true); f.getSourceBoundPullRequest.mockRejectedValue(new PullRequestReviewOperationError('get-head-sha', { providerStatus: 503 }));
    await expect(hasNewerBugbotRevision(f.context, f.ports, 'after-publication')).rejects.toMatchObject({ code: 'provider.unavailable',
        recovery: { id: 'bugbot-freshness-after-publication', variables: { operation: 'get-source-bound-pr', providerStatus: 'http-503' } } });
    expect(f.getSourceBoundPullRequest).toHaveBeenCalledTimes(1); expect(f.getPullRequestHeadSha).not.toHaveBeenCalled();
    for (const code of ['provider.unavailable', 'provider.contract-invalid', 'authorization.denied'] as const) {
        const original = new ApplicationError(code, 'Safe existing error', { retryable: false });
        f.getSourceBoundPullRequest.mockRejectedValue(original);
        await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toMatchObject({ code, retryable: false,
            correlationId: original.correlationId, recovery: { variables: { operation: 'get-source-bound-pr', providerStatus: 'http-unavailable' } } });
    }
    const data = { number: 100, state: 'open', draft: false, changed_files: 1,
        head: { ref: 'feature/100', sha: SHA, repo: { name: 'repo', owner: { login: 'org' } } },
        base: { sha: 'b'.repeat(40), ref: 'develop', repo: { id: 1, name: 'repo', owner: { login: 'org' } } } };
    for (const failed of ['pull', 'ref', 'ref-metadata'] as const) {
        const failure = { status: failed === 'pull' ? 403 : failed === 'ref' ? 503 : undefined, response: { headers: { 'x-github-request-id': 'AB12:CD34' } }, message: 'PRIVATE' };
        const get = jest.fn().mockResolvedValue({ data }), getRef = jest.fn().mockResolvedValue({ data: { ref: 'refs/heads/develop', object: { type: 'commit', sha: 'b'.repeat(40) } } });
        if (failed === 'pull') get.mockRejectedValue(failure); else getRef.mockRejectedValue(failure);
        const repository = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: { get }, git: { getRef } } }) } as never);
        f.getSourceBoundPullRequest.mockImplementation(() => repository.getBugbotSourceBoundPullRequestIdentity('org', 'repo', 100, 'fixture'));
        await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toMatchObject({
            recovery: { variables: { operation: 'get-source-bound-pr', providerReference: 'AB12:CD34', providerStatus: failure.status === undefined ? 'http-unavailable' : `http-${failure.status}` } } });
        expect(get).toHaveBeenCalledTimes(1); expect(getRef).toHaveBeenCalledTimes(failed === 'pull' ? 0 : 1);
    }
    for (const body of [{}, undefined, { ...data, head: { ...data.head, sha: '0'.repeat(40) } }]) {
        const invalidData = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: { get: async () => ({ data: body }) } } }) } as never);
        f.getSourceBoundPullRequest.mockImplementation(() => invalidData.getBugbotSourceBoundPullRequestIdentity('org', 'repo', 100, 'fixture'));
        await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toMatchObject({ code: 'provider.contract-invalid', recovery: { variables: { reason: 'response-invalid' } } });
    }
    const unavailable = new PullRequestLifecycleRepository({ getClient: () => ({ rest: { pulls: {} } }) } as never);
    await expect(unavailable.getBugbotPullRequestIdentity('org', 'repo', 100, 'fixture')).rejects.toMatchObject({ code: 'provider.unavailable' });
});
it('freshness-C06: rejects missing, malformed and null-sentinel heads at both the port and HTTP response boundaries', async () => {
    for (const head of [null, '', 'PRIVATE', '0'.repeat(40), {}, 17]) {
        const f = fixture(head);
        await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toMatchObject({ code: 'provider.contract-invalid', retryable: false,
            recovery: { variables: { reason: 'response-invalid', providerStatus: 'http-unavailable' } } });
        expect(f.getPullRequestHeadSha).toHaveBeenCalledTimes(1);
    }
    const missing = fixture(); missing.getPullRequestHeadSha.mockResolvedValue(undefined);
    await expect(hasNewerBugbotRevision(missing.context, missing.ports)).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    for (const data of [undefined, {}, { head: { sha: 'PRIVATE' } }, { head: { sha: '0'.repeat(40) } }]) {
        const get = jest.fn().mockResolvedValue({ data });
        const repository = new PullRequestChangesRepository({ getClient: () => ({ rest: { pulls: { get } } }) } as never);
        await expect(repository.getPullRequestHeadSha('org', 'repo', 100, 'fixture')).rejects.toMatchObject({ providerFailure: 'response-invalid' });
        expect(get).toHaveBeenCalledTimes(1);
    }
});
it('freshness-C07: keeps valid unchanged and superseded decisions, including normalized SHA-1 and SHA-256 identities', async () => {
    for (const head of [SHA, 'D'.repeat(64), ' '+SHA.toUpperCase()+' ']) {
        const get = jest.fn().mockResolvedValue({ data: { head: { sha: head } } });
        const repository = new PullRequestChangesRepository({ getClient: () => ({ rest: { pulls: { get } } }) } as never);
        expect(await repository.getPullRequestHeadSha('org', 'repo', 100, 'fixture')).toBe(head.trim().toLowerCase());
        expect(get).toHaveBeenCalledTimes(1);
    }
    const same = fixture(' '+SHA.toUpperCase()+' '); expect(await hasNewerBugbotRevision(same.context, same.ports)).toBe(false);
    const changed = fixture('c'.repeat(40)); expect(await hasNewerBugbotRevision(changed.context, changed.ports)).toBe(true);
    const sha256 = fixture('d'.repeat(64)); sha256.context.prContext!.prHeadSha = 'd'.repeat(64);
    expect(await hasNewerBugbotRevision(sha256.context, sha256.ports)).toBe(false);
    const framed = fixture(SHA, true); expect(await hasNewerBugbotRevision(framed.context, framed.ports)).toBe(false);
    framed.getSourceBoundPullRequest.mockResolvedValue({ ...framed.identity, headSha: 'c'.repeat(40) });
    expect(await hasNewerBugbotRevision(framed.context, framed.ports)).toBe(true);
});
it('freshness-C08: preserves unknown errors, framed completeness failures and absent-target no-op behavior', async () => {
    const f = fixture(), unknown = new Error('PRIVATE'); f.getPullRequestHeadSha.mockRejectedValue(unknown);
    await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toBe(unknown); expect(f.getPullRequestHeadSha).toHaveBeenCalledTimes(1);
    for (const error of [new ApplicationError('agent.failed', 'Safe'), new ApplicationError('configuration.unsupported', 'Safe'),
        new ApplicationError('provider.unavailable', 'Safe', { recovery: { id: 'workspace-changes-rejected', variables: {} } })]) {
        f.getPullRequestHeadSha.mockRejectedValue(error);
        await expect(hasNewerBugbotRevision(f.context, f.ports)).rejects.toBe(error);
    }
    const framed = fixture(SHA, true); delete (framed.ports as Partial<BugbotContextPorts>).getSourceBoundPullRequest;
    await expect(hasNewerBugbotRevision(framed.context, framed.ports)).rejects.toBeInstanceOf(BugbotReviewCompletenessError);
    const absent = fixture(); absent.context.prContext = null;
    expect(await hasNewerBugbotRevision(absent.context, absent.ports)).toBe(false); expect(absent.getPullRequestHeadSha).not.toHaveBeenCalled();
});
it('freshness-C09: renders complete bilingual evidence and distinct retained-state guidance', () => {
    for (const boundary of ['before-publication', 'after-publication'] as const) {
        const error = bugbotFreshnessError(new PullRequestReviewOperationError('get-head-sha', { providerStatus: 503 }), boundary, 'get-head-sha');
        for (const locale of ['en-US', 'es-ES']) {
            const view = renderApplicationErrorMarkdown(error, resolveStaticApplicationErrorCatalog(locale).message);
            expect(view).toContain('get-head-sha'); expect(view).toContain('http-503'); expect(view).not.toMatch(/\{\w+\}|PRIVATE/u);
            expect(view).toMatch(boundary === 'before-publication' ? /no new|no publicó/iu : /may already|ya se hayan/iu);
        }
    }
});
it('freshness-C10: binds the documented structured JSON fields to a real serialized error', () => {
    const blocks = [...readFileSync('docs/security-operations/operations/error-reference.mdx', 'utf8').matchAll(/```json\r?\n([\s\S]*?)```/gu)];
    const example = blocks.map(match => JSON.parse(match[1])).find(value => value.recovery?.id === 'bugbot-freshness-before-publication');
    const error = bugbotFreshnessError(new PullRequestReviewOperationError('get-head-sha', { providerStatus: 403, providerReference: 'AB12:CD34' }), 'before-publication', 'get-head-sha');
    const wire = JSON.parse(JSON.stringify(error));
    expect(example).toEqual({ code: wire.code, retryable: wire.retryable, recovery: wire.recovery });
});
