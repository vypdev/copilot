import { dump, load } from 'js-yaml';
import { hasRootLocalSetupAction, renderSetupWorkflowUpgrade } from '../setup_workflow_upgrade';
import { copilotCommentRunner, COPILOT_COMMENT_REMOTE_WORKFLOW, COPILOT_COMMENT_SELF_WORKFLOW } from '../../domain/copilot_comment_workflow';

const workflow = (runner: unknown, extra = '') => `name: Reviewed workflow\non: [pull_request]\njobs:\n  copilot:\n${dump({ 'runs-on': runner }).trimEnd().split('\n').map(line => `    ${line}`).join('\n')}\n${extra}    steps:\n      - run: echo reviewed\n`;
const selected = (content: string) => (load(content) as { jobs: { copilot: { 'runs-on': unknown } } }).jobs.copilot['runs-on'];
const comment = (route: unknown = 'ubuntu-latest') => dump({ on: { issue_comment: { types: ['created', 'edited'] } }, jobs: { copilot: {
  uses: COPILOT_COMMENT_REMOTE_WORKFLOW, with: { 'runs-on': JSON.stringify(route) }, secrets: { PAT: '${{ secrets.PAT }}' },
} } });

describe('comment workflow coordination upgrade', () => {
  it.each(['ubuntu-latest', ['self-hosted', 'codex', 'Linux'], { group: 'trusted', labels: ['self-hosted', 'Linux'] }])('migrates the reviewed native runner %j and stays idempotent', route => {
    const previous = workflow(route).replace('run: echo reviewed', 'uses: vypdev/copilot@v3');
    const result = renderSetupWorkflowUpgrade(comment(), previous);
    const parsed = load(result) as any;
    expect(copilotCommentRunner(parsed.jobs.copilot)).toEqual(route);
    expect(parsed.jobs.copilot.steps).toBeUndefined();
    expect(renderSetupWorkflowUpgrade(comment(), result)).toBe(result);
  });
  it('retains a previously upgraded group route', () => {
    expect(copilotCommentRunner((load(renderSetupWorkflowUpgrade(comment(), comment({ group: 'trusted', labels: ['self-hosted', 'Linux'] }))) as any).jobs.copilot))
      .toEqual({ group: 'trusted', labels: ['self-hosted', 'Linux'] });
  });
  it('uses an explicitly selected runner profile instead of the prior route', () => {
    const template = comment().replace('  copilot:', '  copilot-issues:');
    const result = renderSetupWorkflowUpgrade(template, undefined, { file: 'copilot_issue_comment.yml', runners: {
      mode: 'manual-self-hosted', profileId: '', group: 'trusted', labels: ['self-hosted', 'Linux'], validation: 'hosted',
    } });
    expect(copilotCommentRunner((load(result) as any).jobs['copilot-issues'])).toEqual({ group: 'trusted', labels: ['self-hosted', 'Linux'] });
  });
  it('preserves source-only self-repository coordination exactly', () => {
    const source = comment().replace(COPILOT_COMMENT_REMOTE_WORKFLOW, COPILOT_COMMENT_SELF_WORKFLOW);
    expect(hasRootLocalSetupAction(source)).toBe(true);
    expect(renderSetupWorkflowUpgrade(comment(), source)).toBe(source);
  });
  it.each(['actions/setup-node@v7', 'actions/setup-java@v5'])('blocks silently dropping custom bootstrap %s', uses => {
    expect(() => renderSetupWorkflowUpgrade(comment(), workflow('ubuntu-latest').replace('run: echo reviewed', `uses: ${uses}`))).toThrow('migration');
  });
  it('blocks custom shell steps during migration', () => {
    expect(() => renderSetupWorkflowUpgrade(comment(), workflow('ubuntu-latest'))).toThrow('migration');
  });
  it('blocks malformed reusable runner JSON', () => {
    expect(() => renderSetupWorkflowUpgrade(comment(), comment().replace('"ubuntu-latest"', 'invalid'))).toThrow('review');
  });
  it('blocks dynamic native runners instead of transplanting their missing matrix', () => {
    expect(() => renderSetupWorkflowUpgrade(comment(), workflow('${{ matrix.os }}').replace('run: echo reviewed', 'uses: vypdev/copilot@v3'))).toThrow('Dynamic');
  });
});

