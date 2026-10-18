import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { load } from 'js-yaml';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { selectSetupRunnerMode } from '../../application/policies/setup_runner_policy';
import { renderSetupWorkflowUpgrade } from '../setup_workflow_upgrade';
import { inspectSetupInstallation, compatibleSetupRunnerSnapshot, renderSetupRunnerSnapshot, SETUP_RUNNER_SNAPSHOT } from '../setup_installation_review';
import { compareSetupWorkflows, copySetupFiles, ensureGitHubDirs } from '../setup_files';
import { redactSensitiveText } from '../../domain/security/sensitive_text';
import { SetupBatchWorkspaceAdapter } from '../../infrastructure/setup_batch_workspace_adapter';

const packageRoot = resolve(__dirname, '../../..');
const configuration = () => ({ ...createDefaultSetupConfiguration(), runners: {
  ...selectSetupRunnerMode('manual-self-hosted'), group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'],
} });
const workflow = (jobs: string) => `name: fixture\non: workflow_dispatch\njobs:\n${jobs}`;
const single = (runner: string) => workflow(`  copilot-issues:\n    runs-on: ${runner}\n    steps:\n      - run: echo fixture\n`);
const parsed = (value: string) => load(value) as { jobs: Record<string, { 'runs-on': unknown; steps: unknown[] }> };

