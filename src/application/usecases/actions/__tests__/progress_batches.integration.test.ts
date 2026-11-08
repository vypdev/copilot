import { ApplicationError } from '../../../errors/application_error';
import { analyzeProgressBatches } from '../progress_batch_workflow';
import { captureProgressScopeSource } from '../../../policies/progress_scope_source_policy';
import { renderSemanticStatus, selectSemanticStatusIntents } from '../../../policies/semantic_result_publication_policy';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Ai } from '../../../../data/model/ai';
import type { Execution } from '../../../../data/model/execution';
import { ProgressDiffRepository } from '../../../../data/repository/progress_diff_repository';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { CommitUseCase } from '../../commit_use_case';
import { partitionProgressDiff } from '../../../policies/progress_diff_partition_policy';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import type { FindingsQueryRequest } from '../../../ports/agent_findings_ports';
import { assertAgentResponseSchema } from '../../../../data/repository/agent_json_schema_validator';
import { interpretProgressAgentOutput } from '../../../../data/repository/progress_agent_response_policy';
import { assessmentWireFixture } from './fixtures/progress_assessment_wire_fixture';

const base = 'a'.repeat(40), head = 'b'.repeat(40);
const fixtureText = readFileSync(join(__dirname, 'fixtures/domus-29-immutable-replay.json.gz.hex'), 'utf8');
const fixtureBytes = Buffer.from(fixtureText.replace(/\s/gu, ''), 'hex');
const fixture = JSON.parse(gunzipSync(fixtureBytes).toString('utf8'));
async function domusComparison() {
    const { captured } = fixture;
    const diff = new ProgressDiffRepository({ getClient: () => ({ rest: { repos: { compareCommits: async () => ({ data: fixture.nativeComparison }) } } }) },
        { getClient: () => ({ rest: { git: { getCommit: async ({ commit_sha }) => ({ data: captured.commits[String(commit_sha)] }),
            getTree: async ({ tree_sha }) => ({ data: captured.trees[String(tree_sha)] }), getBlob: async ({ file_sha }) => ({ data: captured.blobs[String(file_sha)] }) } } }) });
    return diff.getDiff('vypdev', 'domus', fixture.base, fixture.head, '');
}
function scenario(body = Array.from({ length: 33 }, (_, index) => `Implement unique obligation ${index + 1}.`).join('\n'),
    diff: ProgressDiffEvidence = partitionProgressDiff(base, head, [{ path: 'src/product.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }])) {
    const state = { body, head: diff.headSha, base: diff.baseSha, open: true, owner: 29 };
    const setProgressLabel = jest.fn(), setLabels = jest.fn();
    const finalOutputs: any[] = [];
    const query = jest.fn(async (request: FindingsQueryRequest) => {
        expect(setProgressLabel).not.toHaveBeenCalled(); expect(setLabels).not.toHaveBeenCalled();
        const schema = request.options!.schema as any;
        if (schema.properties.lines) return { outputLocale: 'en-US', snapshotDigest: schema.properties.snapshotDigest.enum[0], assignmentId: schema.properties.assignmentId.enum[0], headSha: schema.properties.headSha.enum[0], lines: schema.properties.lines.items.properties.id.enum.map((id: string) => ({ id,
            kind: body === fixture.body && !fixture.requiredLineIds.includes(id) ? 'context' : 'required' })) };
        if (schema.properties.files) {
            const properties = schema.properties.files.items.properties;
            const units = diff.kind === 'partitioned' ? diff.partitions.flatMap(part => part.units ?? []) : [];
            return { outputLocale: 'en-US', partitionId: schema.properties.partitionId.enum[0],
                files: properties.unitId ? properties.unitId.enum.map((unitId: string) => ({ unitId, path: units.find(unit => unit.id === unitId)!.path, implemented: 'Present.', remaining: 'Unknown.' }))
                    : properties.path.enum.map((path: string) => ({ path, implemented: 'Present.', remaining: 'Unknown.' })) };
        }
        const properties = schema.properties.requirements.items.properties;
        if (!properties.assessment) {
            expect(request.prompt).toContain(`Each string has a hard limit of ${properties.summary.maxLength} Unicode code points, counting spaces and punctuation.`);
            expect(request.prompt).toContain(properties.summary.description);
        } else expect(request.prompt).toContain('Complete closed-fact assessment protocol');
        expect(request.prompt).toContain('Keep paths, IDs, source quotes and background out of summary and remaining.');
        expect(request.prompt).toContain(JSON.stringify({ manifestDigest: schema.properties.manifestDigest.enum[0], batchId: schema.properties.batchId.enum[0],
            headSha: schema.properties.headSha.enum[0], evidenceDictionary: properties.citations.items.enum }));
        const response = { outputLocale: 'en-US', progress: 50, manifestDigest: schema.properties.manifestDigest.enum[0],
            batchId: schema.properties.batchId.enum[0], headSha: schema.properties.headSha.enum[0], requirements: properties.id.enum.map((id: string) => ({ id,
                status: 'verification-unknown', evidence: 'external-unverified', summary: 'Source reviewed.', remaining: 'Execution unverified.', citations: [properties.citations.items.enum[0]] })) };
        const wire = assessmentWireFixture(response, schema);
        assertAgentResponseSchema(wire, schema, 'progress_response');
        finalOutputs.push(wire);
        return wire;
    });
    const check = new CheckProgressUseCase({ getDescription: async () => state.body }, { getLabels: async () => [], setLabels }, { setProgressLabel },
        { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [29] }, { query },
        { isIssueOpen: async () => state.open, getBranchHeadSha: async branch => branch === 'develop' ? state.base : state.head },
        { getDiff: async () => diff }, { getSource: async () => ({ kind: 'pull-request', number: state.owner, headSha: state.head, baseBranch: 'develop' }) });
    const empty = { taskId: 'fixture', invoke: async () => [] };
    const commit = new CommitUseCase(empty, empty, empty, check);
    const input = { issue: { number: 23, reopenOnPush: false }, pullRequest: { number: -1, head: '', action: '' },
        currentConfiguration: { parentBranch: 'develop' }, project: { getProjects: () => [] },
        sizeThresholds: Object.fromEntries(['xxl', 'xl', 'l', 'm', 's', 'xs'].map(key => [key, { lines: 1, files: 1, commits: 1 }])),
        labels: { currentIssueLabels: [], currentPullRequestLabels: [], sizeXxl: 'size: XXL', sizeXl: 'size: XL', sizeL: 'size: L', sizeM: 'size: M', sizeS: 'size: S', sizeXs: 'size: XS' },
        owner: 'vypdev', repo: 'domus', issueNumber: 23, inputs: { after: diff.headSha },
        ai: new Ai('', 'deterministic-fixture', false, [], false, 'low', 20), locale: { issue: 'en-US' },
        commit: { branch: fixture.branch, commits: [{ id: diff.headSha }] }, branches: { development: 'develop', featureTree: 'feature' } } as unknown as Execution;
    return { state, query, setProgressLabel, setLabels, finalOutputs, invoke: () => commit.invoke(input) };
}
const retained = (value: ReturnType<typeof scenario>) => { expect(value.setProgressLabel).not.toHaveBeenCalled(); expect(value.setLabels).not.toHaveBeenCalled(); };

it('CommitScope916-C11 offers only admitted source citations when the comparison also contains generated metadata', async () => {
    const diff = partitionProgressDiff(base, head, [{ path: 'build/index.js', status: 'modified', additions: 1, deletions: 0, evidence: 'generated-metadata-only' },
        { path: 'src/product.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }]);
    const f = scenario('Implement source behavior.', diff), results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50 } });
    expect(f.finalOutputs[0].requirements[0].citations).toEqual(['src/product.ts']);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it('CommitScope916-C11 retains progress when the complete comparison supplies only generated metadata', async () => {
    const diff = partitionProgressDiff(base, head, [{ path: 'build/index.js', status: 'modified', additions: 1, deletions: 0, evidence: 'generated-metadata-only' }]);
    const f = scenario('Implement source behavior.', diff), results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'evidence-missing' }) }) })] });
    expect(f.query).toHaveBeenCalledTimes(1); expect(f.finalOutputs).toHaveLength(0);
    retained(f); expect(selectSemanticStatusIntents({ locale: 'en-US', results })).toEqual([]);
});

