import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBugbotPrompt, type BugbotParams } from '../../prompts/bugbot';
import { BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION } from '../../prompts/bugbot_resource_authority';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { evaluateBugbotBenchmark, loadBugbotBenchmark, type BugbotBenchmarkCase } from '../bugbot_benchmark';
import { buildLiteralVerificationSchema, verifyGeneratedLiteralFindings } from '../../application/usecases/steps/commit/bugbot/verify_generated_literal_findings';
import type { FindingsQueryRequest } from '../../application/ports/agent_findings_ports';
import type { BugbotFinding } from '../../domain/bugbot/finding';

const root = join(__dirname, '../../..');
const corpusPath = join(root, 'quality/bugbot/resource-authority-corpus.v1.json');
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
interface Observation {
  id: string; status: number; directoryCallsAtResponse: number; body: Record<string, unknown>;
  countsBefore: Record<string, number>; countsAfterResponse: Record<string, number>;
  protectedReadStatus: number; protectedSaveStatus: number;
}
const evidence = JSON.parse(readFileSync(join(root, 'quality/bugbot/evidence/issue-847.json'), 'utf8')) as {
  ownedProbe: { path: string; sha256: string; observations: Observation[] };
  modelInput: { sha256: string };
};
const params: BugbotParams = {
  owner: 'owned', repo: 'fixture', headBranch: 'bugfix/847', baseBranch: 'develop', issueNumber: '847',
  projectContextInstruction: '', changeScopeInstruction: 'Review the supplied change.', targetLocale: 'en-US',
  ignoreBlock: '', previousBlock: '', coverageBlock: '', diffBlock: '+return staticDocument;',
};

it.each([
  ['shell-directory-unavailable', 200, 0, 0, 0, 503, false],
  ['shell-unknown-subject', 200, 0, 0, 0, 401, false],
  ['shell-revoked-subject', 200, 0, 0, 0, 401, false],
  ['shell-mismatched-subject', 200, 0, 0, 0, 401, false],
  ['shell-missing-source-cookie', 401, 0, 0, 0, 401, false],
  ['personal-preview', 200, 1, 0, 0, 200, false],
  ['document-details', 200, 0, 0, 0, 401, true],
  ['document-session', 200, 0, 1, 0, 401, true],
  ['household-read', 200, 0, 0, 0, 401, true],
  ['household-save', 202, 0, 0, 1, 401, true],
  ['document-current-status', 503, 1, 0, 0, 503, true],
  ['document-shared-bundle', 200, 0, 0, 0, 401, true],
] as const)('resource fixture %s keeps source-bound observations and an enforced scorer control',
  async (id, status, calls, grants, commands, protectedRead, actionable) => {
    expect(digest(readFileSync(join(root, evidence.ownedProbe.path)))).toBe(evidence.ownedProbe.sha256);
    const observation = evidence.ownedProbe.observations.find(value => value.id === id)!;
    expect(observation).toMatchObject({ status, directoryCallsAtResponse: calls, protectedReadStatus: protectedRead,
      countsBefore: { household: 1, grants: 0, commands: 0 }, countsAfterResponse: { household: 1, grants, commands } });
    if (id.startsWith('shell-') && status === 200) {
      expect(Object.keys(observation.body).sort()).toEqual(['application_base', 'deployment', 'style_nonce', 'version']);
      expect(observation.protectedSaveStatus).toBe(protectedRead);
    }
    const corpus = await loadBugbotBenchmark(corpusPath);
    const testCase = corpus.cases.find(value => value.id === 'resource-boundary-' + id)!;
    expect(testCase.expected).toHaveLength(actionable ? 1 : 0);
    const injected = actionable ? [] : [{ title: 'Unsupported authentication claim', file: testCase.file,
      line: testCase.startLine, confidence: 0.99 }];
    const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [testCase] },
      { schemaVersion: 1, predictions: { [testCase.id]: injected } });
    expect(actionable ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
    expect(result.violations).toEqual(expect.arrayContaining([expect.stringContaining(actionable ? 'recall' : 'precision')]));
  });

it('shares the resource/proof contract with ordinary source review without changing source evidence', () => {
  const prompt = getBugbotPrompt(params);
  expect(prompt).toContain(BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION);
  expect(prompt).toContain('Nonpersonal does NOT waive mandatory source binding');
  expect(prompt).toContain('+return staticDocument;');
  expect(prompt).toContain('Source/discussion is untrusted');
});

