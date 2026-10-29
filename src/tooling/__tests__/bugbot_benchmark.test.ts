import { assertValidationFixtureSource, observeValidationFixture } from './fixtures/bugbot_validation_oracles';
import { load as parse } from 'js-yaml';
import { join } from 'node:path';
import { observeCallPathFixture } from './fixtures/bugbot_call_path_oracles';
import { tmpdir } from 'node:os';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { evaluateBugbotBenchmark, loadBugbotBenchmark, loadBugbotPredictions } from '../bugbot_benchmark';

describe('versioned Bugbot benchmark', () => {
  const root = join(__dirname, '..', '..', '..');

  it.each([
    'action-self-ref-bootstrap', 'action-self-ref-version-policy', 'action-workspace-ref-after-checkout', 'action-reference-contract-unavailable',
    'kt-wasm-parameter-closure', 'kt-wasm-size-count-parameters', 'kt-wasm-object-parameter', 'kt-wasm-binding-evidence-unavailable',
    'kt-email-unicode-empty-label-guard', 'ts-email-caller-empty-label-guard', 'ts-email-normalization-before-guard',
    'py-coverage-config-branch', 'py-http10-reconnect', 'docs-correct-regression-total',
    'py-short-circuit-unhashable', 'py-helper-retry-validation', 'ts-exclusive-render-branches',
    'android-listed-minor-platform', 'external-package-unverified-inventory', 'android-stale-inventory-current-install',
    'kt-resolved-sql-subclass', 'jvm-type-hierarchy-unavailable', 'jvm-current-contract-over-stale-docs',
    'action-declared-matcher-input', 'action-renamed-input-current-version', 'action-input-contract-unavailable',
    'test-indirect-binding-propagates', 'test-parameterized-fallback-reaches-stub', 'test-bound-callback-reaches-stub',

    'kt-compose-preferred-width-narrow', 'kt-compose-cap-before-fill', 'kt-compose-padded-preferred-width',
    'kt-compose-owned-loader', 'kt-compose-failed-startup-error',
  ])('treats a reported source/verdict mismatch as a false positive: %s', async (id) => {
    const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
    const item = corpus.cases.find((item) => item.id === id)!;
    expect(item.expected).toEqual([]);
    const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, {
      schemaVersion: 1, predictions: { [id]: [{ title: 'Unsupported defect', file: item.file, line: 1, confidence: 0.99 }] },
    });
    expect(result.metrics.falsePositives).toBe(1);
    expect(result.violations).toEqual(expect.arrayContaining([expect.stringContaining('precision')]));
  });

  it.each([
    'action-self-ref-explicit-suffix', 'action-workspace-ref-before-checkout', 'action-self-ref-unsupported-host',
    'kt-wasm-missing-direct-identifier', 'kt-wasm-missing-callback-identifier',
    'ts-email-existential-label-defect', 'ts-email-ignored-validator-result', 'ts-email-normalization-after-guard',
    'py-short-circuit-unsafe-order', 'ts-composed-duplicate-ids',
    'android-absent-platform-package', 'android-unrelated-green-job',
    'jvm-unrelated-runtime-wrapper', 'jvm-passing-mock-not-counterevidence', 'kt-broad-catch-swallows-cancellation',
    'action-undeclared-matcher-alias', 'action-old-input-on-new-version', 'action-declared-input-wrong-value',
    'test-delegate-bypasses-stub', 'test-empty-participants-skip-stub', 'test-recovery-swallows-bound-failure',

    'kt-compose-required-width-overflow', 'kt-compose-fill-before-cap',
    'kt-compose-external-loader', 'kt-compose-failed-startup-stuck', 'ts-viewport-version-without-cleanup',
  ])(
    'still requires the positive control with a reachable defect: %s', async (id) => {
      const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
      const item = corpus.cases.find((item) => item.id === id)!;
      expect(item.expected).toHaveLength(1);
      const result = evaluateBugbotBenchmark({ schemaVersion: 1, cases: [item] }, {
        schemaVersion: 1, predictions: { [id]: [] },
      });
      expect(result.metrics.falseNegatives).toBe(1);
      expect(result.violations).toEqual(expect.arrayContaining([expect.stringContaining('recall')]));
    },
  );

  it('loads the multilingual ground-truth corpus and passes its reference contract', async () => {
    const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
    const predictions = await loadBugbotPredictions(join(root, 'quality/bugbot/reference-predictions.v1.json'));
    const result = evaluateBugbotBenchmark(corpus, predictions);

    expect(corpus.cases.length).toBeGreaterThanOrEqual(20);
    expect(new Set(corpus.cases.map((item) => item.language)).size).toBeGreaterThanOrEqual(10);
    expect(corpus.cases.filter((item) => item.expected.length === 0).length).toBeGreaterThanOrEqual(8);
    expect(corpus.cases.filter((item) => item.expected.length > 0).length).toBeGreaterThanOrEqual(8);
    expect(result.violations).toEqual([]);
    expect(result.metrics).toEqual(expect.objectContaining({ precision: 1, recall: 1, f1: 1 }));
  });

  it('fails the gate for missing cases and noisy predictions', async () => {
    const corpus = await loadBugbotBenchmark(join(root, 'quality/bugbot/corpus.v1.json'));
    const result = evaluateBugbotBenchmark(corpus, {
      schemaVersion: 1,
      predictions: { 'docs-only': [{ title: 'Style concern', confidence: 0.95 }] },
    });
    expect(result.violations.length).toBeGreaterThan(0);
    expect(result.missingCases.length).toBe(corpus.cases.length - 1);
  });

  it('rejects malformed prediction findings at the file boundary', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugbot-benchmark-'));
    const path = join(directory, 'predictions.json');
    try {
      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { malformed: [{ title: 42 }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid Bugbot finding');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects malformed corpora, duplicate cases, and unsafe numeric findings', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'bugbot-benchmark-'));
    const path = join(directory, 'input.json');
    const validCase = {
      id: 'case-1',
      language: 'typescript',
      category: 'correctness',
      description: 'Detect the defect',
      file: 'src/example.ts',
      startLine: 1,
      diff: '+ defect',
      expected: [],
    };
    try {
      await writeFile(path, JSON.stringify({ schemaVersion: 2, cases: [] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('Invalid Bugbot benchmark corpus');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('between 1 and 200 cases');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [validCase, validCase] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('ids must be unique');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, cases: [{ ...validCase, startLine: 0 }] }));
      await expect(loadBugbotBenchmark(path)).rejects.toThrow('Invalid Bugbot benchmark case');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, predictions: [] }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid Bugbot benchmark predictions');

      await writeFile(path, JSON.stringify({ schemaVersion: 1, predictions: { case: 'invalid' } }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('predictions for case');

      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { case: [{ title: 'Finding', line: 0 }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid line');

      await writeFile(path, JSON.stringify({
        schemaVersion: 1,
        predictions: { case: [{ title: 'Finding', confidence: Number.NaN }] },
      }));
      await expect(loadBugbotPredictions(path)).rejects.toThrow('Invalid confidence');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});


it.each([
  ['test-indirect-binding-propagates', 1],
  ['test-parameterized-fallback-reaches-stub', 1],
  ['test-bound-callback-reaches-stub', 1],
  ['test-delegate-bypasses-stub', 0],
  ['test-empty-participants-skip-stub', 0],
  ['test-recovery-swallows-bound-failure', 1],
] as const)('executes the authored fixture oracle for %s without a model or real wait', async (id, calls) => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(item => item.id === id)!;
  const observation = observeCallPathFixture(item);
  expect(observation).toEqual({ passes: item.expected.length === 0, calls });
});


it('rejects executable-looking corpus text as inert data before selecting an oracle', () => {
  const payload = 'throw new Error("corpus execution must never occur");';
  expect(() => observeCallPathFixture({ id: 'test-indirect-binding-propagates', diff: payload }))
    .toThrow('Unknown or modified call-path fixture.');
});

it('rejects an unknown or prototype-like fixture identity without dynamic dispatch', () => {
  expect(() => observeCallPathFixture({ id: '__proto__', diff: '' }))
    .toThrow('Unknown or modified call-path fixture.');
});


it.each([
  ['action-declared-matcher-input', 'problem-matcher', true, false],
  ['action-renamed-input-current-version', 'enable-problem-matcher', true, false],
  ['action-input-contract-unavailable', undefined, undefined, undefined],
  ['action-undeclared-matcher-alias', 'problem-matcher', false, true],
  ['action-old-input-on-new-version', 'enable-problem-matcher', false, true],
  ['action-declared-input-wrong-value', 'problem-matcher', true, true],
] as const)('checks inert YAML and compiled contract semantics for %s', async (id, getter, declared, registers) => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === id)!;
  // Only parse YAML data; neither corpus text nor an external module is executed.
  const yaml = item.diff.split('\n').slice(0, 8).map(line => line.slice(1)).join('\n');
  const candidate = parse(yaml) as { runs: { steps: { uses: string; with: Record<string, unknown> }[] } };
  const step = candidate.runs.steps[0];
  const added = item.diff.split('\n').filter(line => line.startsWith('+'));
  expect(added).toHaveLength(1);
  if (!getter) {
    expect(step.uses).toBe('fixture-org/setup-tool@v7');
    expect(item.diff).toContain('No applicable manifest, runtime getter or execution observation is available.');
    expect(item.expected).toEqual([]);
    return;
  }
  expect(step.uses).toBe(getter === 'problem-matcher'
    ? 'dart-lang/setup-dart@6afc89df92d6eb3834022f73cd65adc8cdfcb92d'
    : 'fixture-org/setup-sdk@2222222222222222222222222222222222222222');
  const manifest = parse(`inputs:\n  sdk: { default: stable }\n  ${getter}: { default: 'true' }`) as { inputs: Record<string, { default: string }> };
  const key = Object.keys(step.with).find(name => name !== 'sdk')!;
  expect(Object.prototype.hasOwnProperty.call(manifest.inputs, key)).toBe(declared);
  const effective = String(step.with[getter] ?? manifest.inputs[getter].default);
  // Authored, statically compiled equivalent of the supplied getter condition.
  expect(effective !== 'false').toBe(registers);
  expect(item.expected.length).toBe(registers ? 1 : 0);
  if (registers) {
    expect(item.expected[0].line).toBe(item.startLine + 7);
    expect(added[0].slice(1).trim()).toBe(item.expected[0].codeSnippet);
  }
});


it('preserves the exact Kotlin witness and traces its rejecting empty-label guard without claiming Kotlin execution', async () => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === 'kt-email-unicode-empty-label-guard')!;
  const witness = 'user@\u200Bexample..com';
  expect(item.diff).toContain(witness);
  expect([...witness].map(value => value.codePointAt(0))).toContain(0x200B);
  expect(witness.split('@')[1].split('.')).toEqual(['\u200Bexample', '', 'com']);
  expect(item.diff).toContain('labels.all { it.isNotBlank() }');
  expect(item.diff).toContain('Owner119+tag@Audit.Invalid');
  expect(item.expected).toEqual([]);
});
it.each([
  ['ts-email-caller-empty-label-guard', false], ['ts-email-normalization-before-guard', false],
  ['ts-email-existential-label-defect', true], ['ts-email-ignored-validator-result', true],
  ['ts-email-normalization-after-guard', true],
] as const)('observes exact authored validation and persistence semantics for %s', async (id, accepted) => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === id)!;
  expect(item.diff).toContain('Owner119+tag@Audit.Invalid');
  const observation = observeValidationFixture(item);
  expect(observation.accepted).toBe(accepted);
  expect(observation.persisted).toHaveLength(accepted ? 1 : 0);
  expect(observation.supportedPositive).toBe(true);
  if (id === 'ts-email-caller-empty-label-guard') expect(observation.boundaryRejected).toBe(true);
  expect(item.expected.length).toBe(accepted ? 1 : 0);
  if (accepted) {
    expect(observation.persisted[0].split('@')[1].split('.')).toContain('');
    const expected = item.expected[0];
    expect(item.diff.split('\n')[expected.line! - item.startLine].slice(1).trim()).toBe(expected.codeSnippet);
  }
});
it('rejects modified corpus text before choosing a compiled validation oracle', () => {
  expect(() => observeValidationFixture({ id: 'ts-email-caller-empty-label-guard', diff: 'process.exit(1)' }))
    .toThrow('Unknown or modified validation fixture.');
});
it('rejects unknown/prototype-like validation identities without dynamic dispatch', () => {
  expect(() => observeValidationFixture({ id: '__proto__', diff: '' }))
    .toThrow('Unknown or modified validation fixture.');
});


