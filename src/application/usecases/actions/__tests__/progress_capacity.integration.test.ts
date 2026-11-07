import { withProgressEvidence } from './support/progress_batch_response';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { projectProgressContext } from '../../push_single_action_contexts';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { ApplicationError } from '../../../errors/application_error';
import { ProgressCapacityFailure } from '../../../errors/progress_capacity_failure';
import * as factPolicy from '../../../policies/progress_partition_response_policy';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture() {
    const paths = Array.from({ length: 39 }, (_, i) => `source/${i}.ts`);
    const diff = partitionProgressDiff(base, head, paths.map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(9_000) })));
    if (diff.kind !== 'partitioned') throw new Error('Expected complete 39-file multipart fixture');
    const context = projectProgressContext({ owner: 'owner', repo: 'repo', issueNumber: 851, tokens: { token: 'test' },
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
        ai: new Ai('http://localhost:4096', 'opencode/model', false, [], false, 'low', 20),
        commit: { branch: 'bugfix/851-capacity', before: 'c'.repeat(40) },
        branches: { main: 'master', development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', hotfixTree: 'hotfix', releaseTree: 'release', docsTree: 'docs', choreTree: 'chore' } } as unknown as Execution);
    const setProgressLabel = jest.fn(), setLabels = jest.fn();
    const getDescription = jest.fn(async () => 'Implement complete behavior.');
    const isIssueOpen = jest.fn(async () => true);
    const getBranchHeadSha = jest.fn(async (branch: string) => branch === 'develop' ? base : head);
    const getDiff = jest.fn<Promise<ProgressDiffEvidence>, []>(async () => diff);
    const getSource = jest.fn(async () => ({ kind: 'none' as const }));
    let partIndex = 0;
    const query = jest.fn(async (request: { prompt: string; options?: { schemaName?: string } }): Promise<Record<string, unknown>> => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        if (request.options?.schemaName === 'progress_scope') { partIndex = 0; return { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] }; }
        if (request.options?.schemaName === 'progress_partition_facts') {
            const part = diff.partitions[partIndex++];
            return { outputLocale: 'en-US', partitionId: part.id, files: part.paths.map(path => ({ path, implemented: `Source exists for ${path}.`, remaining: 'Execution unverified.' })) };
        }
        return { outputLocale: 'en-US', progress: 70, requirements: [{ id: 'R1', status: 'verification-unknown', evidence: 'external-unverified', summary: 'Source exists.', remaining: 'Verify behavior.' }] };
    });
    const useCase = new CheckProgressUseCase({ getDescription }, { getLabels: jest.fn(async () => []), setLabels }, { setProgressLabel },
        { getListOfBranches: jest.fn(async () => []) }, { getOpenPullRequestNumbersByHeadBranch: jest.fn(async () => []) },
        { query: async request => withProgressEvidence(await query(request), request.options?.schema) }, { isIssueOpen, getBranchHeadSha }, { getDiff }, { getSource });
    return { paths, diff, context, query, getDescription, getDiff, getSource, getBranchHeadSha, isIssueOpen, setProgressLabel, setLabels, invoke: () => useCase.invoke(context) };
}
function unmutated(f: ReturnType<typeof fixture>) { expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled(); }