it('CommitScope916-C06 assesses 33 distinct obligations in two bounded groups through Commit', async () => {
    const f = scenario(), results = await f.invoke();
    expect(results.at(-1)?.errors.map(error => ({ message: error.message, recovery: error.recovery }))).toEqual([]);
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50 } });
    const intents = selectSemanticStatusIntents({ locale: 'en-US', results });
    expect(intents).toHaveLength(1);
    expect(intents[0]).toMatchObject({ sourceVersion: `head:${head}:scope:${(results.at(-1)!.payload as { scopeManifestDigest: string }).scopeManifestDigest}`, sourceGuard: { kind: 'branch-head', sha: head } });
    expect(f.finalOutputs.map(output => output.requirements.length)).toEqual([32, 1]);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setLabels).toHaveBeenCalledTimes(1);
});
it('Issue925 preserves the maximum admitted narrative allocation on the ordinary 32-requirement path', async () => {
    const f = scenario(Array.from({ length: 32 }, (_, index) => `Implement unique obligation ${index + 1}.`).join('\n')), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request) as any;
        if (response.requirements) {
            const limit = (request.options!.schema as any).properties.requirements.items.properties.summary.maxLength;
            response.requirements.forEach((fact: any) => { fact.summary = 's'.repeat(limit); fact.remaining = 'r'.repeat(limit); });
        }
        return response;
    });
    const results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50 } });
    expect(f.finalOutputs).toHaveLength(1);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    const [intent] = selectSemanticStatusIntents({ locale: 'en-US', results });
    const card = renderSemanticStatus(intent);
    expect(card).not.toContain('[untrusted content truncated]');
    for (const response of f.finalOutputs) for (const fact of response.requirements) expect(card).toContain(`[${fact.id}]`);
});
it('github-communication-experience-change-C181: exhausted completion in a later closed-fact batch discards every provisional receipt', async () => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request) as any;
        if (response.requirements && f.finalOutputs.length >= 2) {
            const schema: any = request.options!.schema;
            response.requirements.forEach((fact: Record<string, unknown>) => { fact.assessment = 'supported'; });
            return interpretProgressAgentOutput(JSON.stringify(response), 'assessment', schema);
        }
        return response;
    });
    const results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: false, errors: [{ recovery: { id: 'progress-completion-recovery-exhausted', variables: { requirementCount: 1, supportedCount: 1 } } }] });
    expect(f.finalOutputs).toHaveLength(3); retained(f);
    expect(selectSemanticStatusIntents({ locale: 'en-US', results })).toEqual([]);
});
it('CommitScope916-C17 replays the original Domus body and complete immutable comparison through Commit', async () => {
    expect(fixtureBytes.toString('hex')).toBe(fixtureText.replace(/\s/gu, ''));
    expect(Buffer.from(fixtureText, 'utf8').includes(0)).toBe(false);
    expect(createHash('sha256').update(fixture.body).digest('hex')).toBe(fixture.bodyDigest);
    expect(createHash('sha256').update(fixtureBytes).digest('hex')).toBe('713e7e3dbf6362bbd238749fd29e136f67e1f9decb8472e3efd27edf1a6ba951');
    const diff = await domusComparison();
    expect(diff).toMatchObject({ kind: 'partitioned', protocol: { requiredPaths: expect.any(Array), recovery: { total: { requests: 78, bytes: 2319555 } } } });
    if (diff.kind !== 'partitioned') throw Error('Missing complete comparison');
    expect(diff.partitions).toHaveLength(16); expect(diff.protocol!.requiredPaths).toHaveLength(157);
    const f = scenario(fixture.body, diff), results = await f.invoke();
    expect(results.at(-1)?.errors.map(error => ({ message: error.message, recovery: error.recovery }))).toEqual([]);
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50, sourceHeadSha: fixture.head } });
    const outcomes = f.finalOutputs.flatMap(output => output.requirements);
    expect(outcomes).toHaveLength(108); expect(new Set(outcomes.map(value => value.id)).size).toBe(108);
    expect(f.finalOutputs.every(output => output.headSha === fixture.head && output.requirements.every((value: any) => value.citations.length > 0))).toBe(true);
    expect(f.finalOutputs.map(output => output.requirements.length)).toEqual([32, 32, 32, 12]); expect(f.query).toHaveBeenCalledTimes(30); expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
    const [intent] = selectSemanticStatusIntents({ locale: 'en-US', results });
    const card = renderSemanticStatus(intent);
    expect(card).not.toContain('[untrusted content truncated]');
    for (const outcome of outcomes) expect(card).toContain(`[${outcome.id}]`);
});
it('github-communication-experience-change-C167: the archived Domus inventory retains all 108 requirements through one complete closed-fact correction', async () => {
    const diff = await domusComparison(), f = scenario(fixture.body, diff), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request) as any;
        if (response.requirements) {
            const schema: any = request.options!.schema;
            if (f.finalOutputs.length === 1) response.requirements.forEach((fact: Record<string, unknown>) => { fact.assessment = 'supported'; });
            return interpretProgressAgentOutput(JSON.stringify(response), 'assessment', schema);
        }
        return response;
    });
    const results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50, sourceHeadSha: fixture.head } });
    expect(f.query).toHaveBeenCalledTimes(31); expect(f.finalOutputs).toHaveLength(5);
    const accepted = f.finalOutputs.slice(1).flatMap(output => output.requirements);
    expect(accepted).toHaveLength(108); expect(new Set(accepted.map(value => value.id)).size).toBe(108);
    expect(accepted.every(value => value.citations.length > 0)).toBe(true);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setLabels).toHaveBeenCalledTimes(1);
    const card = renderSemanticStatus(selectSemanticStatusIntents({ locale: 'en-US', results })[0]);
    for (const value of accepted) expect(card).toContain(`[${value.id}]`);
    expect(card).not.toContain('[untrusted content truncated]');
});
it.each(['head', 'manifest', 'batch', 'missing-citation', 'foreign-citation', 'missing-requirement', 'foreign-requirement', 'duplicate-requirement'])(
    'CommitScope916-C11/C12/C13 rejects %s in the final batch before any progress write', async mode => {
        const f = scenario(), answer = f.query.getMockImplementation()!;
        f.query.mockImplementation(async request => {
            const response = await answer(request) as any;
            if (response.requirements && f.finalOutputs.length === 2) {
                if (mode === 'head') response.headSha = 'f'.repeat(40);
                if (mode === 'manifest') response.manifestDigest = 'f'.repeat(64);
                if (mode === 'batch') response.batchId = 'foreign';
                if (mode === 'missing-citation') response.requirements[0].citations = [];
                if (mode === 'foreign-citation') response.requirements[0].citations = ['foreign'];
                if (mode === 'missing-requirement') response.requirements = [];
                if (mode === 'foreign-requirement') response.requirements[0].id = 'R999';
                if (mode === 'duplicate-requirement') response.requirements.push(response.requirements[0]);
            }
            return response;
        });
        const results = await f.invoke();
        expect(results.at(-1)?.success).toBe(false);
        expect(selectSemanticStatusIntents({ locale: 'en-US', results })).toEqual([]);
        expect(f.finalOutputs).toHaveLength(2); retained(f);
    });
