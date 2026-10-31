import { CheckProgressUseCase } from '../check_progress_use_case';
import { projectProgressContext } from '../../push_single_action_contexts';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { partitionProgressDiff, progressEvidenceTooLarge, type ProgressDiffChange } from '../../../policies/progress_diff_partition_policy';
import { progressPartitionFactLimit } from '../../../policies/progress_partition_response_policy';
import { AGENT_PROMPT_MAX_BYTES } from '../../../../domain/agent_execution_plan';
import { progressScopeSourceLines } from '../../../policies/progress_scope_policy';
import { getProgressScopePrompt } from '../../../../prompts/progress_scope';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import { progressContentUnits } from '../../../policies/progress_content_evidence_policy';
import { ApplicationError } from '../../../errors/application_error';
import { resolveStaticApplicationErrorCatalog } from '../../../policies/application_error_message_catalog';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
function fixture(changes?: readonly ProgressDiffChange[]) {
    const diff = partitionProgressDiff(base, head, changes ?? ['a.ts', 'b.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) })));
    if (diff.kind !== 'partitioned') throw new Error('Expected multipart fixture');
    const context = projectProgressContext({ owner: 'owner', repo: 'repo', issueNumber: 547, tokens: { token: 'token' },
        locale: { repository: 'en-US', issue: 'en-US', pullRequest: 'en-US' },
        ai: new Ai('http://localhost:4096', 'opencode/model', false, [], false, 'low', 20),
        commit: { branch: 'bugfix/547-progress' }, branches: { main: 'master', development: 'develop', featureTree: 'feature', bugfixTree: 'bugfix', hotfixTree: 'hotfix', releaseTree: 'release', docsTree: 'docs', choreTree: 'chore' } } as unknown as Execution);
    const setProgressLabel = jest.fn(), setLabels = jest.fn(), isIssueOpen = jest.fn(async () => true);
    const getBranchHeadSha = jest.fn(async (branch: string) => branch === 'develop' ? base : head);
    const getDiff = jest.fn<Promise<ProgressDiffEvidence>, []>(async () => diff);
    let partIndex = 0;
    const query = jest.fn(async (request: { prompt: string; options?: { schemaName?: string } }): Promise<Record<string, unknown>> => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        if (request.options?.schemaName === 'progress_scope') return { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] };
        if (request.options?.schemaName === 'progress_partition_facts') {
            const part = diff.partitions[partIndex++];
            return { outputLocale: 'en-US', partitionId: part.id, files: part.units ? part.units.map(unit => ({ unitId: unit.id, path: unit.path, implemented: `Implements ${unit.path}.`, remaining: 'Verification unknown.' })) : part.paths.map(path => ({ path, implemented: `Implements ${path}.`, remaining: 'Verification unknown.' })) };
        }
        return { outputLocale: 'en-US', progress: 70, requirements: [{ id: 'R1', status: 'verification-unknown', evidence: 'external-unverified', summary: 'Implemented; verification remains.', remaining: 'Verify behavior.' }] };
    });
    const getDescription = jest.fn(async () => 'Implement the described behavior and verify it.');
    const useCase = new CheckProgressUseCase({ getDescription },
        { getLabels: jest.fn(async () => []), setLabels }, { setProgressLabel }, { getListOfBranches: jest.fn(async () => []) },
        { getOpenPullRequestNumbersByHeadBranch: jest.fn(async () => []) }, { query }, { isIssueOpen, getBranchHeadSha }, { getDiff }, { getSource: jest.fn(async () => ({ kind: 'none' as const })) });
    return { diff, query, getDescription, setProgressLabel, setLabels, isIssueOpen, getBranchHeadSha, getDiff, invoke: () => useCase.invoke(context) };
}