describe('explicit routing preserves job contracts', () => {
  test('new consumer agent jobs use the selected group and labels', () => {
    const rendered = renderSetupWorkflowUpgrade(single('ubuntu-latest'), undefined, { file: 'copilot_issue.yml', runners: configuration().runners });
    expect(parsed(rendered).jobs['copilot-issues']['runs-on']).toEqual({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] });
    expect(parsed(rendered).jobs['copilot-issues'].steps).toEqual([{ run: 'echo fixture' }]);
  });
  test('explicit replacement wins over old static routing', () => {
    const result = renderSetupWorkflowUpgrade(single('ubuntu-latest'), single('[self-hosted, old, Linux]'), { file: 'copilot_issue.yml', runners: configuration().runners });
    expect(parsed(result).jobs['copilot-issues']['runs-on']).toEqual({ group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'] });
  });
  test('retention keeps the installed route', () => {
    const result = renderSetupWorkflowUpgrade(single('ubuntu-latest'), single('[self-hosted, old, Linux]'), { file: 'copilot_issue.yml' });
    expect(parsed(result).jobs['copilot-issues']['runs-on']).toEqual(['self-hosted', 'old', 'Linux']);
  });
  test('hosted replacement is explicit', () => {
    const result = renderSetupWorkflowUpgrade(single('ubuntu-latest'), single('[self-hosted, old, Linux]'), { file: 'copilot_issue.yml', runners: selectSetupRunnerMode('hosted') });
    expect(parsed(result).jobs['copilot-issues']['runs-on']).toBe('ubuntu-latest');
  });
  test.each(['copilot_pull_request_approval.yml', 'copilot_pull_request_merge_queue.yml', 'release_workflow.yml'])('protects template-specific isolation in %s', file => {
    const template = readFileSync(join(packageRoot, 'setup/workflows', file), 'utf8');
    const rendered = renderSetupWorkflowUpgrade(template, undefined, { file, runners: { ...configuration().runners, validation: 'agent' } });
    const jobs = parsed(rendered).jobs;
    const key = file === 'release_workflow.yml' ? 'publish' : Object.keys(jobs)[0];
    expect(jobs[key]['runs-on']).toBe('ubuntu-latest');
  });
  test('unknown jobs are never selected by a global replacement', () => {
    const template = workflow('  custom:\n    runs-on: ubuntu-latest\n');
    expect(renderSetupWorkflowUpgrade(template, undefined, { file: 'custom.yml', runners: configuration().runners })).toBe(template);
  });
  test('source root-local jobs retain complete content', () => {
    const source = single('[self-hosted, native, Linux]').replace('run: echo fixture', 'uses: ./\n        with: {single-action: check_branch_sync_action}');
    expect(renderSetupWorkflowUpgrade(single('ubuntu-latest'), source, { file: 'copilot_issue.yml', runners: selectSetupRunnerMode('hosted') })).toBe(source);
  });
  test('invalid selection fails before rendering YAML', () => expect(() => renderSetupWorkflowUpgrade(single('ubuntu-latest'), undefined,
    { file: 'copilot_issue.yml', runners: { ...configuration().runners, labels: ['${{ secrets.PAT }}'] } })).toThrow('Runner configuration'));
});

describe('installation parity and reviewed migration', () => {
  let root: string;
  const write = (path: string, content: string) => { const absolute = join(root, path); mkdirSync(dirname(absolute), { recursive: true }); writeFileSync(absolute, content); };
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-runner-parity-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  test('an unrelated root action does not suppress consumer workflow upgrades', () => {
    const config = configuration();
    write('.github/workflows/build.yml', 'jobs: {build: {runs-on: ubuntu-latest, steps: [{uses: "./"}]}}\n');
    write('.github/workflows/copilot_issue.yml', single('[self-hosted, old, Linux]'));
    const review = inspectSetupInstallation(root, config);
    expect(review.assets.find(asset => asset.path === '.github/workflows/copilot_issue.yml')?.status).toBe('customized');
    expect(review.jobs.find(job => job.file === 'copilot_issue.yml')?.runsOn).toEqual({ group: 'vypdev', labels: config.runners.labels });
    expect(compareSetupWorkflows(root, config.features, undefined, config).find(workflow => workflow.file === 'copilot_issue.yml')?.status).toBe('changed');
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config, updateExistingWorkflows: true, approvedWorkflowFiles: ['copilot_issue.yml'] });
    expect(parsed(readFileSync(join(root, '.github/workflows/copilot_issue.yml'), 'utf8')).jobs['copilot-issues']['runs-on']).toEqual({ group: 'vypdev', labels: config.runners.labels });
    expect(readFileSync(join(root, '.github/workflows/build.yml'), 'utf8')).toContain('uses: "./"');
  });
  test('clean preview includes every optional asset and separates roles', () => {
    const config = configuration(); config.pullRequestApproval = { ...config.pullRequestApproval, mode: 'recommend' };
    const review = inspectSetupInstallation(root, config);
    expect(review.blockers).toEqual([]);
    expect(review.assets.filter(asset => asset.path.startsWith('.github/workflows/'))).toHaveLength(15);
    expect(review.jobs.find(job => job.role === 'agent')?.runsOn).toEqual({ group: 'vypdev', labels: config.runners.labels });
    expect(review.jobs.find(job => job.role === 'observer')?.runsOn).toBe('ubuntu-latest');
    expect(review.jobs.find(job => job.role === 'publication')?.runsOn).toBe('ubuntu-latest');
    expect(review.changes.find(change => change.path === SETUP_RUNNER_SNAPSHOT)?.before).toBeNull();
  });
  test('disabled missing helpers remain visible', () => {
    const config = configuration(); config.features.agentProvisioning = false; config.features.credentialHealth = false;
    const review = inspectSetupInstallation(root, config);
    expect(review.assets.find(asset => asset.path.endsWith('agent-cli-provisioning.yml'))).toMatchObject({ status: 'missing', enabled: false });
    expect(review.jobs.some(job => job.file === 'copilot_credential_health.yml')).toBe(false);
  });
  test('agent provisioning follows the agent; ordinary checks have an explicit independent override', () => {
    const config = configuration(); config.runners.validation = 'agent';
    const review = inspectSetupInstallation(root, config);
    expect(review.jobs.find(job => job.file === 'agent-cli-provisioning.yml')?.runsOn).toEqual({ group: 'vypdev', labels: config.runners.labels });
    expect(review.jobs.find(job => job.file === 'copilot_credential_health.yml')?.runsOn).toEqual({ group: 'vypdev', labels: config.runners.labels });
    expect(review.jobs.find(job => job.role === 'isolated')?.runsOn).toBe('ubuntu-latest');
  });
  test('preview and copy use identical routing and repeat idempotently', () => {
    const config = configuration(); const before = inspectSetupInstallation(root, config);
    ensureGitHubDirs(root);
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config });
    for (const change of before.changes) expect(redactSensitiveText(readFileSync(join(root, change.path), 'utf8'))).toBe(change.after);
    expect(inspectSetupInstallation(root, config).changes).toEqual([]);
    expect(compareSetupWorkflows(root, config.features, undefined, config).every(file => file.status === 'unchanged')).toBe(true);
    const snapshot = readFileSync(join(root, SETUP_RUNNER_SNAPSHOT), 'utf8');
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config });
    expect(readFileSync(join(root, SETUP_RUNNER_SNAPSHOT), 'utf8')).toBe(snapshot);
  });
  test('compatible existing routing is backed up before explicit replacement', () => {
    write('.github/workflows/copilot_issue.yml', single('[self-hosted, old, Linux]'));
    const config = configuration(); const review = inspectSetupInstallation(root, config);
    expect(review.assets.find(asset => asset.path.endsWith('copilot_issue.yml'))?.status).toBe('customized');
    expect(review.changes.find(change => change.path.endsWith('copilot_issue.yml'))?.before).toContain('old');
    copySetupFiles(root, undefined, config.features, { setupConfiguration: config, updateExistingWorkflows: true, approvedWorkflowFiles: ['copilot_issue.yml'] });
    expect(readFileSync(join(root, '.github/workflows/copilot_issue.yml'), 'utf8')).toContain('vypdev');
    expect(existsSync(join(root, '.copilot/setup-backups'))).toBe(true);
  });
  test('source inventory preserves native workflows and generator-owned guidance', () => {
    write('.github/workflows/copilot_issue.yml', single('[self-hosted, native, Linux]').replace('run: echo fixture', 'uses: ./\n        with: {single-action: check_branch_sync_action}'));
    write('.github/workflows/native-ci.yml', workflow('  own-ci:\n    runs-on: ${{ matrix.os }}\n    steps:\n      - run: echo native\n'));
    for (const path of ['.copilot/AGENT_GUIDE.md', '.copilot/repository-profile.json', '.copilot/setup-manifest.json', '.agents/skills/copilot-repository-workflow/SKILL.md']) write(path, readFileSync(join(packageRoot, path), 'utf8'));
    const review = inspectSetupInstallation(root, configuration());
    expect(review.blockers).toEqual([]);
    expect(review.assets.find(asset => asset.path.endsWith('native-ci.yml'))?.status).toBe('source-only');
    expect(review.jobs.find(job => job.job === 'own-ci')).toMatchObject({ retained: true, runsOn: '${{ matrix.os }}' });
    const guide = readFileSync(join(root, '.copilot/AGENT_GUIDE.md'), 'utf8');
    copySetupFiles(root, undefined, configuration().features, { setupConfiguration: configuration() });
    expect(readFileSync(join(root, '.copilot/AGENT_GUIDE.md'), 'utf8')).toBe(guide);
    expect(readFileSync(join(root, '.github/workflows/native-ci.yml'), 'utf8')).toContain('echo native');
  });
  test('partial source guidance blocks before any copy', () => {
    write('.github/workflows/copilot_issue.yml', single('[self-hosted, Linux]').replace('run: echo fixture', 'uses: ./\n        with: {single-action: check_branch_sync_action}'));
    write('.copilot/AGENT_GUIDE.md', 'source guide');
    expect(inspectSetupInstallation(root, configuration()).blockers).toContain('Source guidance is incomplete. Restore it with the checked-in source generator before setup.');
    expect(() => copySetupFiles(root, undefined, configuration().features, { setupConfiguration: configuration() })).toThrow('Source guidance is incomplete');
    expect(existsSync(join(root, SETUP_RUNNER_SNAPSHOT))).toBe(false);
  });
  test('parity does not read collaborator Markdown as runtime instructions', () => {
    write('.copilot/AGENT_GUIDE.md', 'collaborator-only instructions');
    write('.agents/skills/copilot-repository-workflow/SKILL.md', 'collaborator-only skill');
    const fsApi = require('node:fs') as typeof import('node:fs');
    const original = fsApi.readFileSync;
    const spy = jest.spyOn(fsApi, 'readFileSync').mockImplementation(((...args: Parameters<typeof original>) => {
      if (String(args[0]).endsWith('AGENT_GUIDE.md') || String(args[0]).endsWith('copilot-repository-workflow/SKILL.md')) throw new Error('Collaborator Markdown must not be read.');
      return original(...args);
    }) as typeof original);
    try {
      const review = inspectSetupInstallation(root, configuration());
      expect(review.assets.find(asset => asset.path === '.copilot/AGENT_GUIDE.md')?.status).toBe('shared');
      expect(JSON.stringify(review)).not.toContain('collaborator-only');
    } finally { spy.mockRestore(); }
  });
  test.each(['{"schemaVersion":99}', '{'])('unknown generator metadata remains incompatible: %s', content => {
    write('.copilot/repository-profile.json', content);
    const review = inspectSetupInstallation(root, configuration());
    expect(review.assets.find(asset => asset.path === '.copilot/repository-profile.json')?.status).toBe('incompatible');
    expect(review.blockers.length).toBeGreaterThan(0);
    expect(() => copySetupFiles(root, undefined, configuration().features, { setupConfiguration: configuration() })).toThrow('unsupported generator');
    expect(existsSync(join(root, '.github'))).toBe(false);
  });
  test.each([['.copilot/repository-profile.json', 1], ['.copilot/setup-manifest.json', 2]] as const)('distinguishes profile and manifest generator contracts for %s', (path, contractVersion) => {
    write(path, JSON.stringify({ schemaVersion: 2, generator: { name: '@vypdev/copilot', contractVersion } }));
    const review = inspectSetupInstallation(root, configuration());
    expect(review.assets.find(asset => asset.path === path)?.status).toBe('incompatible'); expect(review.blockers).not.toEqual([]);
  });
  test('unknown routing snapshot cannot be overwritten', () => {
    write(SETUP_RUNNER_SNAPSHOT, '{"schemaVersion":99}');
    expect(inspectSetupInstallation(root, configuration()).blockers).toHaveLength(1);
    expect(() => copySetupFiles(root, undefined, configuration().features, { setupConfiguration: configuration() })).toThrow('Runner snapshot');
    expect(readFileSync(join(root, SETUP_RUNNER_SNAPSHOT), 'utf8')).toBe('{"schemaVersion":99}');
  });
  test('retain mode preserves an unknown snapshot without claiming compatibility', () => {
    write(SETUP_RUNNER_SNAPSHOT, '{"schemaVersion":99}');
    const review = inspectSetupInstallation(root, createDefaultSetupConfiguration());
    expect(review.blockers).toEqual([]); expect(review.assets.find(asset => asset.path === SETUP_RUNNER_SNAPSHOT)?.status).toBe('incompatible');
  });
  test('batch rendering returns the same profile snapshot as the preview', async () => {
    const adapter = new SetupBatchWorkspaceAdapter(); const config = configuration();
    const review = await adapter.review(config, []); const files = await adapter.render(config, []);
    for (const change of review.changes) expect(redactSensitiveText(files.find(file => file.path === change.path)!.content!)).toBe(change.after);
    expect(await adapter.render(config, files.filter(file => file.content !== null))).toEqual([]);
  });
  test('snapshot absence is a backward-compatible retain choice', () => {
    expect(renderSetupRunnerSnapshot(createDefaultSetupConfiguration())).toBeUndefined();
    expect(renderSetupRunnerSnapshot({ ...createDefaultSetupConfiguration(), runners: undefined })).toBeUndefined();
    expect(compatibleSetupRunnerSnapshot(renderSetupRunnerSnapshot(configuration())!)).toBe(true);
    expect(compatibleSetupRunnerSnapshot('null')).toBe(false);
    expect(compatibleSetupRunnerSnapshot('{')).toBe(false);
    expect(() => renderSetupRunnerSnapshot({ ...configuration(), runners: { ...configuration().runners, labels: [] } })).toThrow('Runner configuration');
  });
  test('shared snapshot stores only the chosen route and registry digest', () => {
    const selected = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const };
    const value = JSON.stringify({ schemaVersion: 1, profiles: [selected, { ...selected, id: 'private-other', group: 'unselected-infrastructure' }] });
    const content = renderSetupRunnerSnapshot({ ...configuration(), runners: { mode: 'organization-profile', profileId: selected.id,
      group: selected.group, labels: selected.labels, validation: selected.validation, source: { scope: 'organization', value } } })!;
    expect(content).not.toContain('unselected-infrastructure'); expect(content).not.toContain('private-other'); expect(content).not.toContain('"value"');
    const snapshot = JSON.parse(content);
    expect(snapshot.source).toEqual({ scope: 'organization', registryDigest: expect.stringMatching(/^[a-f0-9]{64}$/u) });
    expect(compatibleSetupRunnerSnapshot(content)).toBe(true);
    for (const source of [undefined, {}, { scope: 'unknown', registryDigest: 'a'.repeat(64) }, { scope: 'organization', registryDigest: 3 }, { scope: 'organization', registryDigest: 'invalid' }]) {
      expect(compatibleSetupRunnerSnapshot(JSON.stringify({ ...snapshot, source }))).toBe(false);
    }
    expect(compatibleSetupRunnerSnapshot(JSON.stringify({ ...snapshot, unknown: true }))).toBe(false);
    expect(compatibleSetupRunnerSnapshot(JSON.stringify({ ...snapshot, runners: { ...snapshot.runners, source: { value } } }))).toBe(false);
    expect(compatibleSetupRunnerSnapshot(JSON.stringify({ ...snapshot, runners: {} }))).toBe(false);
    expect(compatibleSetupRunnerSnapshot(JSON.stringify({ schemaVersion: 1 }))).toBe(false);
    expect(compatibleSetupRunnerSnapshot(JSON.stringify({ schemaVersion: 1, runners: configuration().runners, source: snapshot.source }))).toBe(false);
  });
  test.each(['jobs: {}\n---\njobs: {}', 'name: invalid native workflow'])('source native YAML must remain inspectable: %s', invalid => {
    write('.github/workflows/copilot_issue.yml', single('[self-hosted, Linux]').replace('run: echo fixture', 'uses: ./\n        with: {single-action: check_branch_sync_action}'));
    write('.github/workflows/native-ci.yml', invalid);
    expect(() => inspectSetupInstallation(root, configuration())).toThrow(/Workflow/u);
  });
  test.each(['file-count', 'file-bytes', 'total-bytes', 'job-count'])('review fails closed at its %s bound', bound => {
    if (bound === 'file-count') for (let i = 0; i < 101; i++) write(`.github/workflows/custom-${i}.yml`, workflow('  custom:\n    runs-on: ubuntu-latest\n'));
    if (bound === 'file-bytes') write('.github/workflows/custom.yml', 'x'.repeat(100_001));
    if (bound === 'total-bytes') for (let i = 0; i < 21; i++) write(`.github/workflows/custom-${i}.yml`, workflow('  custom:\n    runs-on: ubuntu-latest\n') + '#' + 'x'.repeat(99_000));
    if (bound === 'job-count') write('.github/workflows/custom.yml', workflow(Array.from({ length: 201 }, (_, i) => `  job${i}:\n    runs-on: ubuntu-latest\n`).join('')));
    expect(() => inspectSetupInstallation(root, configuration())).toThrow(/budget/u);
  });
});


test.each([false, true])('local discovery intent=%s is excluded from installed runner snapshots', discover => {
  const config = { ...configuration(), runners: { ...configuration().runners, discover } };
  const snapshot = renderSetupRunnerSnapshot(config)!;
  expect(snapshot).not.toContain('discover'); expect(compatibleSetupRunnerSnapshot(snapshot)).toBe(true);
  const altered = JSON.parse(snapshot); altered.runners.discover = discover;
  expect(compatibleSetupRunnerSnapshot(JSON.stringify(altered))).toBe(false);
});
