import { CheckProgressUseCase } from '../check_progress_use_case';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import { progressScopeSourceLines } from '../../../policies/progress_scope_policy';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const context = { issueNumber: 829, pushedBranch: 'bugfix/829-fixture', developmentBranch: 'develop', branchTypes: ['bugfix'],
    agentConfiguration: { provider: 'codex' as const, model: 'fixture' }, includeReasoning: false, targetLocale: 'en-US' };
function fixture(multipart = false, quoteSize = 20, native = true) {
    const issue = Array.from({ length: 32 }, () => 'q'.repeat(quoteSize)).join('\n\n');
    const diff = partitionProgressDiff(base, head, ['a.ts', 'b.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: multipart ? 'x'.repeat(150000) : '+source' })));
    const setProgressLabel = jest.fn(), setLabels = jest.fn();
    let rogue: 'summary' | 'remaining' | 'schema' | undefined;
    const output = (schema: Record<string, any>) => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        if (schema.properties.lines) return { outputLocale: 'en-US', lines: progressScopeSourceLines(issue).map(line => ({ id: line.id, kind: 'required' })) };
        if (schema.properties.files) return { outputLocale: 'en-US', partitionId: schema.properties.partitionId.enum[0], files: schema.properties.files.items.properties.path.enum.map((path: string) => ({ path, implemented: 'Source present.', remaining: 'Verification unknown.' })) };
        const properties = schema.properties.requirements.items.properties, limit = properties.summary.maxLength;
        return { outputLocale: 'en-US', progress: 50, requirements: properties.id.enum.map((id: string) => ({ id, status: 'verification-unknown', evidence: 'external-unverified', summary: 's'.repeat(rogue === 'summary' ? 800 : rogue === 'schema' ? limit + 1 : limit), remaining: 'r'.repeat(rogue === 'remaining' ? 800 : 1) })) };
    };
    const execute = jest.fn(async (request: { outputSchema?: unknown }) => JSON.stringify(output(request.outputSchema as Record<string, any>)));
    const query = jest.fn(async (request: { options?: { schema?: unknown } }) => output(request.options!.schema as Record<string, any>));
    const agent = native ? new FindingsAgentAdapter({ cli: { execute } }) : { query };
    const useCase = new CheckProgressUseCase({ getDescription: async () => issue }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, agent,
        { isIssueOpen: async () => true, getBranchHeadSha: async branch => branch === 'develop' ? base : head }, { getDiff: async () => diff }, { getSource: async () => ({ kind: 'none' }) });
    return { invoke: () => useCase.invoke(context), execute, query, setProgressLabel, setLabels, setRogue: (mode: typeof rogue) => { rogue = mode; } };
}
const retained = (f: ReturnType<typeof fixture>) => { expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled(); };
it.each([false, true])('runs all source evidence and all 32 requirements within the native output budget, multipart=%s', async multipart => {
    const f = fixture(multipart); const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: true, payload: { progress: 50 } });
    const payload = result.payload as { summary: string; remaining: string };
    expect([...payload.summary].length).toBeLessThanOrEqual(8000); expect(payload.summary.match(/\[R\d+\]/gu)).toHaveLength(32);
    expect(payload.remaining.match(/\[R\d+\]/gu)).toHaveLength(32); expect(f.execute).toHaveBeenCalledTimes(multipart ? 4 : 2);
    expect(f.setProgressLabel).toHaveBeenCalledWith(829, 50);
});
it.each([false, true])('rejects impossible host citations after scope and before any evidence/final query, multipart=%s', async multipart => {
    const f = fixture(multipart, 1190), result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'validation.evidence-too-large', retryable: false, recovery: { id: 'progress-assessment-capacity-exceeded', variables: expect.objectContaining({ requirementId: 'R7', sourceLineId: 'L13' }) } })] });
    expect(f.execute).toHaveBeenCalledTimes(1); retained(f);
});
it('retains state when the native model exceeds its newly derived field ceiling', async () => {
    const f = fixture(); f.setRogue('schema'); const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: { id: 'progress-result-contract-invalid', variables: expect.objectContaining({ reason: 'schema-string-long', field: '$.requirements[0].summary', requirementId: 'R1', sourceLineId: 'L1' }) } })] });
    expect(f.execute).toHaveBeenCalledTimes(2); retained(f);
});
it.each(['summary', 'remaining'] as const)('retains state and rejects an oversized combined %s from an alternate port that ignores schema', async field => {
    const f = fixture(false, 20, false); f.setRogue(field); const result = (await f.invoke())[0];
    expect(result).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'agent.failed', recovery: { id: 'progress-result-contract-invalid', variables: expect.objectContaining({ reason: 'assessment-text-limit', field: `$.requirements[9].${field}`, requirementId: 'R10', sourceLineId: 'L19' }) } })] });
    expect(f.query).toHaveBeenCalledTimes(2); retained(f);
});
it('requires a fresh complete assessment after rejection instead of publishing or reusing partial facts', async () => {
    const f = fixture(false, 20, false); f.setRogue('summary'); expect((await f.invoke())[0].success).toBe(false); retained(f);
    f.setRogue(undefined); expect((await f.invoke())[0].success).toBe(true); expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