describe('setup retains reviewed target workflow runners', () => {
  it('retains source Action jobs, permissions and release customizations instead of consumer templates', () => {
    const existing = 'on: [pull_request]\njobs:\n  native:\n    runs-on: [self-hosted, codex]\n    permissions: {contents: write}\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm publish --access public\n';
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toBe(existing);
  });
  it('adds only installer/probe exclusions to a source Action push workflow and retains all parsed fields', () => {
    const existing = 'on:\n  push:\n    branches: ["**", "!master"]\njobs:\n  copilot-commits:\n    runs-on: [self-hosted, codex]\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n';
    const result = renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing);
    const expected = load(existing) as { on: { push: { branches: string[] } } };
    expected.on.push.branches.push('!setup/copilot/**', '!copilot-permission-test-*');
    expect(load(result)).toEqual(expected);
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), result)).toBe(result);
  });
  it.each(['branches: invalid', 'branches: [42]'])('blocks ambiguous source Action push filters %s', filters => {
    const existing = `on:\n  push:\n    ${filters}\njobs:\n  copilot-commits:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n`;
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toThrow('review');
  });
  it.each(['on: [push]', 'on: push', 'on: {push: null}'])('blocks implicit source Action push filters %s', events => {
    const existing = `${events}\njobs:\n  copilot-commits:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n`;
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toThrow('review');
  });
  it('adds only the probe exclusion to the source observer and keeps the upgrade idempotent', () => {
    const existing = 'on: {push: {branches: ["**"]}}\njobs:\n  branch-sync:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n';
    const result = renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing);
    const expected = load(existing) as { on: { push: { branches: string[] } } };
    expected.on.push.branches.push('!copilot-permission-test-*');
    expect(load(result)).toEqual(expected);
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), result)).toBe(result);
  });
  it('places the source Commit installer exclusion after all positive patterns', () => {
    const existing = 'on: {push: {branches: ["!setup/copilot/**", "**"]}}\njobs:\n  copilot-commits:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n';
    const result = load(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)) as { on: { push: { branches: string[] } } };
    expect(result.on.push.branches).toEqual(['**', '!setup/copilot/**', '!copilot-permission-test-*']);
  });
  it.each(['copilot-commits', 'branch-sync'])('moves a shadowed probe exclusion behind positive patterns for source %s', job => {
    const existing = `on: {push: {branches: ["!copilot-permission-test-*", "**", "!custom/**"]}}\njobs:\n  ${job}:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n`;
    const result = load(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)) as { on: { push: { branches: string[] } } };
    expect(result.on.push.branches).toEqual(['**', '!custom/**', ...(job === 'copilot-commits' ? ['!setup/copilot/**'] : []), '!copilot-permission-test-*']);
  });
  it('retains unrelated root-local push workflows exactly', () => {
    const existing = 'on: {push: {branches: ["**"]}}\njobs:\n  native:\n    steps:\n      - uses: ./\n        with: {single-action: check_branch_sync_action}\n';
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toBe(existing);
  });
  it.each(['# missing source document', 'on: {push: {branches: ["**"]}}'])('blocks incomplete source inventory %s', existing => {
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing, { file: 'copilot_branch_sync.yml', source: true }))
      .toThrow('review the workflow separately');
  });
  it.each([
    ['jobs: {native: {steps: [{uses: "./", with: {single-action: check_branch_sync_action}}]}}', true],
    ['jobs: {native: {steps: [{uses: "./sub-action"}]}}', false],
    ['# uses: ./\njobs: {native: {steps: null}}', false],
    ['# no workflow', false],
  ])('classifies source Actions from parsed steps: %s', (content, expected) => {
    expect(hasRootLocalSetupAction(String(content))).toBe(expected);
  });
  it('does not treat a non-root local step as the source Action', () => {
    const existing = workflow('self-hosted').replace('run: echo reviewed', 'uses: ./.github/actions/check');
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).not.toContain('uses: ./.github/actions/check');
  });
  it.each(['self-hosted', ['self-hosted', 'codex', 'Linux'], { group: 'vypdev', labels: ['self-hosted', 'codex'] }, { labels: 'codex' }, { group: 'vypdev' }])('retains %j while updating template steps', value => {
    const result = renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), workflow(value).replace('echo reviewed', 'echo old'));
    expect(selected(result)).toEqual(value);
    expect(result).toContain('echo reviewed'); expect(result).not.toContain('echo old');
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), result)).toBe(result);
  });
  it.each([undefined, '', '# no installed jobs\n'])('keeps defaults when no matching installed runner exists: %j', existing => {
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toBe(workflow('ubuntu-latest'));
  });
  it('keeps each matching job isolated and leaves new jobs at their template default', () => {
    const template = workflow('ubuntu-latest') + '  fresh:\n    runs-on: windows-latest\n    steps: []\n';
    const result = renderSetupWorkflowUpgrade(template, workflow(['self-hosted', 'codex']) + '  removed:\n    runs-on: macos-latest\n');
    expect(selected(result)).toEqual(['self-hosted', 'codex']);
    expect(result).toContain('runs-on: windows-latest'); expect(result).not.toContain('removed:');
  });
  it('replaces a complete multiline template runner without leaving old labels or swallowing other fields', () => {
    const template = workflow(['ubuntu-latest', 'template-label'], '\n    timeout-minutes: 5\n');
    const result = renderSetupWorkflowUpgrade(template, workflow(['self-hosted', 'codex']));
    expect(selected(result)).toEqual(['self-hosted', 'codex']);
    expect(result).not.toContain('template-label'); expect(result).toContain('timeout-minutes: 5');
  });
  it('retains an unchanged dynamic template contract without transplanting it', () => {
    const template = workflow('${{ matrix.os }}', '    strategy:\n      matrix:\n        os: [ubuntu-latest]\n');
    expect(renderSetupWorkflowUpgrade(template, template)).toBe(template);
  });
  it.each([42, [], {}, { group: [] }, { group: '' }, { labels: [''] }, { unexpected: 'codex' }, '${{ matrix.os }}'])('blocks unsupported or dependent runner selection %j', runner => {
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), workflow(runner))).toThrow('review');
  });
  it.each(['jobs: [invalid]\n', 'jobs: null\n', 'jobs: false\n', 'jobs: {broken\n', 'jobs: {}\n---\njobs: {}\n', 'jobs:\n  copilot:\n    runs-on: codex\n    runs-on: other\n'])('blocks unreadable job inventory without copying diagnostic content', existing => {
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toThrow('review');
  });
  it('blocks changed dynamic workflows even when the runner expression is unchanged', () => {
    const template = workflow('${{ matrix.os }}');
    expect(() => renderSetupWorkflowUpgrade(template, template.replace('echo reviewed', 'echo old'))).toThrow('review');
  });
  it('blocks malformed template structure rather than claiming runner preservation', () => {
    expect(() => renderSetupWorkflowUpgrade('jobs: []\n', workflow('self-hosted'))).toThrow('review');
  });
  it('blocks an unexpected template layout rather than silently retaining the default runner', () => {
    const template = 'jobs: {copilot: {runs-on: ubuntu-latest}}\n';
    expect(() => renderSetupWorkflowUpgrade(template, workflow('self-hosted'))).toThrow('verified');
  });
});

describe('source detection requires Copilot-specific invocation evidence', () => {
  test.each([
    [{ uses: './' }, false],
    [{ uses: './', with: { token: 'fixture', 'single-action': 'unrelated' } }, false],
    [{ uses: './', with: { 'single-action': ['check_branch_sync_action'] } }, false],
    [{ uses: './', with: { 'issue-workflow-profile': '{}', 'agent-provider': 'codex' } }, true],
    [{ uses: './', with: { 'pr-approval-observer': true, 'pr-approval-policy': '{}' } }, true],
    [{ uses: './', with: { 'pr-approval-observer': 'true', 'pr-approval-policy': '{}' } }, true],
    [{ uses: './', with: { 'pr-approval-observer': true } }, false],
    [{ uses: './', with: { 'issue-workflow-profile': '{}' } }, false],
  ])('classifies the explicit root invocation %j', (step, expected) => {
    expect(hasRootLocalSetupAction(dump({ jobs: { fixture: { steps: [step] } } }))).toBe(expected);
  });
});
