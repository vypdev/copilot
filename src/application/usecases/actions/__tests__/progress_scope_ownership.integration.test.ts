import { CheckProgressUseCase } from '../check_progress_use_case';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const context = { issueNumber: 828, pushedBranch: 'bugfix/828-fixture', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture' }, includeReasoning: false, targetLocale: 'en-US' };
const state = (json = JSON.stringify({ schemaVersion: 3, recommendationState: { implementationPlan: { steps: Array.from({ length: 40 }, (_, i) => ({ title: `GENERATED_ONLY_${i}` })) } } }, null, 2)) => `<!-- copilot-configuration-start\n${json}\ncopilot-configuration-end -->`;
const body = 'Provide the complete identity API and safe errors.\n' + state() + '\nPreserve compatibility-only limits.';
function fixture(description = body, multipart = false) {
    const diff = partitionProgressDiff(base, head, ['a.ts', 'b.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: multipart ? 'x'.repeat(150000) : '+source' })));
    const getDescription = jest.fn(async () => description), setProgressLabel = jest.fn(), setLabels = jest.fn();
    let mode: 'normal' | 'inject' | 'omit' | 'exclude' = 'normal';
    const execute = jest.fn(async (request: { prompt: string; outputSchema?: unknown }) => {
        expect(setProgressLabel).not.toHaveBeenCalled();
        const schema = request.outputSchema as Record<string, any>;
        if (schema.properties.lines) {
            expect(request.prompt).not.toContain('GENERATED_ONLY_');
            const lines = schema.properties.lines.items.properties.id.enum.map((id: string, i: number) => ({ id, kind: mode === 'exclude' && i ? 'excluded' : 'required' }));
            if (mode === 'inject') lines[0].id = 'L4';
            if (mode === 'omit') lines.pop();
            return JSON.stringify({ outputLocale: 'en-US', lines });
        }
        if (schema.properties.files) return JSON.stringify({ outputLocale: 'en-US', partitionId: schema.properties.partitionId.enum[0], files: schema.properties.files.items.properties.path.enum.map((path: string) => ({ path, implemented: 'Source present.', remaining: 'Verification unknown.' })) });
        return JSON.stringify({ outputLocale: 'en-US', progress: 50, requirements: schema.properties.requirements.items.properties.id.enum.map((id: string) => ({ id, status: 'verification-unknown', evidence: 'external-unverified', summary: 'Source present.', remaining: 'Independent verification needed.' })) });
    });
    const useCase = new CheckProgressUseCase({ getDescription }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, new FindingsAgentAdapter({ cli: { execute } }),
        { isIssueOpen: async () => true, getBranchHeadSha: async branch => branch === 'develop' ? base : head }, { getDiff: async () => diff }, { getSource: async () => ({ kind: 'none' }) });
    return { invoke: () => useCase.invoke(context), execute, getDescription, setProgressLabel, setLabels, mode: (value: typeof mode) => { mode = value; } };
}
const retained = (f: ReturnType<typeof fixture>) => { expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled(); };
it.each([false, true])('assesses complete human scope without generated-plan requirement identities, multipart=%s', async multipart => {
    const f = fixture(body, multipart), r = (await f.invoke())[0];
    expect(r).toMatchObject({ success: true, payload: { progress: 50 } });
    expect((r.payload as { summary: string }).summary.match(/\[R\d+\]/gu)).toHaveLength(2);
    expect(f.execute).toHaveBeenCalledTimes(multipart ? 4 : 2);
    expect(f.execute.mock.calls[0][0].prompt).toContain('Preserve compatibility-only limits.');
    expect(f.execute.mock.calls.at(-1)![0].prompt).toContain('GENERATED_ONLY_');
    expect(f.setProgressLabel).toHaveBeenCalledWith(828, 50);
});
it.each([
    ['malformed JSON', 'Human.\n' + state('not-json')],
    ['unsupported schema', 'Human.\n' + state('{"schemaVersion":4}')],
    ['missing schema', 'Human.\n' + state('{}')],
    ['duplicate state', 'Human.\n' + state() + '\n' + state()],
    ['operational-only', state()],
])('rejects %s before any native model query', async (_name, description) => {
    const f = fixture(description), r = (await f.invoke())[0];
    expect(r.success).toBe(false); expect(f.execute).not.toHaveBeenCalled(); retained(f);
});
it.each(['inject', 'omit'] as const)('retains state when the strict native scope response attempts to %s a source identity', async mode => {
    const f = fixture(); f.mode(mode); expect((await f.invoke())[0].success).toBe(false);
    expect(f.execute).toHaveBeenCalledTimes(1); retained(f);
});
it('rejects a state-only issue edit at unchanged Git refs instead of publishing stale progress', async () => {
    const f = fixture(); f.getDescription.mockResolvedValueOnce(body).mockResolvedValue(body.replace('GENERATED_ONLY_0', 'changed state'));
    expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'workflow.stale' }); retained(f);
});
it('starts a fresh complete attempt after a state-only freshness rejection', async () => {
    const f = fixture(); f.getDescription.mockResolvedValueOnce(body).mockResolvedValueOnce(body.replace('GENERATED_ONLY_0', 'changed state')).mockResolvedValue(body);
    expect((await f.invoke())[0].success).toBe(false); retained(f);
    expect((await f.invoke())[0].success).toBe(true); expect(f.execute).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it.each(['required', 'excluded'] as const)('keeps genuine human %s over-limit scope blocked with exact counts', async kind => {
    const description = (kind === 'excluded' ? ['Required.', ...Array(33).fill('Excluded.')] : Array(33).fill('Required.')).join('\n') + '\n' + state();
    const f = fixture(description); if (kind === 'excluded') f.mode('exclude');
    expect((await f.invoke())[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: { id: 'progress-scope-clause-limit', variables: { clauseKind: kind === 'excluded' ? 'excluded' : 'required-or-uncertain', observed: 33, limit: 32, sourceLineId: kind === 'excluded' ? 'L34' : 'L33' } } })] });
    expect(f.execute).toHaveBeenCalledTimes(1); retained(f);
});