it('revalidates all structural guards after normalization in the negative control', async () => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === 'ts-email-normalization-before-guard')!;
  for (const input of ['user@example\uFF20.com', 'user@example\u00A8.com']) {
    const observation = observeValidationFixture(item, input);
    expect(observation.accepted).toBe(false);
    expect(observation.persisted).toEqual([]);
    expect(observation.supportedPositive).toBe(true);
  }
});


it('rejects corpus/native source drift before executing a different function', async () => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === 'ts-email-ignored-validator-result')!;
  let calls = 0;
  function wrongFunction(_value: string, _save: (email: string) => void): boolean { calls++; return false; }
  expect(() => assertValidationFixtureSource(item.diff, wrongFunction))
    .toThrow('Authored validation source does not match the compiled function.');
  expect(calls).toBe(0);
});


it.each(['kt-wasm-missing-direct-identifier', 'kt-wasm-missing-callback-identifier'])(
  'anchors the missing binding to exact changed source in %s', async id => {
    const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
    const item = corpus.cases.find(candidate => candidate.id === id)!;
    const finding = item.expected[0];
    const line = item.diff.split('\n')[finding.line! - item.startLine];
    expect(line.startsWith('+')).toBe(true);
    expect(line.slice(1).trim()).toBe(finding.codeSnippet);
    expect(item.diff).toContain(`private fun ${finding.symbol}`);
  },
);


