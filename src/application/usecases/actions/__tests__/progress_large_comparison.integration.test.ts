import { createHash } from 'node:crypto';
import { CheckProgressUseCase } from '../check_progress_use_case';
import { largeProgressFixture } from '../../../../data/repository/__tests__/fixtures/large_progress_fixture';
import { BASE, HEAD } from '../../../../data/repository/__tests__/fixtures/progress_object_fixture';
import type { ProgressDiffEvidence } from '../../../ports/progress_diff_query_ports';
import type { FindingsQueryPort, FindingsQueryRequest } from '../../../ports/agent_findings_ports';

const issue = 'Produce the complete specification package.\nDo not infer successful project execution from source.';
const context = { issueNumber: 1, pushedBranch: 'feature/1-work', developmentBranch: 'develop', branchTypes: ['feature'],
  agentConfiguration: { provider: 'codex' as const, model: 'fixture-model' }, includeReasoning: false, targetLocale: 'en-US' };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const properties = (schema: unknown) => (schema as { properties: Record<string, unknown> }).properties;
const values = (schema: unknown) => (schema as { enum: string[] }).enum;
const items = (schema: unknown) => (schema as { items: unknown }).items;

function scenario(corrupt = false) {
  const source = largeProgressFixture(corrupt);
  let diff: ProgressDiffEvidence | undefined;
  let parts = 0;
  const setProgressLabel = jest.fn(), setLabels = jest.fn();
  const getDiff = jest.fn(async () => { diff = await source.read(); return diff; });
  const query = jest.fn(async (request: FindingsQueryRequest) => {
    expect(setProgressLabel).not.toHaveBeenCalled();
    const schema = properties(request.options?.schema);
    if (schema.lines) return { outputLocale: 'en-US', lines: values(properties(items(schema.lines)).id).map(id => ({ id, kind: id === 'L1' ? 'required' : 'excluded' })) };
    if (schema.files) {
      if (diff?.kind !== 'partitioned') throw Error('Expected complete multipart source.');
      const part = diff.partitions[parts++];
      expect(request.prompt.includes(part.evidence)).toBe(true);
      const known = new Map(part.units!.map(unit => [unit.id, unit.path]));
      const fileSchema = properties(items(schema.files));
      return { outputLocale: 'en-US', partitionId: values(schema.partitionId)[0], files: values(fileSchema.unitId).map(unitId => ({
        unitId, path: known.get(unitId), implemented: 'R1 source reviewed; execution is not attested.', remaining: 'R1 has no missing source in this unit.',
      })) };
    }
    return { outputLocale: 'en-US', progress: 100, requirements: [{ id: 'R1', status: 'supported', evidence: 'source-only', summary: 'The complete source package was supplied.', remaining: null }] };
  });
  const useCase = new CheckProgressUseCase({ getDescription: async () => issue }, { getLabels: async () => [], setLabels }, { setProgressLabel },
    { getListOfBranches: async () => [] }, { getOpenPullRequestNumbersByHeadBranch: async () => [] }, { query } as FindingsQueryPort,
    { isIssueOpen: async () => true, getBranchHeadSha: async (branch: string) => branch === 'develop' ? BASE : HEAD }, { getDiff }, { getSource: async () => ({ kind: 'none' }) });
  return { source, query, useCase, setProgressLabel, setLabels, getDiff: () => diff, partCount: () => parts };
}

it('assesses all 140 paths and 85 omitted patches through bounded rounds before one publication', async () => {
  const f = scenario();
  const result = await f.useCase.invoke(context);
  expect(result[0]).toMatchObject({ success: true, payload: { progress: 100 } });
  const diff = f.getDiff(); if (diff?.kind !== 'partitioned') throw Error('Expected complete multipart evidence.');
  expect(diff.partitions.length).toBeGreaterThan(16);
  expect(diff.partitions.every(part => Buffer.byteLength(part.evidence) <= 256_000)).toBe(true);
  expect(f.partCount()).toBe(diff.partitions.length);
  expect(f.query).toHaveBeenCalledTimes(diff.partitions.length + 2);
  expect(f.setProgressLabel).toHaveBeenCalledTimes(1); expect(f.setProgressLabel).toHaveBeenCalledWith(1, 100);
  const changes = diff.partitions.flatMap(part => JSON.parse(part.evidence).changes) as { path: string; recoveredContent?: { text: string } }[];
  expect(new Set(changes.map(change => change.path))).toEqual(new Set(f.source.paths));
  for (const path of f.source.paths.slice(0, 85)) {
    const supplied = changes.filter(change => change.path === path).map(change => change.recoveredContent!.text).join('');
    expect(sha(supplied)).toBe(sha(f.source.contents[path] as string));
    expect(supplied.endsWith('END-' + path)).toBe(true);
  }
  expect(f.source.getBlob).toHaveBeenCalledTimes(85);
  expect(f.source.paths.slice(0, 85).reduce((total, path) => total + Buffer.byteLength(f.source.contents[path] as string), 0)).toBe(4_446_409);
  expect(f.source.files.reduce((total, file) => total + Buffer.byteLength(file.patch ?? ''), 0)).toBe(1_035_821);
}, 30_000);

it('rejects a corrupt final recovered blob after earlier frames without model or progress effects', async () => {
  const f = scenario(true);
  const result = await f.useCase.invoke(context);
  expect(result[0]).toMatchObject({ success: false, errors: [expect.objectContaining({ code: 'validation.evidence-unavailable' })] });
  expect(f.source.getBlob.mock.calls.length).toBeGreaterThan(64);
  expect(f.query).not.toHaveBeenCalled(); expect(f.setProgressLabel).not.toHaveBeenCalled(); expect(f.setLabels).not.toHaveBeenCalled();
}, 30_000);
