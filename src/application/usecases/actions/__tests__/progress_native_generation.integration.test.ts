import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ProgressDiffRepository } from '../../../../data/repository/progress_diff_repository';
import { FindingsAgentAdapter } from '../../../../data/repository/ai/findings_agent_adapter';
import { buildCodexExecutionPolicy } from '../../../policies/agent_execution/codex_execution_plan_policy';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { captureProgressScopeSource } from '../../../policies/progress_scope_source_policy';
import * as logging from '../../../ports/logging_ports';
import { assessmentWireFixture } from './fixtures/progress_assessment_wire_fixture';

const fixtures = join(__dirname, 'fixtures');
const readFixture = (name: string) => {
    const bytes = Buffer.from(readFileSync(join(fixtures, name), 'utf8').replace(/\s/gu, ''), 'hex');
    return { bytes, data: JSON.parse(gunzipSync(bytes).toString('utf8')) };
};
const original = readFixture('domus-29-immutable-replay.json.gz.hex').data;
const captured = readFixture('domus-29-native-937.json.gz.hex');
const fixture = captured.data;
afterEach(() => jest.restoreAllMocks());

async function scenario(moveHead = false, repetition?: 'correct' | 'exhaust' | 'stale') {
    const native = (path: string) => {
        expect(Object.prototype.hasOwnProperty.call(fixture.nativeObjects, path)).toBe(true);
        return { data: fixture.nativeObjects[path] };
    };
    const repository = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: {
        compareCommits: async () => native(`compare/${fixture.base}...${fixture.head}?per_page=1&page=1`),
    } } }) }, { getClient: () => ({ rest: { git: {
        getCommit: async ({ commit_sha }) => native(`git/commits/${commit_sha}`),
        getTree: async ({ tree_sha }) => native(`git/trees/${tree_sha}`),
        getBlob: async ({ file_sha }) => native(`git/blobs/${file_sha}`),
    } } }) });
    const diff = await repository.getDiff('vypdev', 'domus', fixture.base, fixture.head, '');
    expect(diff.kind).toBe('partitioned');
    if (diff.kind !== 'partitioned') throw Error('Missing complete comparison.');
    expect(diff.protocol!.requiredPaths).toHaveLength(175); expect(diff.partitions).toHaveLength(17);
    const setProgressLabel = jest.fn(), setLabels = jest.fn(), assessed: string[] = [];
    let currentHead = fixture.head;
    const attempts = new Map<string, number>();
    const execute = jest.fn(async request => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        const schema = request.outputSchema, p = schema.properties;
        if (p.lines) return JSON.stringify({ outputLocale: 'en-US', snapshotDigest: p.snapshotDigest.enum[0], assignmentId: p.assignmentId.enum[0], headSha: p.headSha.enum[0],
            lines: p.lines.items.properties.id.enum.map((id: string) => fixture.sourceClassifications.find((line: { id: string }) => line.id === id)) });
        if (p.files) {
            const f = p.files.items.properties;
            return JSON.stringify({ outputLocale: 'en-US', partitionId: p.partitionId.enum[0], files: f.unitId.enum.map((unitId: string) => ({
                unitId, path: diff.partitions.flatMap(part => part.units ?? []).find(unit => unit.id === unitId)!.path,
                implemented: 'Present.', remaining: 'Unknown.',
            })) });
        }
        const fields = p.requirements.items.properties;
        const policy = buildCodexExecutionPolicy({ configuration: request.configuration, capability: request.capability,
            workspace: '/workspace', runtimeDirectory: '/runtime', outputSchema: schema });
        const projected = JSON.parse(policy.artifacts[0].contents).properties.requirements.items.properties;
        expect(request.prompt).toContain('hard limit of 32 Unicode code points');
        expect(projected.assessment.enum).toContain('execution-unverified');
        expect(projected).not.toHaveProperty('summary'); expect(projected).not.toHaveProperty('remaining');
        assessed.push(...fields.id.enum);
        if (moveHead && fields.id.enum.length === 9) currentHead = 'c'.repeat(40);
        const batchId = p.batchId.enum[0], attempt = (attempts.get(batchId) ?? 0) + 1;
        attempts.set(batchId, attempt);
        const repeated = repetition === 'exhaust' ? fields.id.enum.length === 9 : Boolean(repetition) && assessed.length === 32;
        if (repetition === 'stale' && attempt === 2) currentHead = 'c'.repeat(40);
        return JSON.stringify(assessmentWireFixture({ outputLocale: 'en-US', progress: 25, manifestDigest: p.manifestDigest.enum[0], batchId: p.batchId.enum[0], headSha: p.headSha.enum[0],
            requirements: fields.id.enum.map((id: string, index: number) => ({ id, status: 'verification-unknown', evidence: 'external-unverified',
                summary: 'Source reviewed.', remaining: 'Verification needed.', citations: repeated && index === 0
                    ? [fields.citations.items.enum[0], fields.citations.items.enum[0]] : [fields.citations.items.enum[0]] })) }, schema));
    });
    const agent = new FindingsAgentAdapter({ cli: { execute } });
    const check = new CheckProgressUseCase({ getDescription: async () => original.body }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [29] }, agent,
        { isIssueOpen: async () => true, getBranchHeadSha: async branch => branch === 'develop' ? fixture.base : currentHead }, { getDiff: async () => diff },
        { getSource: async () => ({ kind: 'pull-request', number: 29, headSha: currentHead, baseBranch: 'develop' }) });
    const results = await check.invoke({ repositoryIdentity: fixture.repository, issueNumber: 23, pushedBranch: fixture.branch, developmentBranch: 'develop', branchTypes: ['feature'],
        agentConfiguration: { provider: 'codex', modelProvider: 'openai', model: 'deterministic-fixture' }, includeReasoning: false, targetLocale: 'en-US' });
    return { results, setProgressLabel, setLabels, assessed, execute, attempts };
}