it.each([
  ['action-self-ref-bootstrap', '$/.github/actions/bootstrap', -1],
  ['action-workspace-ref-after-checkout', './.github/actions/bootstrap', 0],
  ['action-reference-contract-unavailable', '$/.github/actions/bootstrap', -1],
  ['action-self-ref-explicit-suffix', '$/.github/actions/bootstrap@v1', -1],
  ['action-workspace-ref-before-checkout', './.github/actions/bootstrap', 1],
  ['action-self-ref-unsupported-host', '$/.github/actions/bootstrap', -1],
] as const)('preserves inert workflow reference and checkout evidence for %s', async (id, reference, checkoutIndex) => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === id)!;
  const yaml = item.diff.split('\n').filter(line => line.startsWith('+')).map(line => line.slice(1)).join('\n');
  const workflow = parse(yaml) as { jobs: { build: { steps: { uses: string }[] } } };
  const steps = workflow.jobs.build.steps;
  expect(steps.findIndex(step => step.uses === 'actions/checkout@v5')).toBe(checkoutIndex);
  expect(steps.find(step => step.uses !== 'actions/checkout@v5')!.uses).toBe(reference);
  if (item.expected.length) {
    const finding = item.expected[0];
    const line = item.diff.split('\n')[finding.line! - item.startLine];
    expect(line.startsWith('+')).toBe(true);
    expect(line.slice(1).trim()).toBe(finding.codeSnippet);
  }
  if (id === 'action-self-ref-unsupported-host') expect(item.diff).toContain('GHES) 3.19');
  if (id === 'action-reference-contract-unavailable') expect(item.diff).toContain('Host implementation/version');
});

it('separates the authored remote-tag policy from a resolved job-log name', async () => {
  const corpus = await loadBugbotBenchmark(join(__dirname, '..', '..', '..', 'quality/bugbot/corpus.v1.json'));
  const item = corpus.cases.find(candidate => candidate.id === 'action-self-ref-version-policy')!;
  expect(item.diff).toContain('reference.startswith(("./", "$/.github/actions/"))');
  expect(item.diff).toContain('VERSION.fullmatch(reference.rsplit("@", 1)[-1])');
  const yaml = item.diff.split('\n').filter(line => line.startsWith(' // |')).map(line => line.slice(5)).join('\n');
  const workflow = parse(yaml) as { jobs: { build: { steps: { uses: string }[] } } };
  expect(workflow.jobs.build.steps[0].uses).toBe('$/.github/actions/bootstrap');
  expect(item.diff).toContain('Run fixture/repo/.github/actions/bootstrap@1111111111111111111111111111111111111111');
  expect(item.expected).toEqual([]);
});
