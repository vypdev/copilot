import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evaluateBugbotBenchmark, type BugbotBenchmarkCorpus } from '../bugbot_benchmark';
import { buildBugbotBenchmarkPrompt } from '../bugbot_benchmark_runner';
import { buildLiteralVerificationPrompt } from '../../application/usecases/steps/commit/bugbot/verify_generated_literal_findings';
import { BUGBOT_FIXTURE_VALUES_INSTRUCTION, BUGBOT_RECOVERY_CONTRACT_INSTRUCTION, getBugbotPrompt } from '../../prompts/bugbot';
import { renderUntrustedField, UNTRUSTED_CONTENT_POLICY } from '../../domain/security/untrusted_content';

const read = (path: string) => readFileSync(join(__dirname, '../../..', path), 'utf8');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const corpus: BugbotBenchmarkCorpus = JSON.parse(read('quality/bugbot/corpus.v1.json'));
const evidence = JSON.parse(read('quality/bugbot/evidence/issue-832.json'));
const cases = corpus.cases.filter(item => item.id.startsWith('snapshot-recovery-'));
const source = read('src/tooling/__tests__/fixtures/bugbot_recovery_contract_probe.py');

it.each([undefined, '', ' \n\t', '\u0000\u0001'])('derives source-bound guidance from the actual block %j without changing framing', diffBlock => {
  const prompt = getBugbotPrompt({ owner: 'owned', repo: 'repo', headBranch: 'bugfix/832', baseBranch: 'develop', issueNumber: '832',
    projectContextInstruction: '', changeScopeInstruction: 'Review assigned code.', targetLocale: 'en-US',
    ignoreBlock: '', previousBlock: '', coverageBlock: '', diffBlock });
  expect(prompt.includes(BUGBOT_RECOVERY_CONTRACT_INSTRUCTION)).toBe((diffBlock ?? '').length > 0);
  expect(prompt.includes(BUGBOT_FIXTURE_VALUES_INSTRUCTION)).toBe((diffBlock ?? '').length > 0);
  expect(prompt).toContain(renderUntrustedField(diffBlock ?? '', 'prompt.diffBlock', 70_000));
  expect(prompt.startsWith(UNTRUSTED_CONTENT_POLICY)).toBe(true);
  expect(prompt).toContain('withdraw the finding entirely, including low/info');
});

it('keeps ten frozen recovery scenarios, including four real cleanup/data-loss controls', () => {
  expect(cases).toEqual(evidence.frozenCorpus.cases);
  expect(cases).toHaveLength(10);
  expect(cases.filter(item => item.expected.length)).toHaveLength(4);
});

it.each(cases)('binds exact changed source and helper context for $id', item => {
  const binding = evidence.probe.bindings.find((value: { caseId: string }) => value.caseId === item.id);
  const original = source.split('\n').slice(binding.startLine - 1, binding.endLine).join('\n');
  expect(item.startLine).toBe(binding.startLine);
  expect(item.diff.split('\n').map(line => line.slice(1)).join('\n')).toBe(original);
  expect(item.description).toContain('def stage_payload(');
  expect(item.description).toContain('def publish_manifest(');
  expect(item.description).toContain('def report_snapshot(');
  expect(item.description).toContain('def inspect_bundle(');
  expect(item.description).not.toContain('SCENARIOS =');
  for (const finding of item.expected) {
    expect(item.diff.split('\n')[finding.line! - item.startLine]).toBe('+' + finding.codeSnippet);
    expect(finding.symbol).toBe(binding.function);
  }
});

// Recorded executions of fixed owned Python functions, not an interpreter of
// corpus text or a claim that CI executes Python/consumer code. Hash binding
// makes any changed probe require fresh independently captured observations.
const observedStates = [
  ['snapshot-recovery-explicit-retain', { directoryPresent: true, validManifest: false, retryBlocked: true }],
  ['snapshot-recovery-disposable-retain', { directoryPresent: true, validManifest: false, retryBlocked: true }],
  ['snapshot-recovery-disposable-clean', { directoryPresent: false, retryBlocked: false }],
  ['snapshot-recovery-published-report', { declaredPublished: true, validManifest: true, retryBlocked: true }],
  ['snapshot-recovery-published-cleanup', { declaredPublished: true, directoryPresent: false, validManifest: false }],
  ['snapshot-recovery-existing-destination', { priorEvidencePreserved: false, retryBlocked: false }],
  ['snapshot-recovery-changed-ownership', { leaseStillOwned: false, foreignEvidencePreserved: true, directoryPresent: true }],
  ['snapshot-recovery-policy-unavailable', { directoryPresent: true, retryBlocked: true }],
  ['snapshot-recovery-incomplete-manifest', { validManifest: false, filesAfterFirstCall: ['manifest.json', 'part-a.bin', 'part-b.bin'] }],
  ['snapshot-recovery-completed-destination', { validManifestBeforeCall: true, validManifest: false, priorEvidencePreserved: false }],
] as const;

