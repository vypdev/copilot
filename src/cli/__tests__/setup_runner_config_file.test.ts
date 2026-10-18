import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadSetupConfigurationOverrides } from '../setup_config_file';
import { createDefaultSetupConfiguration, mergeSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import { validateSetupConfiguration } from '../../application/policies/setup_configuration_validation';
import { ConsoleSetupQuestionRenderer } from '../setup_question_renderer';

describe('runner config files and terminal review', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'copilot-runner-config-')); });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));
  const write = (root: string, value: unknown) => { const path = join(root, 'setup.json'); writeFileSync(path, JSON.stringify({ runners: value })); return path; };
  test('loads manual routing without requiring organization-admin permissions or credentials', () => {
    const runners = { discover: true, mode: 'manual-self-hosted', profileId: '', group: 'vypdev', labels: ['self-hosted', 'codex', 'Linux'], validation: 'hosted' };
    const configuration = mergeSetupConfiguration(createDefaultSetupConfiguration(), loadSetupConfigurationOverrides(write(directory, runners)));
    expect(configuration.runners).toEqual(runners); expect(validateSetupConfiguration(configuration)).toEqual([]);
  });
  test.each([
    false, { command: 'run' }, { mode: 1 }, { profileId: null }, { group: [] }, { validation: true },
    { labels: 'self-hosted' }, { labels: [3] }, { source: false }, { source: { other: 'unsupported' } },
    { source: { scope: 3, value: '{}' } }, { group: `ghp_${'x'.repeat(36)}` },
  ])('rejects unsafe configuration input %#', runners => expect(() => loadSetupConfigurationOverrides(write(directory, runners))).toThrow());
  test('a persisted registry snapshot is accepted only when the resolved profile matches', () => {
    const profile = { id: 'shared', group: 'vypdev', labels: ['self-hosted', 'Linux'], validation: 'hosted' };
    const runners = { mode: 'organization-profile', profileId: profile.id, group: profile.group, labels: profile.labels, validation: profile.validation,
      source: { scope: 'organization', value: JSON.stringify({ schemaVersion: 1, profiles: [profile] }) } };
    const overrides = loadSetupConfigurationOverrides(write(directory, runners));
    expect(validateSetupConfiguration(mergeSetupConfiguration(createDefaultSetupConfiguration(), overrides))).toEqual([]);
    expect(validateSetupConfiguration(mergeSetupConfiguration(createDefaultSetupConfiguration(), { ...overrides, runners: { ...overrides.runners, group: 'other' } }))).toContainEqual(expect.stringContaining('Runner configuration'));
  });
  test('terminal guidance shows provenance, groups and capacity without claiming authentication', () => {
    const renderer = new ConsoleSetupQuestionRenderer();
    const question = { stateId: 'agent-runtime' as const, id: 'runners.mode', label: 'Runner choice', kind: 'choice' as const,
      defaultValue: 'retain', choices: ['retain', 'hosted', 'manual-self-hosted'], runnerRegistryStatus: 'available' as const, runnerRegistryScope: 'organization' as const,
      runnerProfiles: [{ id: 'shared', group: '', labels: ['self-hosted', 'Linux'], validation: 'hosted' as const }],
      runnerInventory: { status: 'available' as const, groups: [{ name: 'vypdev', access: 'unknown' as const }], candidates: [
        { id: 1, labels: ['self-hosted', 'Linux'], status: 'online' as const, busy: true, access: 'unknown' as const },
        { id: 2, labels: ['self-hosted', 'macOS'], status: 'offline' as const, busy: false, access: 'unknown' as const },
      ] } };
    const output = renderer.renderPrompt(question);
    expect(output).toContain('No access is granted'); expect(output).toContain('Observed group vypdev: unknown');
    expect(output).toContain('(labels only)'); expect(output).toContain('busy'); expect(output).toContain('offline'); expect(output).toContain('(organization)');
    expect(renderer.renderPrompt({ ...question, runnerProfiles: undefined, runnerInventory: undefined, runnerRegistryScope: undefined })).toContain('Inventory: unavailable');
  });
  test('the prompt preserves fixed workflow constraints alongside its permission and runner guidance', () => {
    const output = new ConsoleSetupQuestionRenderer().renderPrompt({ id: 'features.issues', stateId: 'capabilities',
      label: 'Issues', kind: 'boolean', defaultValue: true, fixedWorkflowFeatures: { release: true } });
    expect(output).toContain('Configuration explicitly enables release or hotfix');
    expect(output).toContain('keep Issues enabled');
  });
});