it('continues through every supported 39-file part and publishes one complete assessment from the actual base', async () => {
    const f = fixture(), result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: true, payload: { progress: 70, baseSha: base, sourceHeadSha: head } });
    expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 2); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    for (const path of f.paths) expect(f.query.mock.calls.at(-1)![0].prompt).toContain(path);
    expect(f.getDiff).toHaveBeenCalledWith(base, head);
});
it.each([
    ['original line count', Array(1_025).fill('Required behavior').join('\n'), 'source-line-count', 'L1025'],
    ['Unicode line length', '\n' + '😀'.repeat(1_201), 'source-line-points', 'L2'],
    ['whole scope envelope', (`${'x'.repeat(1_100)}\n`).repeat(464), 'native-prompt-bytes', 'none'],
    ['reserved final envelope', (`${'x'.repeat(1_100)}\n`).repeat(420), 'native-prompt-bytes', 'none'],
])('fails closed with attributed %s before any model or mutation', async (_name, description, dimension, sourceLineId) => {
    const f = fixture(); f.getDescription.mockResolvedValue(description);
    const result = (await f.invoke())[0], error = result.errors[0];
    expect(result.success).toBe(false); expect(error).toBeInstanceOf(ProgressCapacityFailure);
    expect(error).toMatchObject({ retryable: false, diagnostic: { dimension, context: { kind: 'comparison', baseSha: base, headSha: head,
        sourceLineId, requiredPathCount: 39, reviewedPathCount: 0, uncoveredPathCount: 39, paths: f.paths.slice(0, 8) } } });
    expect(f.query).not.toHaveBeenCalled(); unmutated(f);
});
it('rejects an oversized partition prompt with the full required inventory before the first query', async () => {
    const f = fixture();
    f.getDiff.mockResolvedValue(partitionProgressDiff(base, head, ['a.ts', 'b.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(200_000) }))));
    f.getDescription.mockResolvedValue((`${'x'.repeat(1_000)}\n`).repeat(350));
    const result = (await f.invoke())[0];
    expect(result.errors[0]).toMatchObject({ diagnostic: { phase: 'partition', context: { requiredPathCount: 2, reviewedPathCount: 0, paths: ['a.ts', 'b.ts'] } } });
    expect(f.query).not.toHaveBeenCalled(); unmutated(f);
});
it('preserves a provider-thrown capacity instance and never gives it host source attribution', async () => {
    const f = fixture(), original = new ProgressCapacityFailure({ phase: 'source', dimension: 'source-unit-bytes', observedCount: 3, supportedLimit: 2 });
    f.query.mockRejectedValue(original); const result = (await f.invoke())[0];
    expect(result.errors[0]).toBe(original); expect(original.diagnostic.context).toEqual({ kind: 'unavailable' });
    expect(f.query).toHaveBeenCalledTimes(1); unmutated(f);
});
it('preserves the query failure family and available source facts without inventing zero coverage', async () => {
    const f = fixture(), original = new ApplicationError('validation.evidence-unavailable', 'Source content unavailable');
    f.getDiff.mockRejectedValue(original); expect((await f.invoke())[0].errors[0]).toBe(original);
    expect(f.query).not.toHaveBeenCalled(); unmutated(f);
});
it('does not publish partial progress or request a final percentage after a late provider failure', async () => {
    const f = fixture(), implementation = f.query.getMockImplementation()!; let parts = 0;
    const original = new ApplicationError('provider.unavailable', 'Temporary provider outage');
    f.query.mockImplementation(async request => { if (request.options?.schemaName === 'progress_partition_facts' && ++parts === 2) throw original; return implementation(request); });
    expect((await f.invoke())[0].errors[0]).toBe(original); expect(f.query).toHaveBeenCalledTimes(3); unmutated(f);
});
it('recollects a complete source and starts at the first part on a fresh invocation after failure', async () => {
    const f = fixture(), implementation = f.query.getMockImplementation()!; let failed = false;
    f.query.mockImplementation(async request => { if (!failed && request.options?.schemaName === 'progress_partition_facts') { failed = true; throw new ApplicationError('provider.unavailable', 'Temporary outage'); } return implementation(request); });
    expect((await f.invoke())[0].success).toBe(false); unmutated(f);
    f.query.mockClear(); expect((await f.invoke())[0].success).toBe(true);
    expect(f.getDiff).toHaveBeenCalledTimes(2); expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 2);
    expect(f.query.mock.calls[1][0].prompt).toContain(f.diff.partitions[0].id); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it.each(['head', 'base', 'closed', 'body'])('retains the final publication fence when the %s changes after complete analysis', async scenario => {
    const f = fixture();
    if (scenario === 'closed') f.isIssueOpen.mockResolvedValueOnce(true).mockResolvedValue(false);
    else if (scenario === 'body') f.getDescription.mockResolvedValueOnce('Implement complete behavior.').mockResolvedValue('Changed acceptance.');
    else f.getBranchHeadSha.mockResolvedValueOnce(head).mockResolvedValueOnce(base).mockResolvedValueOnce(scenario === 'head' ? 'd'.repeat(40) : head).mockResolvedValueOnce('d'.repeat(40));
    const result = (await f.invoke())[0];
    expect(result.payload ?? {}).not.toHaveProperty('progress');
    if (scenario === 'body') expect(result.errors[0]).toMatchObject({ code: 'workflow.stale' });
    expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 2); unmutated(f);
});
it('rejects a corrupt or mismatched comparison identity before scope and publication', async () => {
    const f = fixture(); f.getDiff.mockResolvedValue({ ...f.diff, baseSha: 'c'.repeat(40) });
    expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'workflow.stale' }); expect(f.query).not.toHaveBeenCalled(); unmutated(f);
});
it('retains validated complete receipts if the host aggregate guard unexpectedly rejects after all parts', async () => {
    const f = fixture();
    // Fault injection exercises the final host failure boundary, not a claim that admitted facts normally overflow.
    const failure = new ProgressCapacityFailure({ phase: 'aggregate', dimension: 'aggregate-fact-bytes', observedCount: 384_001, supportedLimit: 384_000 });
    const aggregate = jest.spyOn(factPolicy, 'aggregateProgressFacts').mockImplementation(() => { throw failure; });
    try {
        const result = (await f.invoke())[0];
        expect(result.errors[0]).toMatchObject({ diagnostic: { context: { requiredPathCount: 39, reviewedPathCount: 39, uncoveredPathCount: 0, paths: [] } } });
        expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 1); unmutated(f);
    } finally { aggregate.mockRestore(); }
});