it('github-communication-experience-change-C188: current Domus immutable inventory reaches one complete eligible publication with native generation bounds', async () => {
    expect(createHash('sha256').update(captured.bytes).digest('hex')).toBe('d3a91d90f59bd977fbefe31502c829bfc1bfc881e1cd8370cf9a82805797334f');
    expect(createHash('sha256').update(original.body).digest('hex')).toBe(fixture.bodyDigest);
    const log = jest.spyOn(logging, 'logInfo').mockImplementation(() => undefined);
    const f = await scenario();
    expect(f.results.at(-1)).toMatchObject({ success: true, payload: { progress: 25, sourceHeadSha: fixture.head } });
    const required = new Set(fixture.sourceClassifications.filter((line: { kind: string }) => ['required', 'uncertain'].includes(line.kind)).map((line: { id: string }) => line.id));
    const expected = captureProgressScopeSource(original.body).lines.filter(line => required.has(line.id)).map(line => 'R' + line.id.slice(1));
    expect(expected).toHaveLength(169); expect(f.assessed).toEqual(expected);
    expect(new Set(f.assessed).size).toBe(169); expect(f.execute).toHaveBeenCalledTimes(33);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setLabels).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Acceptance inventory admitted: 169 requirements in 6 batches; each summary and remaining has a hard 32-Unicode-point limit. Previous progress is retained.');
    const payload = f.results.at(-1)!.payload as { summary: string; remaining: string };
    expect([...payload.summary].length).toBeLessThanOrEqual(8000); expect([...payload.remaining].length).toBeLessThanOrEqual(8000);
    for (const id of expected) { expect(payload.summary).toContain(`[${id}]`); expect(payload.remaining).toContain(`[${id}]`); }
});

it('github-communication-experience-change-C189: native generation success for all current Domus requirements cannot bypass the exact-head publication fence', async () => {
    const f = await scenario(true);
    expect(f.assessed).toHaveLength(169);
    expect(f.results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.stale' })] });
    expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
});

it('inventory1-C11: native citation correction preserves all 169 original Domus requirements and 17 source parts before one publication', async () => {
    const f = await scenario(false, 'correct');
    expect(createHash('sha256').update(original.body).digest('hex')).toBe(fixture.bodyDigest);
    expect(f.results.at(-1)).toMatchObject({ success: true, payload: { progress: 25, sourceHeadSha: fixture.head } });
    expect(f.execute).toHaveBeenCalledTimes(34);
    expect(f.execute.mock.calls.filter(([request]) => request.outputSchema.properties.files)).toHaveLength(17);
    expect(f.attempts.size).toBe(6); expect([...f.attempts.values()]).toEqual([2, 1, 1, 1, 1, 1]);
    expect(f.assessed).toHaveLength(201); expect(new Set(f.assessed).size).toBe(169);
    const payload = f.results.at(-1)!.payload as { summary: string; remaining: string };
    for (const id of new Set(f.assessed)) {
        expect(payload.summary.split(`[${id}]`)).toHaveLength(2); expect(payload.remaining.split(`[${id}]`)).toHaveLength(2);
    }
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setLabels).toHaveBeenCalledTimes(1);
});

it('inventory1-C12: native late-batch citation exhaustion retains every provisional batch and publishes nothing', async () => {
    const f = await scenario(false, 'exhaust');
    expect(f.execute).toHaveBeenCalledTimes(34); expect(new Set(f.assessed).size).toBe(169);
    expect([...f.attempts.values()]).toEqual([1, 1, 1, 1, 1, 2]);
    expect(f.results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({
        code: 'validation.evidence-unavailable', retryable: false,
        recovery: { id: 'progress-batch-retained', variables: expect.objectContaining({ reason: 'evidence-duplicate', batch: 6, verified: 5, expected: 6 }) },
    })] });
    expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
});

it('inventory1-C13: successful native citation correction cannot bypass source drift at publication', async () => {
    const f = await scenario(false, 'stale');
    expect(f.execute).toHaveBeenCalledTimes(34); expect(new Set(f.assessed).size).toBe(169);
    expect(f.results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'workflow.stale' })] });
    expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
});
