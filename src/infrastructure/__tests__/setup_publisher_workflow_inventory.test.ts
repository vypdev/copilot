import { SETUP_PUBLISHER_WORKFLOW_PATH } from '../../domain/setup_publisher_installation';
import { inspectSetupPublisherWorkflows } from '../setup_publisher_workflow_inventory';

const expected = 'name: Publisher\non: workflow_dispatch\njobs:\n  publish:\n    steps:\n      - uses: vypdev/copilot@full-sha\n        env:\n          COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: write-v1\n';
const workflow = (content: string, path = '.github/workflows/ci.yml', mode = '100644') => ({ path, mode, content });
const ci = 'name: CI\non: push\njobs:\n  ci:\n    steps: []\n';
it('proves absence only from a complete ordinary workflow inventory', () => {
  expect(inspectSetupPublisherWorkflows([], expected)).toEqual({ kind: 'absent', paths: [] });
  expect(inspectSetupPublisherWorkflows([workflow(ci)], expected)).toEqual({ kind: 'absent', paths: [] });
});
it('an ordinary environment mapping does not grant publisher authority or cause a false unknown', () => {
  const content = 'env:\n  NODE_ENV: test\n' + ci;
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected)).toEqual({ kind: 'absent', paths: [] });
});
it.each(['main', 'a'.repeat(40)])('publisher977-C20: an uninspected remote reusable workflow at %s cannot establish absence', revision => {
  const content = `on: push\njobs:\n  ci:\n    uses: other/repo/.github/workflows/wrapper.yml@${revision}\n`;
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected)).toEqual({ kind: 'unknown', paths: ['.github/workflows/ci.yml'] });
  expect(inspectSetupPublisherWorkflows([workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH), workflow(content)], expected).kind).toBe('unknown');
});
it('distinguishes exact canonical bytes from modified, executable and case-aliased publishers', () => {
  expect(inspectSetupPublisherWorkflows([workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH)], expected)).toEqual({ kind: 'exact', paths: [SETUP_PUBLISHER_WORKFLOW_PATH] });
  for (const file of [workflow(expected + '\n', SETUP_PUBLISHER_WORKFLOW_PATH), workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH, '100755'),
    workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH.toUpperCase())]) expect(inspectSetupPublisherWorkflows([file], expected).kind).toBe('foreign');
});
it('finds a semantically equivalent renamed publisher rather than matching a display name', () => {
  const result = inspectSetupPublisherWorkflows([workflow(expected, '.github/workflows/renamed.yaml')], expected);
  expect(result).toEqual({ kind: 'foreign', paths: ['.github/workflows/renamed.yaml'] });
});
it.each([
  ['unknown', 'name: CI\n# COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: write-v1\non: push\njobs:\n  test:\n    steps:\n      - uses: actions/checkout@v5\n'],
  ['unknown', 'name: Copilot - Bugbot Status Card\non: push\njobs:\n  test:\n    steps:\n      - run: echo harmless\n'],
  ['unknown', 'on: push\njobs:\n  test:\n    steps:\n      - uses: vypdev/copilot@sha\n        with:\n          single-action: another_action\n'],
  ['unknown', 'on: push\njobs:\n  test:\n    steps:\n      - uses: vypdev/copilot@sha\n        with:\n          token: ${{ secrets.PAT }}\n'],
  ['unknown', 'on: push\njobs:\n  test:\n    steps: &ordinary\n      - run: echo harmless\n  other:\n    steps: *ordinary\n'],
])('does not treat comments, titles, ordinary Copilot steps or acyclic aliases as publisher authority', (kind, content) => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe(kind);
});
it.each([
  'defaults:\n  run:\n    shell: bash\n' + ci,
  'on:\n  workflow_dispatch:\n    inputs:\n      env:\n        type: string\n      run:\n        type: string\njobs:\n  ci:\n    steps: []\n',
  'on: push\njobs:\n  ci:\n    strategy:\n      matrix:\n        env: [one, two]\n        uses: [compiler-a, compiler-b]\n        run: [unit, integration]\n    steps: []\n',
])('interprets execution fields in their actual workflow scope, including observed defaults.run mappings', content => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe('absent');
});
it.each([
  'on: push\nenv:\n  COPILOT_BUGBOT_STATUS_CARD_WORKFLOW: unsupported-future-value\njobs:\n  ci:\n    steps: []\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: other/action@v1\n        with:\n          single-action: publish_bugbot_status_card_action\n',
  'on: push\njobs:\n  ci:\n    uses: other/repo/.github/workflows/copilot_bugbot_status_card.yaml@main\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - run: COPILOT_BUGBOT_STATUS_CARD_WORKFLOW=write-v1 node action.js\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - run: invoke publish_bugbot_status_card_action\n',
])('blocks explicit publisher markers at any execution scope and direct shell invocations', content => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe('foreign');
});
it.each(['', '[]', 'jobs: null', 'jobs: {}', 'jobs: {invalid: null}', 'jobs: {invalid: {}}', 'jobs: [one]', 'jobs: [',
  'jobs: {one: {steps: []}}\njobs: {}', 'jobs: {one: {steps: []}}\ncustom: !unsupported hello', ci + '\0', 'x'.repeat(100_001),
  'jobs: {one: {steps: []}}\ncycle: &cycle {again: *cycle}',
  'jobs: {one: {steps: []}}\nx: ' + '['.repeat(65) + '0' + ']'.repeat(65),
  'jobs: {one: {steps: []}}\nx: [' + Array(10_001).fill('0').join(',') + ']'])('keeps malformed, duplicate-key, cyclic or unbounded documents unknown', content => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe('unknown');
});
it.each([
  ['local composite', 'on: push\njobs:\n  ci:\n    steps:\n      - uses: ./.github/actions/status-publisher\n'],
  ['local root action', 'on: push\njobs:\n  ci:\n    steps:\n      - uses: ./\n        with:\n          single-action: another_action\n'],
  ['local reusable workflow', 'on: push\njobs:\n  ci:\n    uses: ./.github/workflows/ci.yml\n'],
])('keeps unresolved %s inventory unknown', (_kind, content) => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe('unknown');
});
it.each([
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: ${{ matrix.action }}\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: 7\n',
  'on: push\nenv: ${{ inputs.environment }}\njobs:\n  ci:\n    steps: []\n',
  'on: push\njobs:\n  ci:\n    steps: [null]\n',
  'on: push\njobs:\n  ci:\n    uses: ./.github/workflows/ci.yml\n    steps: wrong\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - run: 42\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: vypdev/copilot@sha\n        with:\n          single-action: ${{ inputs.action }}\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: vypdev/copilot@sha\n        with:\n          single-action: false\n',
  'on: push\njobs:\n  ci:\n    steps:\n      - uses: vypdev/copilot@sha\n        with: false\n',
])('does not infer absence from dynamic or unsupported execution facts', content => {
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected).kind).toBe('unknown');
});
it('retains exact and conflicting paths, deterministic ordering and uncertainty priority', () => {
  const exact = workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH);
  expect(inspectSetupPublisherWorkflows([exact, workflow('invalid')], expected)).toEqual({ kind: 'unknown', paths: [SETUP_PUBLISHER_WORKFLOW_PATH, '.github/workflows/ci.yml'].sort() });
  const result = inspectSetupPublisherWorkflows([workflow('invalid'), exact, workflow(expected, '.github/workflows/renamed.yml')], expected);
  expect(result).toEqual({ kind: 'foreign', paths: [SETUP_PUBLISHER_WORKFLOW_PATH, '.github/workflows/renamed.yml'].sort() });
  expect(Object.isFrozen(result.paths)).toBe(true);
});

