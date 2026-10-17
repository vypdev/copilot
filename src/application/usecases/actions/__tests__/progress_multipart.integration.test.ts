import { CheckProgressUseCase } from '../check_progress_use_case';
import { projectProgressContext } from '../../push_single_action_contexts';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { partitionProgressDiff, progressEvidenceTooLarge, type ProgressDiffChange } from '../../../policies/progress_diff_partition_policy';
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
    const getDiff = jest.fn(async () => diff);
    let partIndex = 0;
    const query = jest.fn(async (request: { prompt: string; options?: { schemaName?: string } }): Promise<Record<string, unknown>> => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        if (request.options?.schemaName === 'progress_partition_facts') {
            const part = diff.partitions[partIndex++];
            return { outputLocale: 'en-US', partitionId: part.id, files: part.paths.map(path => ({ path, implemented: `Implements ${path}.`, remaining: 'Verification unknown.' })) };
        }
        return { outputLocale: 'en-US', progress: 70, summary: 'Implemented; verification remains.', remaining: 'Verify behavior.' };
    });
    const useCase = new CheckProgressUseCase({ getDescription: jest.fn(async () => 'Implement the described behavior and verify it.') },
        { getLabels: jest.fn(async () => []), setLabels }, { setProgressLabel }, { getListOfBranches: jest.fn(async () => []) },
        { getOpenPullRequestNumbersByHeadBranch: jest.fn(async () => []) }, { query }, { isIssueOpen, getBranchHeadSha }, { getDiff });
    return { diff, query, setProgressLabel, setLabels, isIssueOpen, getBranchHeadSha, getDiff, invoke: () => useCase.invoke(context) };
}

describe('atomic complete multipart progress', () => {
    it('assesses a complete 299-file aggregate larger than 256 kB without dropping paths or publishing per-part progress', async () => {
        const paths = Array.from({ length: 299 }, (_, i) => `src/${i}.ts`);
        const f = fixture(paths.map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(1500) })));
        let index = 0;
        f.query.mockImplementation(async request => {
            expect(f.setProgressLabel).not.toHaveBeenCalled();
            if (request.options?.schemaName === 'progress_partition_facts') {
                const part = f.diff.partitions[index++];
                return { outputLocale: 'en-US', partitionId: part.id, files: part.paths.map(path => ({ path, implemented: 'x'.repeat(600), remaining: 'y'.repeat(600) })) };
            }
            expect(index).toBe(f.diff.partitions.length); expect(Buffer.byteLength(request.prompt)).toBeGreaterThan(256_000);
            expect(paths.every(path => request.prompt.includes(path))).toBe(true);
            return { outputLocale: 'en-US', progress: 70, summary: 'Implemented; verification remains.', remaining: 'Verify behavior.' };
        });
        expect((await f.invoke())[0].success).toBe(true);
        expect(f.query).toHaveBeenCalledTimes(f.diff.partitions.length + 1); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    });
    it('assesses all exact parts before one final percentage and existing label publication', async () => {
        const f = fixture(), results = await f.invoke();
        expect(results[0].success).toBe(true); expect(results[0].payload).toMatchObject({ progress: 70 });
        expect(f.query).toHaveBeenCalledTimes(3); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
        const prompts = f.query.mock.calls.map(([request]) => request.prompt);
        expect(prompts[0]).toContain('progress-1-of-2'); expect(prompts[1]).toContain('progress-2-of-2');
        expect(prompts[2]).toContain('Implements a.ts.'); expect(prompts[2]).toContain('Implements b.ts.');
        expect(prompts[0]).toContain('Do not execute commands'); expect(prompts[2]).not.toContain('x'.repeat(100));
    });
    it('retains state and never requests final percentage when the middle part fails', async () => {
        const f = fixture(); f.query.mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[0].id,
            files: [{ path: 'a.ts', implemented: 'Added', remaining: 'Unknown' }] })
            .mockRejectedValueOnce(new ApplicationError('provider.unavailable', 'Temporary provider failure.'));
        const result = (await f.invoke())[0];
        expect(result.errors[0]).toMatchObject({ code: 'provider.unavailable', retryable: true });
        expect(f.query).toHaveBeenCalledTimes(2); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
    });
    it('rejects a malformed second part after retaining the first only in memory', async () => {
        const f = fixture(); f.query.mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[0].id,
            files: [{ path: 'a.ts', implemented: 'Added', remaining: 'Unknown' }] }).mockResolvedValueOnce({ outputLocale: 'en-US', partitionId: f.diff.partitions[1].id, files: [] });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'agent.failed' });
        expect(f.query).toHaveBeenCalledTimes(2); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('rejects a bad final assessment without any labels after complete parts', async () => {
        const f = fixture(); const implementation = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => request.options?.schemaName === 'progress_partition_facts' ? implementation(request) : { outputLocale: 'es-ES', progress: 100 });
        expect((await f.invoke())[0].errors[0]).toMatchObject({ code: 'locale.output-invalid' });
        expect(f.query).toHaveBeenCalledTimes(3); expect(f.setProgressLabel).not.toHaveBeenCalled();
    });
    it('retains progress when the source moves during multipart analysis', async () => {
        const f = fixture(); f.getBranchHeadSha.mockResolvedValueOnce(head).mockResolvedValueOnce(base).mockResolvedValueOnce('c'.repeat(40));
        expect((await f.invoke())[0]).toMatchObject({ success: true, executed: false });
        expect(f.query).toHaveBeenCalledTimes(3); expect(f.setProgressLabel).not.toHaveBeenCalled();
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
        expect(catalog.message('error.validation.evidence-too-large.action')).toContain('split the work');
        expect(catalog.message('error.validation.evidence-too-large.retainedState')).toContain('progress labels');
    });
    it('provides the corresponding retained-state and recovery content in Spanish', () => {
        const catalog = resolveStaticApplicationErrorCatalog('es-ES');
        expect(catalog.message('error.validation.evidence-too-large.action')).toContain('divide el trabajo');
        expect(catalog.message('error.validation.evidence-too-large.retainedState')).toContain('etiquetas de progreso');
    });
});
