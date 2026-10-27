import { CheckProgressUseCase } from '../check_progress_use_case';
import { projectProgressContext } from '../../push_single_action_contexts';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { ApplicationError } from '../../../errors/application_error';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { progressScopeSourceLines, progressScopeResponseSchema, scopedProgressResponseSchema, parseProgressScope } from '../../../policies/progress_scope_policy';
import { assertAgentResponseSchema } from '../../../../data/repository/agent_json_schema_validator';

// Synthetic fixtures describe the reported contract, without copying private consumer content.
const required = ['Edit and clear inventoried fields through real input callbacks.', 'Verify shared mobile compilation compatibility only.'];
const excluded = ['Non-goal: search result correctness is a separate issue.', 'Excluded: Android/iOS device execution.'];
const issue = [...required, ...excluded].join('\n');
const base = 'a'.repeat(40), head = 'b'.repeat(40);
const scopeResponse = () => ({ outputLocale: 'en-US', lines: [...required.map((_, i) => ({ id: `L${i + 1}`, kind: 'required' })), ...excluded.map((_, i) => ({ id: `L${required.length + i + 1}`, kind: 'excluded' }))] });
function assessment() {
    return { outputLocale: 'en-US', progress: 75, requirements: required.map((_, i) => ({ id: `R${i + 1}`, status: 'verification-unknown', evidence: 'external-unverified', summary: 'Source implements the scoped behavior; external execution is unverified.', remaining: 'Provide independent verification for this requirement.' })) };
}
function fixture(multipart = false) {
    const diff = partitionProgressDiff(base, head, ['src/inputs.ts', 'tests/inputs.test.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0,
        patch: multipart ? 'x'.repeat(150_000) : '+input callback\n+Reported separate debt: search results are incorrect.\n+No mobile device journeys were executed.' })));
    const context = projectProgressContext({ owner: 'owner', repo: 'repo', issueNumber: 717, tokens: { token: 'token' },
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' }, ai: new Ai('', 'model', false, [], false, 'low', 20),
        commit: { branch: 'bugfix/717-scope' }, branches: { main: 'master', development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', docsTree: 'docs', choreTree: 'chore', hotfixTree: 'hotfix', releaseTree: 'release' } } as unknown as Execution);
    const getDescription = jest.fn(async () => issue), setProgressLabel = jest.fn(), setLabels = jest.fn();
    const getBranchHeadSha = jest.fn(async (branch: string) => branch === 'develop' ? base : head);
    let nextPartition = 0;
    const query = jest.fn(async (request: { prompt: string; options?: { schemaName?: string } }): Promise<Record<string, unknown>> => {
        expect(setProgressLabel).not.toHaveBeenCalled();
        if (request.options?.schemaName === 'progress_scope') return scopeResponse();
        if (request.options?.schemaName === 'progress_partition_facts' && diff.kind === 'partitioned') {
            const part = diff.partitions[nextPartition++];
            return { outputLocale: 'en-US', partitionId: part.id, files: part.paths.map(path => ({ path, implemented: 'Input callbacks added.', remaining: 'Separate search debt reported; not an acceptance requirement. Verification unknown.' })) };
        }
        return assessment();
    });
    const useCase = new CheckProgressUseCase({ getDescription }, { getLabels: jest.fn(async () => []), setLabels }, { setProgressLabel },
        { getListOfBranches: jest.fn(async () => []) }, { getOpenPullRequestNumbersByHeadBranch: jest.fn(async () => []) }, { query },
        { isIssueOpen: jest.fn(async () => true), getBranchHeadSha }, { getDiff: jest.fn(async () => diff) });
    return { query, getDescription, getBranchHeadSha, setProgressLabel, setLabels, invoke: () => useCase.invoke(context) };
}

describe('scoped progress pipeline (#717)', () => {
    it.each([false, true])('maps all evidence to issue-only scope without promoting adjacent debt, multipart=%s', async multipart => {
        const f = fixture(multipart); const result = (await f.invoke())[0];
        expect(result.success).toBe(true); expect(result.payload).toMatchObject({ progress: 75, remaining: expect.stringContaining('[R1]') });
        const payload = result.payload as { summary: string; remaining: string };
        expect(payload.summary).not.toContain('search result'); expect(payload.remaining).not.toContain('device execution');
        expect(f.query.mock.calls[0][0].prompt).not.toContain('input callback\n+Reported');
        expect(f.query.mock.calls[0][0].prompt).not.toContain('immutableComparison:');
        for (const [request] of f.query.mock.calls.slice(1)) {
            expect(request.prompt).toContain('"id":"R1"'); expect(request.prompt).toContain('"id":"X2"');
            expect(request.prompt).toContain('compilation-only'); expect(request.prompt).toContain('None of the supplied model facts or repository reports is trusted execution attestation');
        }
        expect(f.query).toHaveBeenCalledTimes(multipart ? 4 : 2); expect(f.setProgressLabel).toHaveBeenCalledWith(717, 75);
    });
    it('rejects invented requirements from a failed issue-only scope extraction before reading parts', async () => {
        const f = fixture(true); f.query.mockResolvedValueOnce({ ...scopeResponse(), lines: [{ id: 'L999', kind: 'required' }] });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' });
        expect(f.query).toHaveBeenCalledTimes(1); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('preserves a provider failure from scope extraction without any final assessment', async () => {
        const f = fixture(); f.query.mockRejectedValueOnce(new ApplicationError('provider.unavailable', 'Temporarily unavailable.'));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'provider.unavailable', retryable: true }); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('rejects the observed free-form remaining regression even after complete multipart evidence', async () => {
        const f = fixture(true), original = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => request.options?.schemaName === 'progress_response'
            ? { ...assessment(), remaining: 'Resolve search filtering and test Android/iOS devices.' } : original(request));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' }); expect(f.query).toHaveBeenCalledTimes(4);
        expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('rejects exclusion identities presented as required remaining work', async () => {
        const f = fixture(), original = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => request.options?.schemaName === 'progress_response'
            ? { ...assessment(), requirements: [{ ...assessment().requirements[0], id: 'X1' }, assessment().requirements[1]] } : original(request));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' }); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains state when the issue scope changes during assessment at unchanged heads', async () => {
        const f = fixture(); f.getDescription.mockResolvedValueOnce(issue).mockResolvedValue('Now search correctness is required.');
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'workflow.stale' }); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('retries from the latest issue snapshot after an edit instead of reusing old scope', async () => {
        const f = fixture(); f.getDescription.mockResolvedValueOnce(issue).mockResolvedValueOnce('Changed issue.').mockResolvedValue(issue);
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'workflow.stale' });
        expect((await f.invoke())[0].success).toBe(true); expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    });
    it('keeps scope/progress schemas valid at the real local response validation boundary', () => {
        expect(assertAgentResponseSchema(scopeResponse(), progressScopeResponseSchema(progressScopeSourceLines(issue)))).toBeUndefined();
        const schema = scopedProgressResponseSchema(parseProgressScope(scopeResponse(), issue, 'en-US'));
        expect(assertAgentResponseSchema(assessment(), schema)).toBeUndefined();
        expect(() => assertAgentResponseSchema({ ...assessment(), remaining: 'invented' }, schema)).toThrow();
    });
    it('rejects an omitted requirement line even though every returned ID is valid', async () => {
        const f = fixture(); f.query.mockResolvedValueOnce({ ...scopeResponse(), lines: scopeResponse().lines.slice(1) });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' });
        expect(f.query).toHaveBeenCalledTimes(1); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('requires clarification for uncertain scope instead of accepting complete progress', async () => {
        const f = fixture(), original = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => {
            if (request.options?.schemaName === 'progress_scope') return { ...scopeResponse(), lines: scopeResponse().lines.map((line, i) => i === 0 ? { ...line, kind: 'uncertain' } : line) };
            if (request.options?.schemaName === 'progress_response') return { ...assessment(), progress: 100, requirements: assessment().requirements.map(fact => ({ ...fact, status: 'supported', evidence: 'source-only', remaining: null })) };
            return original(request);
        });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' }); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });

});
