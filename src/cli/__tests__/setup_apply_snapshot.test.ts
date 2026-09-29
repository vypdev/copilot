import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { captureSetupApplySnapshot, setupApplySnapshotMatches } from '../setup_apply_snapshot';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { buildSetupPlan, setupPlanGuardPaths } from '../../application/policies/setup_configuration_plan';

describe('web setup apply snapshot', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'copilot-apply-snapshot-')); });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  test('detects creation and modification of selected files', () => {
    const names = ['.github/workflows/copilot.yml'];
    const first = captureSetupApplySnapshot(root, names);
    expect(first[names[0]]).toBe('missing');
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, names[0]), 'original');
    expect(setupApplySnapshotMatches(root, names, first)).toBe(false);
    const second = captureSetupApplySnapshot(root, names);
    expect(setupApplySnapshotMatches(root, names, second)).toBe(true);
    writeFileSync(join(root, names[0]), 'changed');
    expect(setupApplySnapshotMatches(root, names, second)).toBe(false);
  });

  test('rejects traversal and symlinked paths', () => {
    expect(() => captureSetupApplySnapshot(root, ['../outside'])).toThrow('outside');
    mkdirSync(join(root, '.github'));
    symlinkSync(tmpdir(), join(root, '.github', 'workflows'));
    expect(() => captureSetupApplySnapshot(root, ['.github/workflows/copilot.yml'])).toThrow('symbolic link');
  });

  test('rejects absolute paths and files too large to snapshot safely', () => {
    expect(() => captureSetupApplySnapshot(root, [join(root, 'absolute.yml')])).toThrow('outside');
    writeFileSync(join(root, 'large.yml'), 'x'.repeat(5 * 1024 * 1024 + 1));
    expect(() => captureSetupApplySnapshot(root, ['large.yml'])).toThrow('Cannot safely snapshot');
  });

  test('normalizes duplicate selected paths and remains stable when nothing changed', () => {
    writeFileSync(join(root, 'a.yml'), 'stable');
    const snapshot = captureSetupApplySnapshot(root, ['a.yml', 'a.yml']);
    expect(Object.keys(snapshot)).toEqual(['a.yml']);
    expect(setupApplySnapshotMatches(root, ['a.yml'], snapshot)).toBe(true);
  });

  test('guards checkout destinations, not the package-source labels shown in the plan', () => {
    const paths = setupPlanGuardPaths(buildSetupPlan(createDefaultSetupConfiguration()));
    expect(paths).toContain('.github/workflows/copilot_issue.yml');
    expect(paths).toContain('.github/ISSUE_TEMPLATE/feature_request.yml');
    expect(paths).toContain('.github/pull_request_template.md');
    expect(paths).toContain('AGENTS.md');
    expect(paths).not.toContain('workflows/copilot_issue.yml');
    expect(paths).not.toContain('AGENTS.md (managed pointer only)');
    const snapshot = captureSetupApplySnapshot(root, paths);
    mkdirSync(join(root, '.github', 'workflows'), { recursive: true });
    writeFileSync(join(root, '.github', 'workflows', 'copilot_issue.yml'), 'edited after approval');
    expect(setupApplySnapshotMatches(root, paths, snapshot)).toBe(false);
  });

  test('also guards managed files that a configuration may retire', () => {
    const plan = buildSetupPlan(createDefaultSetupConfiguration());
    const paths = setupPlanGuardPaths({ ...plan, selectedFiles: [] });
    expect(paths).toContain('.github/workflows/release_workflow.yml');
    expect(paths).toContain('.github/workflows/hotfix_workflow.yml');
    expect(paths).toContain('.github/ISSUE_TEMPLATE/release.yml');
    expect(paths).toContain('.github/ISSUE_TEMPLATE/config.yml');
  });

  test.each([
    '.copilot/setup-manifest.json',
    '.copilot/repository-profile.json',
    '.copilot/AGENT_GUIDE.md',
    '.agents/skills/copilot-repository-workflow/SKILL.md',
    'AGENTS.md',
  ])('guards %s against drift even when repository guidance is disabled', name => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repositoryAgentGuidance = { ...configuration.repositoryAgentGuidance, enabled: false };
    const plan = buildSetupPlan(configuration);
    expect(plan.selectedFiles).not.toContain(name);
    const paths = setupPlanGuardPaths(plan);
    expect(paths).toContain(name);
    const file = join(root, name);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, 'reviewed');
    const reviewed = captureSetupApplySnapshot(root, paths);
    writeFileSync(file, 'changed after approval');
    expect(setupApplySnapshotMatches(root, paths, reviewed)).toBe(false);
  });
});
