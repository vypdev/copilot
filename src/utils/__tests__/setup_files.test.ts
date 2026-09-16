import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ensureGitHubDirs, copySetupFiles, getSetupToken, hasValidSetupToken, compareSetupWorkflows } from '../setup_files';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_policy';
import { createHash } from 'node:crypto';
import { inspectRepositoryAgentGuidance, reconcileRepositoryAgentGuidance } from '../repository_agent_guidance';
import {
  REPOSITORY_AGENT_POINTER_END,
  REPOSITORY_AGENT_POINTER_START,
  renderRepositoryAgentArtifacts,
} from '../../application/policies/repository_agent_guidance_policy';

jest.mock('../logger', () => ({ logInfo: jest.fn() }));

type JsonObject = Record<string, unknown>;

function objectAt(value: JsonObject, key: string): JsonObject {
  return value[key] as JsonObject;
}

function rewriteOwnedProfile(
  cwd: string,
  mutate: (profile: JsonObject) => void,
  rawContent?: string,
): void {
  const profilePath = path.join(cwd, '.copilot/repository-profile.json');
  const manifestPath = path.join(cwd, '.copilot/setup-manifest.json');
  const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as JsonObject;
  mutate(profile);
  const content = rawContent ?? `${JSON.stringify(profile, null, 2)}\n`;
  fs.writeFileSync(profilePath, content);
  const digest = createHash('sha256').update(content).digest('hex');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    profileDigest: string;
    artifacts: Record<string, { sha256: string }>;
  };
  manifest.profileDigest = digest;
  manifest.artifacts['.copilot/repository-profile.json'].sha256 = digest;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