describe('atomic complete multipart progress', () => {
    it('rejects an oversized issue before any model or publication', async () => {
        const f = fixture(); f.getDescription.mockResolvedValue((`${'x'.repeat(1100)}\n`).repeat(480));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains the fixed scope reserve when the issue alone fits but the final envelope cannot', async () => {
        const f = fixture(); f.getDescription.mockResolvedValue((`${'x'.repeat(1100)}\n`).repeat(420));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large' });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('preflights every source-part prompt against the unchanged runtime ceiling before the first query', async () => {
        const f = fixture(['a', 'b'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(200_000) })));
        f.getDescription.mockResolvedValue((`${'x'.repeat(1000)}\n`).repeat(350));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('checks the complete single-part final prompt before calling the runtime', async () => {
        const f = fixture();
        f.getDiff.mockResolvedValue({ kind: 'single', baseSha: base, headSha: head, evidence: (`${'x'.repeat(1100)}\n`).repeat(480) });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('rejects classification when complete framed source fits but its trusted prompt envelope does not', async () => {
        const f = fixture();
        const description = (`${'x'.repeat(1100)}\n`).repeat(464);
        const source = JSON.stringify(progressScopeSourceLines(description));
        expect(Buffer.byteLength(source)).toBeLessThanOrEqual(AGENT_PROMPT_MAX_BYTES);
        expect(Buffer.byteLength(getProgressScopePrompt(source, 'en-US'))).toBeGreaterThan(AGENT_PROMPT_MAX_BYTES);
        f.getDescription.mockResolvedValue(description);
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('rejects a valid single comparison when issue and evidence fit separately but their reserved final prompt does not', async () => {
        const f = fixture();
        const description = (`${'x'.repeat(1100)}\n`).repeat(230);
        const diff = partitionProgressDiff(base, head, [{ path: 'large.ts', status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(250_000) }]);
        expect(diff.kind).toBe('single');
        if (diff.kind === 'partitioned') throw new Error('Expected an admitted single comparison');
        expect(Buffer.byteLength(diff.evidence)).toBeLessThanOrEqual(256_000);
        expect(Buffer.byteLength(getProgressScopePrompt(JSON.stringify(progressScopeSourceLines(description)), 'en-US'))).toBeLessThanOrEqual(AGENT_PROMPT_MAX_BYTES);
        f.getDescription.mockResolvedValue(description); f.getDiff.mockResolvedValue(diff);
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('assesses a complete 299-file aggregate larger than 256 kB without dropping paths or publishing per-part progress', async () => {
        const paths = Array.from({ length: 299 }, (_, i) => `src/${i}.ts`);
        const f = fixture(paths.map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(1500) })));
        let index = 0; const limit = progressPartitionFactLimit(base, head, f.diff.partitions);
        f.query.mockImplementation(async request => {
            expect(f.setProgressLabel).not.toHaveBeenCalled();
            if (request.options?.schemaName === 'progress_scope') return { outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] };
            if (request.options?.schemaName === 'progress_partition_facts') {
                const part = f.diff.partitions[index++];
                return { outputLocale: 'en-US', partitionId: part.id, files: part.paths.map(path => ({ path, implemented: '\u0000'.repeat(limit), remaining: '\u0000'.repeat(limit) })) };
            }
            expect(index).toBe(f.diff.partitions.length); expect(Buffer.byteLength(request.prompt)).toBeGreaterThan(256_000);
            expect(Buffer.byteLength(request.prompt)).toBeLessThanOrEqual(AGENT_PROMPT_MAX_BYTES);
            expect(paths.every(path => request.prompt.includes(path))).toBe(true);
            return { outputLocale: 'en-US', progress: 70, requirements: [{ id: 'R1', status: 'verification-unknown', evidence: 'external-unverified', summary: 'Implemented; verification remains.', remaining: 'Verify behavior.' }] };
        });
        expect((await f.invoke())[0].success).toBe(true);
        expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 2); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    });
    it('assesses all exact parts before one final percentage and existing label publication', async () => {
        const f = fixture(), results = await f.invoke();
        expect(results[0].success).toBe(true); expect(results[0].payload).toMatchObject({ progress: 70 });
        expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
        const prompts = f.query.mock.calls.slice(1).map(([request]) => request.prompt);
        expect(prompts[0]).toContain('progress-1-of-2'); expect(prompts[1]).toContain('progress-2-of-2');
        expect(prompts[2]).toContain('Implements a.ts.'); expect(prompts[2]).toContain('Implements b.ts.');
        expect(prompts[0]).toContain('Do not execute commands'); expect(prompts[2]).not.toContain('x'.repeat(100));
    });
    it('retains state and never requests final percentage when the middle part fails', async () => {
        const f = fixture(); f.query.mockResolvedValueOnce({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] }).mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[0].id,
            files: [{ path: 'a.ts', implemented: 'Added', remaining: 'Unknown' }] })
            .mockRejectedValueOnce(new ApplicationError('provider.unavailable', 'Temporary provider failure.'));
        const result = (await f.invoke())[0];
        expect(result.errors[0]).toMatchObject({ code: 'provider.unavailable', retryable: true });
        expect(f.query).toHaveBeenCalledTimes(3); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('rejects a malformed second part after retaining the first only in memory', async () => {
        const f = fixture(); f.query.mockResolvedValueOnce({ outputLocale: 'en-US', lines: [{ id: 'L1', kind: 'required' }] }).mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[0].id,
            files: [{ path: 'a.ts', implemented: 'Added', remaining: 'Unknown' }] }).mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[1].id, files: [] });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' });
        expect(f.query).toHaveBeenCalledTimes(3); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('rejects a bad final assessment without any labels after complete parts', async () => {
        const f = fixture(); const implementation = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => request.options?.schemaName !== 'progress_response' ? implementation(request) : { outputLocale: 'es-ES', progress: 100 });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
        expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains progress when the source moves during multipart analysis', async () => {
        const f = fixture(); f.getBranchHeadSha.mockResolvedValueOnce(head).mockResolvedValueOnce(base).mockResolvedValueOnce('c'.repeat(40));
        expect((await f.invoke())[0]).toMatchObject({ success: true, executed: false });
        expect(f.query).toHaveBeenCalledTimes(4); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains progress when the base moves during multipart analysis', async () => {
        const f = fixture(); f.getBranchHeadSha.mockResolvedValueOnce(head).mockResolvedValueOnce(base).mockResolvedValueOnce(head).mockResolvedValueOnce('c'.repeat(40));
        expect((await f.invoke())[0]).toMatchObject({ success: true, executed: false }); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains progress when the native issue closes after complete analysis', async () => {
        const f = fixture(); f.isIssueOpen.mockResolvedValueOnce(true).mockResolvedValue(false);
        const result = (await f.invoke())[0]; expect(result.payload).not.toHaveProperty('progress'); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('reports deterministic oversize as terminal before model or publication', async () => {
        const f = fixture(); f.getDiff.mockRejectedValue(progressEvidenceTooLarge()); const result = (await f.invoke())[0];
        expect(result.errors[0]).toMatchObject({ code: 'validation.evidence-too-large', retryable: false });
        expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('provides a concrete terminal action and retained progress in English', () => {
        const catalog = resolveStaticApplicationErrorCatalog('en-US');
        expect(catalog.message('error.validation.evidence-too-large.action')).toContain('continues automatically');
        expect(catalog.message('error.validation.evidence-too-large.retainedState')).toContain('progress labels');
    });
    it('provides the corresponding retained-state and recovery content in Spanish', () => {
        const catalog = resolveStaticApplicationErrorCatalog('es-ES');
        expect(catalog.message('error.validation.evidence-too-large.action')).toContain('continúa automáticamente');
        expect(catalog.message('error.validation.evidence-too-large.retainedState')).toContain('etiquetas de progreso');
    });
});


describe('recovered content progress publication', () => {
    function recovered() {
        return fixture(progressContentUnits({ path: 'specs/large.md', status: 'added', additions: 0, deletions: 0 },
            { comparisonBaseSha: base, head: { path: 'specs/large.md', sha: 'd'.repeat(40), mode: '100644', text: 'x'.repeat(300_000) } }, 'file-1'));
    }
    it('extracts every content unit before one final assessment and one publication', async () => {
        const f = recovered(); expect((await f.invoke())[0].success).toBe(true);
        expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 2); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
        const final = f.query.mock.calls.at(-1)![0].prompt;
        for (const unit of f.diff.partitions.flatMap(part => part.units!)) expect(final).toContain(unit.id);
        expect(final).toContain('not CI/build/test attestation');
    });
    it.each(['missing unit', 'replayed partition', 'forged path', 'wrong locale', 'provider failure'])('retains progress after partial analysis: %s', async scenario => {
        const f = recovered(), original = f.query.getMockImplementation()!; let parts = 0;
        f.query.mockImplementation(async request => {
            const response = await original(request);
            if (request.options?.schemaName === 'progress_partition_facts' && ++parts === 2) {
                if (scenario === 'provider failure') throw new ApplicationError('provider.unavailable', 'Temporary outage');
                if (scenario === 'missing unit') response.files = [];
                if (scenario === 'replayed partition') response.partitionId = f.diff.partitions[0].id;
                if (scenario === 'wrong locale') response.outputLocale = 'es-ES';
                if (scenario === 'forged path') (response.files as { path: string }[])[0].path = 'unassigned';
            }
            return response;
        });
        expect((await f.invoke())[0].success).toBe(false); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
        expect(f.query.mock.calls.some(([request]) => request.options?.schemaName === 'progress_response')).toBe(false);
    });
    it.each(['head', 'base', 'closed'])('retains publication after all recovered units when source becomes %s', async scenario => {
        const f = recovered();
        if (scenario === 'closed') f.isIssueOpen.mockResolvedValueOnce(true).mockResolvedValue(false);
        else f.getBranchHeadSha.mockResolvedValueOnce(head).mockResolvedValueOnce(base).mockResolvedValueOnce(scenario === 'head' ? 'c'.repeat(40) : head).mockResolvedValueOnce('c'.repeat(40));
        expect((await f.invoke())[0].payload).not.toHaveProperty('progress'); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('does not request scope or models when immutable recovery is unavailable', async () => {
        const f = recovered(); f.getDiff.mockRejectedValue(new ApplicationError('validation.evidence-unavailable', 'Unreviewed paths: specs/large.md'));
        expect((await f.invoke())[0].errors[0]).toMatchObject({ retryable: false }); expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('does not publish a malformed final result after complete recovered-unit extraction', async () => {
        const f = recovered(), original = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => request.options?.schemaName === 'progress_response' ? { outputLocale: 'en-US', progress: 100, requirements: [] } : original(request));
        expect((await f.invoke())[0].success).toBe(false); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
});