it.each(observedStates)('preserves the independently recorded native state for %s', (id, state) => {
  const binding = evidence.probe.bindings.find((value: { caseId: string }) => value.caseId === id);
  const observation = evidence.ownedNative.observations.find((value: { id: string }) => value.id === binding.observationId);
  expect(observation).toMatchObject({ ...state, sourceUnchanged: true });
  expect(evidence.ownedNative.kind).toBe('fixed-owned-filesystem');
  const item = cases.find(value => value.id === id)!;
  expect(item.description).toContain('"sourceUnchanged":true');
  expect(item.description).toContain('"retryBlocked":' + observation.retryBlocked);
});

it.each(cases)('penalizes the opposite recovery verdict for $id without relaxed floors', item => {
  const selected = { schemaVersion: 1 as const, cases: [item] };
  const correct = item.expected.map(value => ({ ...value, confidence: 1 }));
  expect(evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: { [item.id]: correct } }).violations).toEqual([]);
  const wrong = item.expected.length ? [] : [{ title: 'Unsupported required deletion', file: item.file,
    line: item.startLine, severity: 'medium', category: 'reliability', confidence: 1 }];
  const result = evaluateBugbotBenchmark(selected, { schemaVersion: 1, predictions: { [item.id]: wrong } });
  expect(item.expected.length ? result.metrics.falseNegatives : result.metrics.falsePositives).toBe(1);
  expect(result.violations.length).toBeGreaterThan(0);
});

it('delivers recovery guidance and selected source to the real benchmark', () => {
  const prompt = buildBugbotBenchmarkPrompt(cases[0]);
  expect(prompt).toContain(BUGBOT_RECOVERY_CONTRACT_INSTRUCTION);
  expect(prompt).toContain(cases[0].description);
  expect(prompt).toContain(cases[0].diff);
});

it('requests the exact locale required by independent benchmark adjudication', () => {
  expect(buildBugbotBenchmarkPrompt(cases[0])).toContain('Use en-US for product-facing text and echo outputLocale exactly as en-US.');
});

it('keeps recovery policy trusted in existing independent candidate verification', () => {
  const prompt = buildLiteralVerificationPrompt('untrusted old detection task', [], 'a'.repeat(64), 'en-US');
  expect(prompt.indexOf(BUGBOT_RECOVERY_CONTRACT_INSTRUCTION)).toBeLessThan(prompt.indexOf('Reviewed source/context:'));
  expect(prompt).toContain('No new finding IDs, no omitted/duplicate decisions');
  expect(prompt).toContain('no historical finding resolution/dismissal/reopening authority');
  expect(prompt).toContain('never execute fixture code or access credentials/network');
});

it('keeps private verdicts and replacements out of actual agent inputs', () => {
  const prompt = buildBugbotBenchmarkPrompt({ ...cases[0], expected: [{ title: 'private-832-verdict', suggestion: 'private-832-fix' }] });
  expect(prompt).not.toContain('private-832-verdict');
  expect(prompt).not.toContain('private-832-fix');
  expect(prompt).not.toContain('"expected"');
  expect(prompt).not.toContain('SCENARIOS =');
});

it('preserves all 152 prior corpus inputs and reference predictions', () => {
  const previous = corpus.cases.slice(0, evidence.priorCorpus.cases);
  const previousIds = new Set(previous.map(item => item.id));
  const references = JSON.parse(read('quality/bugbot/reference-predictions.v1.json'));
  expect(previous).toHaveLength(evidence.priorCorpus.cases);
  expect(hash(JSON.stringify(previous))).toBe(evidence.priorCorpus.decodedCasesSha256);
  expect(hash(JSON.stringify(Object.fromEntries(Object.entries(references.predictions)
    .filter(([id]) => previousIds.has(id)))))).toBe(evidence.priorCorpus.decodedReferencesSha256);
});

it('binds native observations to the independently authored fixed probe identity', () => {
  expect(hash(source)).toBe(evidence.probe.sha256);
  expect(evidence.ownedNative.interpreter).toBe('3.14.6');
  expect(evidence.ownedNative.limitations).toContain('No consumer or corpus source executed.');
  expect(source).not.toContain('eval(');
  expect(source).not.toContain('exec(');
});