it.each(['other/action@v1', 'other/action@' + 'a'.repeat(40), 'docker://example/publisher:1'])(
  'publisher977-C97: uninspected remote step %s cannot prove publisher absence', uses => {
    const content = `on: push\njobs:\n  ci:\n    steps:\n      - uses: ${uses}\n`;
    expect(inspectSetupPublisherWorkflows([workflow(content)], expected)).toEqual({ kind: 'unknown', paths: ['.github/workflows/ci.yml'] });
    expect(inspectSetupPublisherWorkflows([workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH), workflow(content)], expected).kind).toBe('unknown');
  });
it.each(['workflow', 'job', 'step', 'run'])(
  'publisher977-C98: Windows case-insensitive marker at %s blocks a renamed publisher', scope => {
    const marker = 'copilot_bugbot_status_card_workflow';
    const content = scope === 'workflow' ? `on: push\nenv:\n  ${marker}: write-v1\njobs:\n  ci:\n    runs-on: windows-latest\n    steps: []\n`
      : scope === 'job' ? `on: push\njobs:\n  ci:\n    runs-on: windows-latest\n    env:\n      ${marker}: write-v1\n    steps: []\n`
        : `on: push\njobs:\n  ci:\n    runs-on: windows-latest\n    steps:\n      - ${scope === 'step' ? `uses: vypdev/copilot@${'a'.repeat(40)}\n        env:\n          ${marker}: write-v1` : `run: $env:${marker}='write-v1'; node action.js`}\n`;
    expect(inspectSetupPublisherWorkflows([workflow(content)], expected)).toEqual({ kind: 'foreign', paths: ['.github/workflows/ci.yml'] });
  });

it.each([
  'curl --request POST https://api.github.com/repos/owner/project/actions/workflows/renamed.yml/dispatches',
  'node scripts/dispatch-status.js',
  'node -e "const name = [\'publish_bugbot\', \'status_card_action\'].join(\'_\'); require(\'./action\')[name]()"',
  '${{ inputs.script }}',
])('publisher977-C101: opaque run cannot establish absence: %s', run => {
  const content = 'on: push\njobs:\n  ci:\n    steps:\n      - run: ' + JSON.stringify(run) + '\n';
  expect(inspectSetupPublisherWorkflows([workflow(content)], expected)).toEqual({ kind: 'unknown', paths: ['.github/workflows/ci.yml'] });
  expect(inspectSetupPublisherWorkflows([workflow(expected, SETUP_PUBLISHER_WORKFLOW_PATH), workflow(content)], expected).kind).toBe('unknown');
});