describe('setup_files', () => {
  let tmpDir: string;

  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'setup_files_test_')); });
  afterEach(() => { if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('creates the GitHub directories used by setup', () => {
    ensureGitHubDirs(tmpDir);
    expect(fs.existsSync(path.join(tmpDir, '.github', 'workflows'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.github', 'ISSUE_TEMPLATE'))).toBe(true);
  });

  it('copies setup files and never creates a local credential file', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'name: test');
    expect(copySetupFiles(tmpDir, setupDir)).toEqual({ copied: 1, skipped: 0 });
    expect(fs.existsSync(path.join(tmpDir, '.env'))).toBe(false);
  });

  it('keeps existing workflows by default and reports their state', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'new');
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'old');
    expect(copySetupFiles(tmpDir, setupDir)).toEqual({ copied: 0, skipped: 1 });
    expect(compareSetupWorkflows(tmpDir, undefined, setupDir)).toEqual([
      { file: 'ci.yml', destination: '.github/workflows/ci.yml', status: 'changed' },
    ]);
  });

  it('copies only selected Issue Forms and generates agent guidance', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['feature', 'help'] };
    ensureGitHubDirs(tmpDir);
    const result = copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(result.copied).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/feature_request.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/help_request.yml'))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/bug_report.yml'))).toBe(false);
    expect(fs.readFileSync(path.join(tmpDir, '.agents/skills/copilot-repository-workflow/SKILL.md'), 'utf8'))
      .toContain('Action manages remote branch');
    expect(JSON.parse(fs.readFileSync(path.join(tmpDir, '.copilot/repository-profile.json'), 'utf8')).issueWorkflows.enabled)
      .toEqual(['feature', 'help']);
  });

  it('writes a hash-owned deterministic guidance manifest and reruns idempotently', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);

    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      schemaVersion: number;
      profileDigest: string;
      artifacts: Record<string, { role: string; sha256: string }>;
    };
    const profile = fs.readFileSync(path.join(tmpDir, '.copilot/repository-profile.json'), 'utf8');
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.profileDigest).toBe(createHash('sha256').update(profile).digest('hex'));
    expect(manifest.artifacts['.copilot/AGENT_GUIDE.md']).toMatchObject({ role: 'guide', sha256: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(manifest.artifacts.AGENTS).toBeUndefined();
    expect(manifest.artifacts['AGENTS.md']).toMatchObject({ role: 'pointer' });
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');

    const rerun = copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(rerun.copied).toBe(0);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('keeps this repository dogfood artifacts byte-identical to the default renderer', () => {
    const repositoryRoot = path.resolve(__dirname, '../../..');
    const configuration = createDefaultSetupConfiguration();

    for (const artifact of renderRepositoryAgentArtifacts(configuration)) {
      expect(fs.readFileSync(path.join(repositoryRoot, artifact.path), 'utf8')).toBe(artifact.content);
    }
  });

  it('preserves drifted managed guidance and does not advance the manifest', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const guidePath = path.join(tmpDir, '.copilot/AGENT_GUIDE.md');
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    fs.writeFileSync(guidePath, '# Maintainer-owned drift\n');

    const result = copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(result.skipped).toBeGreaterThan(0);
    expect(fs.readFileSync(guidePath, 'utf8')).toBe('# Maintainer-owned drift\n');
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
  });

  it('rejects unknown nested fields in an otherwise hash-consistent repository profile', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const profilePath = path.join(tmpDir, '.copilot/repository-profile.json');
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
    profile.branches.unexpected = true;
    const profileContent = `${JSON.stringify(profile, null, 2)}\n`;
    fs.writeFileSync(profilePath, profileContent);
    const digest = createHash('sha256').update(profileContent).digest('hex');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.profileDigest = digest;
    manifest.artifacts['.copilot/repository-profile.json'].sha256 = digest;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(inspectRepositoryAgentGuidance(tmpDir))
      .toContainEqual(expect.objectContaining({ id: 'agent-profile-schema', status: 'fail' }));
  });

  it('reports secret-like content even when a generated guide hash is internally consistent', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const guidePath = path.join(tmpDir, '.copilot/AGENT_GUIDE.md');
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const guideContent = `${fs.readFileSync(guidePath, 'utf8')}\nghp_abcdefghijklmnopqrstuvwxyz\n`;
    fs.writeFileSync(guidePath, guideContent);
    const digest = createHash('sha256').update(guideContent).digest('hex');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.artifacts['.copilot/AGENT_GUIDE.md'].sha256 = digest;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    expect(inspectRepositoryAgentGuidance(tmpDir))
      .toContainEqual(expect.objectContaining({ id: 'agent-guidance-secret-scan', status: 'fail' }));
  });

  it('renders custom routing labels into forms and the machine profile', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    configuration.issueWorkflows = { enabled: ['bugfix'] };
    configuration.actionInputs['bug-label'] = 'kind:defect';
    configuration.actionInputs['bugfix-label'] = 'flow:repair';
    ensureGitHubDirs(tmpDir);

    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(fs.readFileSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/bug_report.yml'), 'utf8'))
      .toContain('labels: ["kind:defect","flow:repair","priority: high"]');
    const profile = JSON.parse(fs.readFileSync(path.join(tmpDir, '.copilot/repository-profile.json'), 'utf8'));
    expect(profile.issueWorkflows.forms.bugfix).toMatchObject({
      labels: ['kind:defect', 'flow:repair'],
      formLabels: ['kind:defect', 'flow:repair', 'priority: high'],
    });
  });

  it('reconciles setup-owned form labels while preserving a recoverable backup', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const initial = createDefaultSetupConfiguration();
    initial.issueWorkflows = { enabled: ['bugfix'] };
    initial.actionInputs['bug-label'] = 'kind:defect';
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, initial.features, { setupConfiguration: initial });
    const updated = createDefaultSetupConfiguration();
    updated.issueWorkflows = { enabled: ['bugfix'] };
    updated.actionInputs['bug-label'] = 'kind:bug';

    copySetupFiles(tmpDir, setupDir, updated.features, { setupConfiguration: updated });

    expect(fs.readFileSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/bug_report.yml'), 'utf8'))
      .toContain('labels: ["kind:bug","bugfix","priority: high"]');
    const backupFiles = fs.readdirSync(path.join(tmpDir, '.copilot/setup-backups'), { recursive: true }).map(String);
    expect(backupFiles.some(file => file.endsWith('bug_report.yml'))).toBe(true);
  });

  it('retires deselected setup-owned release assets into recoverable backups', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const initial = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, initial.features, { setupConfiguration: initial });
    const reduced = createDefaultSetupConfiguration();
    reduced.issueWorkflows = { enabled: ['feature', 'bugfix'] };

    copySetupFiles(tmpDir, setupDir, reduced.features, { setupConfiguration: reduced });

    expect(fs.existsSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/release.yml'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.github/workflows/release_workflow.yml'))).toBe(false);
    const backupRoot = path.join(tmpDir, '.copilot/setup-backups');
    const backupFiles = fs.readdirSync(backupRoot, { recursive: true }).map(String);
    expect(backupFiles.some(file => file.endsWith('release.yml'))).toBe(true);
    expect(backupFiles.some(file => file.endsWith('release_workflow.yml'))).toBe(true);
  });

  it('inserts only a bounded pointer block into an existing AGENTS.md', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing instructions\n\nKeep this byte-for-byte.\n');

    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    const agents = fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('# Existing instructions\n\nKeep this byte-for-byte.');
    expect(agents).toContain('<!-- copilot:agent-guidance:start -->');
    expect(agents).toContain('<!-- copilot:agent-guidance:end -->');
  });

  it('uses reduced discovery without editing an existing AGENTS.md under create-if-missing', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    configuration.repositoryAgentGuidance.agentsPointer = 'create-if-missing';
    ensureGitHubDirs(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing only\n');

    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8')).toBe('# Existing only\n');
    const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, '.copilot/setup-manifest.json'), 'utf8'));
    expect(manifest.artifacts).not.toHaveProperty('AGENTS.md');
    expect(inspectRepositoryAgentGuidance(tmpDir, configuration))
      .toContainEqual(expect.objectContaining({ id: 'agent-guidance-discovery', status: 'warn' }));
  });

  it('does not advance ownership when a managed pointer drifts', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Existing\n');
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const manifestBefore = fs.readFileSync(manifestPath, 'utf8');
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, fs.readFileSync(agentsPath, 'utf8').replace(
      'Managed remote branches are owned by the GitHub Action.',
      'Maintainer-edited pointer.',
    ));

    const result = copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(result.skipped).toBeGreaterThan(0);
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(manifestBefore);
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain('Maintainer-edited pointer.');
  });

  it('preserves malformed pointer markers and refuses to claim partial guidance ownership', () => {
    const configuration = createDefaultSetupConfiguration();
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '<!-- copilot:agent-guidance:start -->\nunterminated\n');

    const result = reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(result.skipped).toBeGreaterThan(0);
    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8')).toContain('unterminated');
    expect(fs.existsSync(path.join(tmpDir, '.copilot/setup-manifest.json'))).toBe(false);
  });

  it('blocks all guidance writes when an existing manifest is malformed', () => {
    const configuration = createDefaultSetupConfiguration();
    fs.mkdirSync(path.join(tmpDir, '.copilot'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.copilot/setup-manifest.json'), '{"schemaVersion":999}\n');

    expect(reconcileRepositoryAgentGuidance(tmpDir, configuration)).toEqual({ copied: 0, skipped: 1 });
    expect(fs.existsSync(path.join(tmpDir, '.copilot/AGENT_GUIDE.md'))).toBe(false);
  });

  it('reports a missing manifest without inferring ownership from loose files', () => {
    fs.mkdirSync(path.join(tmpDir, '.copilot'), { recursive: true });
    fs.writeFileSync(path.join(tmpDir, '.copilot/AGENT_GUIDE.md'), '# Unowned\n');

    expect(inspectRepositoryAgentGuidance(tmpDir)).toEqual([
      expect.objectContaining({ id: 'agent-guidance-manifest', status: 'warn' }),
    ]);
  });

  it('supports guidance without a generic AGENTS.md discovery pointer', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.repositoryAgentGuidance.agentsPointer = 'disabled';

    const result = reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(result.copied).toBe(4);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    expect(inspectRepositoryAgentGuidance(tmpDir, configuration))
      .toContainEqual(expect.objectContaining({ id: 'agent-guidance-discovery', status: 'warn' }));
  });

  it('replaces a hash-owned stale pointer and preserves a backup', () => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    const manifestPath = path.join(tmpDir, '.copilot/setup-manifest.json');
    const stale = fs.readFileSync(agentsPath, 'utf8').replace(
      'Managed remote branches are owned by the GitHub Action.',
      'Old setup-owned branch guidance.',
    );
    fs.writeFileSync(agentsPath, stale);
    const start = stale.indexOf(REPOSITORY_AGENT_POINTER_START);
    const end = stale.indexOf(REPOSITORY_AGENT_POINTER_END) + REPOSITORY_AGENT_POINTER_END.length;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      artifacts: Record<string, { sha256: string }>;
    };
    manifest.artifacts['AGENTS.md'].sha256 = createHash('sha256').update(stale.slice(start, end)).digest('hex');
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

    const result = reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(result.skipped).toBe(0);
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain('Managed remote branches are owned by the GitHub Action.');
    const backups = fs.readdirSync(path.join(tmpDir, '.copilot/setup-backups'), { recursive: true }).map(String);
    expect(backups.some(file => file.endsWith('AGENTS.md'))).toBe(true);
  });

  it('retires only hash-owned guidance and preserves surrounding AGENTS.md text', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    fs.writeFileSync(path.join(tmpDir, 'AGENTS.md'), '# Repository-owned\n');
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    configuration.repositoryAgentGuidance.enabled = false;

    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });

    expect(fs.readFileSync(path.join(tmpDir, 'AGENTS.md'), 'utf8').trim()).toBe('# Repository-owned');
    expect(fs.existsSync(path.join(tmpDir, '.copilot/repository-profile.json'))).toBe(false);
    expect(fs.existsSync(path.join(tmpDir, '.copilot/setup-manifest.json'))).toBe(false);
    expect(inspectRepositoryAgentGuidance(tmpDir, configuration))
      .toEqual([expect.objectContaining({ id: 'agent-guidance-manifest', status: 'skipped' })]);
  });

  it('retires a pointer-only AGENTS.md and preserves drifted owned artifacts', () => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    const guidePath = path.join(tmpDir, '.copilot/AGENT_GUIDE.md');
    fs.writeFileSync(guidePath, '# Maintainer drift\n');
    configuration.repositoryAgentGuidance.enabled = false;

    const result = reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(result.skipped).toBe(1);
    expect(fs.existsSync(path.join(tmpDir, 'AGENTS.md'))).toBe(false);
    expect(fs.readFileSync(guidePath, 'utf8')).toBe('# Maintainer drift\n');
    expect(fs.existsSync(path.join(tmpDir, '.copilot/setup-manifest.json'))).toBe(false);
  });

  it('preserves a drifted pointer during retirement', () => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    const agentsPath = path.join(tmpDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, fs.readFileSync(agentsPath, 'utf8').replace('Before repository work', 'Before any work'));
    configuration.repositoryAgentGuidance.enabled = false;

    const result = reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(result.skipped).toBe(1);
    expect(fs.readFileSync(agentsPath, 'utf8')).toContain('Before any work');
  });

  it('reports missing managed artifacts and form/workflow projection drift', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    fs.unlinkSync(path.join(tmpDir, '.copilot/AGENT_GUIDE.md'));
    fs.unlinkSync(path.join(tmpDir, '.github/ISSUE_TEMPLATE/feature_request.yml'));
    fs.unlinkSync(path.join(tmpDir, '.github/workflows/release_workflow.yml'));

    const checks = inspectRepositoryAgentGuidance(tmpDir, configuration);

    expect(checks).toContainEqual(expect.objectContaining({ id: 'agent-guide-digest', status: 'fail' }));
    expect(checks).toContainEqual(expect.objectContaining({ id: 'agent-forms-profile-parity', status: 'fail' }));
    expect(checks).toContainEqual(expect.objectContaining({ id: 'agent-workflow-profile-parity', status: 'fail' }));
  });

  it('reports a missing runtime profile independently from other managed artifacts', () => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    fs.unlinkSync(path.join(tmpDir, '.copilot/repository-profile.json'));

    const checks = inspectRepositoryAgentGuidance(tmpDir, configuration);

    expect(checks).toContainEqual(expect.objectContaining({ id: 'agent-profile-schema', status: 'fail' }));
    expect(checks).toContainEqual(expect.objectContaining({ id: 'agent-profile-runtime-parity', status: 'fail' }));
  });

  it.each([
    ['generator identity', (profile: JsonObject) => { objectAt(profile, 'generator').name = 'other'; }],
    ['formsEnabled type', (profile: JsonObject) => { objectAt(profile, 'issueWorkflows').formsEnabled = 'yes'; }],
    ['forms cardinality', (profile: JsonObject) => { delete objectAt(objectAt(profile, 'issueWorkflows'), 'forms').feature; }],
    ['workflow fact keys', (profile: JsonObject) => { objectAt(objectAt(objectAt(profile, 'issueWorkflows'), 'forms'), 'feature').extra = true; }],
    ['branch contract', (profile: JsonObject) => { objectAt(profile, 'branches').remoteLifecycleOwner = 'agent'; }],
    ['pull-request contract', (profile: JsonObject) => { objectAt(profile, 'pullRequests').mustLinkIssue = false; }],
    ['deployment contract', (profile: JsonObject) => { objectAt(profile, 'deployment').agentMayInitiateWithoutExplicitAuthorization = true; }],
  ])('rejects a hash-consistent profile with an invalid %s', (_label, mutate) => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    rewriteOwnedProfile(tmpDir, mutate);

    expect(inspectRepositoryAgentGuidance(tmpDir))
      .toContainEqual(expect.objectContaining({ id: 'agent-profile-schema', status: 'fail' }));
  });

  it('rejects malformed JSON even when its manifest digest is consistent', () => {
    const configuration = createDefaultSetupConfiguration();
    reconcileRepositoryAgentGuidance(tmpDir, configuration);
    rewriteOwnedProfile(tmpDir, () => undefined, '{\n');

    expect(inspectRepositoryAgentGuidance(tmpDir))
      .toContainEqual(expect.objectContaining({ id: 'agent-profile-schema', status: 'fail' }));
  });

  it('reports malformed Issue Form label JSON as profile drift', () => {
    const setupDir = path.resolve(__dirname, '../../../setup');
    const configuration = createDefaultSetupConfiguration();
    ensureGitHubDirs(tmpDir);
    copySetupFiles(tmpDir, setupDir, configuration.features, { setupConfiguration: configuration });
    const formPath = path.join(tmpDir, '.github/ISSUE_TEMPLATE/feature_request.yml');
    fs.writeFileSync(formPath, fs.readFileSync(formPath, 'utf8').replace(/^labels:.*$/mu, 'labels: [invalid'));

    expect(inspectRepositoryAgentGuidance(tmpDir, configuration))
      .toContainEqual(expect.objectContaining({ id: 'agent-forms-profile-parity', status: 'fail' }));
  });

  it('skips form projection checks when Issue Forms are disabled', () => {
    const configuration = createDefaultSetupConfiguration();
    configuration.features.issueTemplates = false;
    reconcileRepositoryAgentGuidance(tmpDir, configuration);

    expect(inspectRepositoryAgentGuidance(tmpDir, configuration))
      .toContainEqual(expect.objectContaining({ id: 'agent-forms-profile-parity', status: 'pass' }));
  });

  it('updates only approved workflows and preserves a backup', () => {
    const setupDir = path.join(tmpDir, 'setup');
    fs.mkdirSync(path.join(setupDir, 'workflows'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.github', 'workflows'), { recursive: true });
    fs.writeFileSync(path.join(setupDir, 'workflows', 'ci.yml'), 'new');
    fs.writeFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'old');
    const result = copySetupFiles(tmpDir, setupDir, undefined, {
      updateExistingWorkflows: true,
      approvedWorkflowFiles: ['ci.yml'],
    });
    expect(result).toEqual({ copied: 1, skipped: 0 });
    expect(fs.readFileSync(path.join(tmpDir, '.github', 'workflows', 'ci.yml'), 'utf8')).toBe('new');
    const backups = fs.readdirSync(path.join(tmpDir, '.copilot', 'setup-backups'));
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(tmpDir, '.copilot', 'setup-backups', backups[0], 'ci.yml'), 'utf8')).toBe('old');
  });

  describe('setup token resolution', () => {
    const key = 'PERSONAL_ACCESS_TOKEN';
    let previous: string | undefined;
    beforeEach(() => { previous = process.env[key]; });
    afterEach(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; });

    it('uses an explicit token before the environment', () => {
      process.env[key] = 'ghp_environment_token_xxxxxxxxxxxx';
      expect(getSetupToken(tmpDir, 'ghp_explicit_token_xxxxxxxxxxxx')).toBe('ghp_explicit_token_xxxxxxxxxxxx');
    });

    it('uses only the environment and never reads .env', () => {
      delete process.env[key];
      fs.writeFileSync(path.join(tmpDir, '.env'), `${key}=ghp_file_token_xxxxxxxxxxxxxxxxxxxx`);
      expect(getSetupToken(tmpDir)).toBeUndefined();
      expect(hasValidSetupToken(tmpDir)).toBe(false);
    });

    it('rejects placeholders and accepts a sufficiently long token', () => {
      process.env[key] = 'github_pat_11..';
      expect(hasValidSetupToken(tmpDir)).toBe(false);
      process.env[key] = 'ghp_valid_token_xxxxxxxxxxxxxxxxxxxx';
      expect(hasValidSetupToken(tmpDir)).toBe(true);
    });
  });
});
