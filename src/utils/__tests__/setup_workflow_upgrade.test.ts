import { dump, load } from 'js-yaml';
import { renderSetupWorkflowUpgrade } from '../setup_workflow_upgrade';

const workflow = (runner: unknown, extra = '') => `name: Reviewed workflow\non: [pull_request]\njobs:\n  copilot:\n${dump({ 'runs-on': runner }).trimEnd().split('\n').map(line => `    ${line}`).join('\n')}\n${extra}    steps:\n      - run: echo reviewed\n`;
const selected = (content: string) => (load(content) as { jobs: { copilot: { 'runs-on': unknown } } }).jobs.copilot['runs-on'];

describe('setup retains reviewed target workflow runners', () => {
  it('retains source Action jobs, permissions and release customizations instead of consumer templates', () => {
    const existing = 'on: [pull_request]\njobs:\n  native:\n    runs-on: [self-hosted, codex]\n    permissions: {contents: write}\n    steps:\n      - uses: ./\n  publish:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm publish --access public\n';
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toBe(existing);
  });
  it('adds only the installer exclusion to a source Action push workflow and retains all parsed fields', () => {
    const existing = 'on:\n  push:\n    branches: ["**", "!master"]\njobs:\n  native:\n    runs-on: [self-hosted, codex]\n    steps:\n      - uses: ./\n';
    const result = renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing);
    const expected = load(existing) as { on: { push: { branches: string[] } } };
    expected.on.push.branches.push('!setup/copilot/**');
    expect(load(result)).toEqual(expected);
    expect(renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), result)).toBe(result);
  });
  it.each(['branches: invalid', 'branches: [42]'])('blocks ambiguous source Action push filters %s', filters => {
    const existing = `on:\n  push:\n    ${filters}\njobs:\n  native:\n    steps:\n      - uses: ./\n`;
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toThrow('review');
  });
  it.each(['on: [push]', 'on: push', 'on: {push: null}'])('blocks implicit source Action push filters %s', events => {
    const existing = `${events}\njobs:\n  native:\n    steps:\n      - uses: ./\n`;
    expect(() => renderSetupWorkflowUpgrade(workflow('ubuntu-latest'), existing)).toThrow('review');
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
