import { CopilotEvidenceRepository } from '../copilot_evidence_repository';
import { copilotEvidenceProviderFailure } from '../github/copilot_evidence_provider_failure';
import { CopilotEvidencePublicationError } from '../../../application/ports/copilot_evidence_error';
const head = 'b'.repeat(40);
const evidence = { name: 'Copilot / Verification' as const, headSha: head, conclusion: 'failure' as const, title: 'Required source missing', summary: 'Earlier failure retained' };
it.each([
    [401, 'authorization.credential-invalid'], [403, 'authorization.denied'], [429, 'provider.rate-limited'],
    [404, 'provider.not-found'], [400, 'provider.contract-invalid'], [422, 'provider.contract-invalid'],
    [409, 'provider.conflict'], [412, 'provider.conflict'], [408, 'provider.unavailable'],
    [500, 'provider.unavailable'], [503, 'provider.unavailable'], [599, 'provider.unavailable'], [418, 'unexpected'],
])('contains HTTP %i while retaining the stable check/head and creating no retries', async (status, code) => {
    const raw = { status, message: 'PRIVATE_PROVIDER_MESSAGE', request: { headers: { authorization: 'PRIVATE_TOKEN' } }, response: { data: 'PRIVATE_BODY', headers: { 'X-GitHub-Request-Id': 'AB12:CD34', authorization: 'PRIVATE_HEADER' } } };
    const create = jest.fn().mockRejectedValue(raw), getClient = jest.fn(() => ({ rest: { checks: { create } } }));
    const repository = new CopilotEvidenceRepository({ getClient });
    let error: unknown; try { await repository.publish(evidence, 'owner', 'repo', 'PRIVATE_TOKEN'); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(CopilotEvidencePublicationError); expect(error).toMatchObject({ code, status, providerReference: 'AB12:CD34' });
    expect(JSON.stringify(error)).not.toContain('PRIVATE'); expect(error).not.toHaveProperty('cause');
    expect(create).toHaveBeenCalledTimes(1); expect(create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'owner', repo: 'repo', name: evidence.name, head_sha: head, conclusion: 'failure' }));
    expect(getClient).toHaveBeenCalledWith('PRIVATE_TOKEN');
});
it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'])('does not mistake an unconfirmed %s write for a definite absence', code => {
    expect(copilotEvidenceProviderFailure({ code, message: 'PRIVATE_RESPONSE' }, 'secret')).toMatchObject({ code: 'provider.unavailable', status: undefined });
});
it.each([{ 'retry-after': '60' }, { 'x-ratelimit-remaining': '0' }])('distinguishes a rate-limited 403 from permission denial', headers => {
    expect(copilotEvidenceProviderFailure({ status: 403, response: { headers } }, 'secret').code).toBe('provider.rate-limited');
});
it('recognizes an explicit secondary limit without exposing its response', () => {
    expect(copilotEvidenceProviderFailure({ status: 403, message: 'secondary rate limit PRIVATE' }, 'secret').code).toBe('provider.rate-limited');
});
it('accepts a response-only status and a header-only safe request reference', () => {
    expect(copilotEvidenceProviderFailure({ response: { status: 422 }, headers: { 'x-github-request-id': 'AB12:CD34' } }, 'secret')).toMatchObject({ code: 'provider.contract-invalid', status: 422, providerReference: 'AB12:CD34' });
});
it.each([undefined, null, 'PRIVATE_REJECTION', [], { status: '403' }, { status: NaN }, { status: 403.5 }, { status: 99 }, { status: 600 }, { code: 'PRIVATE_CODE' }, { code: 'authorization.denied' }])('does not invent an outage for an unclassified rejection %#', raw => {
    const error = copilotEvidenceProviderFailure(raw, 'secret'); expect(error.code).toBe('unexpected'); expect(JSON.stringify(error)).not.toContain('PRIVATE');
});
it('does not emit a known credential even if a provider echoes it as a syntactically valid request id', () => {
    expect(copilotEvidenceProviderFailure({ status: 403, response: { headers: { 'x-github-request-id': 'AB12:CD34' } } }, 'AB12:CD34').providerReference).toBeUndefined();
});
it('handles an absent credential and preserves an already closed failure without attaching causes', () => {
    const error = copilotEvidenceProviderFailure({ status: 503, response: { headers: { 'x-github-request-id': 'AB12:CD34' } } }, '');
    expect(error.providerReference).toBe('AB12:CD34'); expect(copilotEvidenceProviderFailure(error, '')).toBe(error);
});
it('contains a failure while constructing the provider client', async () => {
    const repository = new CopilotEvidenceRepository({ getClient: () => { throw { status: 401, message: 'PRIVATE_CLIENT' }; } });
    await expect(repository.publish(evidence, 'owner', 'repo', 'secret')).rejects.toMatchObject({ code: 'authorization.credential-invalid', status: 401 });
});
it('prefers observed provider facts over an arbitrary semantic category claimed by an SDK-shaped error', () => {
    expect(copilotEvidenceProviderFailure({ code: 'authorization.denied', status: 503 }, 'secret').code).toBe('provider.unavailable');
});

it.each([undefined, null, { data: null }, { data: { id: 0 } }, { data: { id: -1 } }, { data: { id: '1' } }, { data: { id: 1.5 } }])('does not claim a confirmed native write for an invalid Check Run response %#', async response => {
    const create = jest.fn().mockResolvedValue(response), repository = new CopilotEvidenceRepository({ getClient: () => ({ rest: { checks: { create } } }) });
    await expect(repository.publish(evidence, 'owner', 'repo', 'secret')).rejects.toMatchObject({ code: 'provider.contract-invalid', status: undefined });
    expect(create).toHaveBeenCalledTimes(1);
});