it.each(['body', 'head', 'base', 'owner', 'open'] as const)('CommitScope916-C15/C16 retains progress after a concurrent %s change', async field => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const output = await answer(request);
        if ((output as any).requirements && f.finalOutputs.length === 2) {
            if (field === 'body') f.state.body += '\nNew obligation.';
            if (field === 'head' || field === 'base') f.state[field] = 'f'.repeat(40);
            if (field === 'owner') f.state.owner++;
            if (field === 'open') f.state.open = false;
        }
        return output;
    });
    const results = await f.invoke();
    expect(f.finalOutputs).toHaveLength(2);
    expect(results.at(-1)).not.toMatchObject({ success: true, payload: { progress: 50 } }); retained(f);
});
it('CommitScope916-C18 preserves ordinary single-batch publication', async () => {
    const f = scenario('One obligation.');
    const results = await f.invoke();
    expect(results.at(-1)?.errors.map(error => ({ message: error.message, recovery: error.recovery }))).toEqual([]);
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50 } });
    expect(f.finalOutputs).toHaveLength(1); expect(f.query).toHaveBeenCalledTimes(2);
});
it('CommitScope916-C09 rejects a free-form remaining field on a complete batch response', async () => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => { const output = await answer(request); return (output as any).requirements ? { ...output, remaining: 'foreign scope' } : output; });
    expect((await f.invoke()).at(-1)?.success).toBe(false); retained(f);
});
it('keeps incomplete aggregate cards and PR labels below completion through Commit', async () => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request);
        return (response as any).requirements ? { ...response, progress: 99.9 } : response;
    });
    expect((await f.invoke()).at(-1)).toMatchObject({ success: true, payload: { progress: 99 } });
    expect(f.setLabels).toHaveBeenCalledWith(29, ['95%']);
});
it.each(['headSha', 'snapshotDigest', 'assignmentId'] as const)('rejects a foreign classification %s before assessing or publishing any requirement', async field => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request);
        if ((response as any).lines && f.query.mock.calls.length === 2) return { ...response, [field]: 'foreign' };
        return response;
    });
    expect((await f.invoke()).at(-1)?.success).toBe(false);
    expect(f.query).toHaveBeenCalledTimes(2); expect(f.finalOutputs).toHaveLength(0); retained(f);
});
it('preserves complete human context across classification boundaries while assigning each source span once', async () => {
    const f = scenario('Non-goals and qualification for all following source spans.\n' + Array.from({ length: 32 }, (_, index) => `Scoped clause ${index + 1}.`).join('\n'));
    expect((await f.invoke()).at(-1)?.success).toBe(true);
    const second = f.query.mock.calls[1][0], properties = (second.options!.schema as any).properties;
    expect(properties.lines.items.properties.id.enum).toEqual(['L33']);
    expect(second.prompt).toContain('Non-goals and qualification for all following source spans.');
    expect(second.prompt).toContain('source assignment 2 of 2');
});
it('partitions a coherent scope exceeding one acceptance byte envelope without dropping clauses or source parts', async () => {
    const body = Array.from({ length: 128 }, (_, index) => `Implement distinct obligation ${index + 1}. ${'q'.repeat(600)}`).join('\n');
    const diff = partitionProgressDiff(base, head, ['src/a.ts', 'src/b.ts'].map(path => ({ path, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) })));
    const f = scenario(body, diff), results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: true, payload: { progress: 50 } });
    expect(f.finalOutputs).toHaveLength(4);
    expect(f.finalOutputs.flatMap(output => output.requirements)).toHaveLength(128);
    expect(f.query.mock.calls.filter(([request]) => (request.options!.schema as any).properties.files)).toHaveLength(8);
    expect(f.setProgressLabel).toHaveBeenCalledTimes(1);
});
it('preflights the complete repeated evidence plan against the call budget before any source or assessment query', async () => {
    const body = Array.from({ length: 256 }, (_, index) => `Implement distinct obligation ${index + 1}. ${'q'.repeat(300)}`).join('\n');
    const diff = partitionProgressDiff(base, head, Array.from({ length: 16 }, (_, index) => ({ path: `src/file-${index}.ts`, status: 'modified', additions: 1, deletions: 0, patch: 'x'.repeat(150_000) })));
    const f = scenario(body, diff), results = await f.invoke();
    expect(results.at(-1)).toMatchObject({ success: false, errors: [expect.objectContaining({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'call-budget' }) }) })] });
    expect(f.query).toHaveBeenCalledTimes(8);
    expect(f.finalOutputs).toHaveLength(0); retained(f);
});
it('requires explicit repository identity before dispatching a direct batch analysis', async () => {
    const query = jest.fn(), body = 'Required source.', diff = partitionProgressDiff(base, head, [{ path: 'src/a.ts', status: 'modified', additions: 1, deletions: 0, patch: '+source' }]);
    await expect(analyzeProgressBatches({ issueNumber: 916, pushedBranch: 'feature/916-work', developmentBranch: 'develop', branchTypes: ['feature'],
        agentConfiguration: { provider: 'codex', model: 'fixture' }, includeReasoning: false, targetLocale: 'en-US' }, body, captureProgressScopeSource(body), diff,
        { kind: 'development', baseBranch: 'develop' }, { query })).rejects.toMatchObject({ recovery: expect.objectContaining({ variables: expect.objectContaining({ reason: 'manifest-identity' }) }) });
    expect(query).not.toHaveBeenCalled();
});
it.each([new Error('Transport failed.'), null, 'Transport failed.', new ApplicationError('provider.unavailable', 'Transport failed.')])('retains progress after an uncompleted assessment query %#', async error => {
    const f = scenario(), answer = f.query.getMockImplementation()!;
    f.query.mockImplementation(async request => {
        const response = await answer(request);
        if ((response as any).requirements && f.finalOutputs.length === 2) throw error;
        return response;
    });
    const results = await f.invoke();
    expect(results.at(-1)?.success).toBe(false); expect(f.finalOutputs).toHaveLength(2);
    expect(selectSemanticStatusIntents({ locale: 'en-US', results })).toEqual([]); retained(f);
});