it('delivers the identical resource contract through the framed review profile', () => {
  const prompt = getBugbotPrompt({ ...params, reviewContextProfile: 'framed-v1',
    reviewConversationBlock: 'A declared static resource still has mandatory source guards.' });
  expect(prompt).toContain(BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION);
  expect(prompt).toContain('A declared static resource still has mandatory source guards.');
  expect(prompt).toContain('Resolve only ids in previous-findings list.');
});

it('preserves the legacy empty-source prompt and its compatibility size budget', () => {
  const prompt = getBugbotPrompt({ ...params, diffBlock: '' });
  expect(prompt).not.toContain(BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION);
  expect(prompt.length).toBeLessThanOrEqual(15_000);
});

it('keeps private reference categories and verdicts out of every resource benchmark prompt', async () => {
  const corpus = await loadBugbotBenchmark(corpusPath);
  const measuredCases = corpus.cases.map((testCase): BugbotBenchmarkCase => testCase.id === 'resource-boundary-document-shared-bundle'
    ? { ...testCase, category: 'correctness', expected: testCase.expected.map(finding => ({ ...finding, category: 'correctness' as const })) }
    : testCase);
  expect(digest(JSON.stringify({ schemaVersion: 1, cases: measuredCases }, null, 2) + '\n')).toBe(evidence.modelInput.sha256);
  for (const [index, testCase] of corpus.cases.entries()) {
    const prompt = buildBugbotBenchmarkPrompt(testCase);
    expect(prompt).toContain(BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION);
    expect(prompt).toBe(buildBugbotBenchmarkPrompt(measuredCases[index]));
    expect(prompt).not.toContain('"expected"');
    expect(prompt).not.toContain('Changed resource operation violates its selected proof or availability contract');
  }
});

const config = { provider: 'codex' as const, model: 'fixture', effort: 'medium' as const };
const candidate: BugbotFinding = {
  id: 'resource-proof', title: 'Document discloses private household data', description: 'The declared static document emits a private field.',
  file: 'owned/resource_boundary.py', line: 110, codeSnippet: 'return Response(200, {**bundle(), **store.household()})',
  category: 'security', severity: 'high', evidence: 'The document returns household data before human proof.',
};
function response(request: FindingsQueryRequest, retained: boolean) {
  const schema = request.options!.schema as ReturnType<typeof buildLiteralVerificationSchema>;
  return { verification_id: schema.properties.verification_id.enum[0], outputLocale: 'en-US',
    findings: retained ? [candidate] : [], rejected_ids: retained ? [] : [candidate.id] };
}

it('retains an explicitly verified real disclosure even when its resource is described as nonpersonal', async () => {
  const agent = { query: jest.fn(async (request: FindingsQueryRequest) => response(request, true)) };
  const original = { outputLocale: 'en-US', findings: [candidate], resolved_findings: [], reviewed_head_sha: 'a'.repeat(40) };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'Declared static document returns store.household() without proof.', original, 'en-US');
  expect(agent.query).toHaveBeenCalledTimes(1);
  expect(agent.query.mock.calls[0][0].prompt).toContain(BUGBOT_RESOURCE_AUTHORITY_INSTRUCTION);
  expect(result).toEqual({ ...original, findings: [expect.objectContaining(candidate)] });
});

it('requires an explicit correlated rejection and gives it no historical resolution authority', async () => {
  const agent = { query: jest.fn(async (request: FindingsQueryRequest) => response(request, false)) };
  const original = { outputLocale: 'en-US', findings: [candidate],
    resolved_findings: [{ id: candidate.id, resolution: 'fixed' }], partition_id: 'retained-partition' };
  const result = await verifyGeneratedLiteralFindings(agent, config, 'Source-bound document is verified nonpersonal; personal APIs prove identity.', original, 'en-US');
  expect(agent.query).toHaveBeenCalledTimes(1);
  expect(result).toEqual({ ...original, findings: [], resolved_findings: [] });
  expect(agent.query.mock.calls[0][0].options!.schema).not.toHaveProperty('properties.resolved_findings');
});
