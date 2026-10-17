import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { SetupBatchWorkspaceAdapter } from '../setup_batch_workspace_adapter';
import { inspectRepositoryAgentGuidance, reconcileRepositoryAgentGuidance } from '../../utils/repository_agent_guidance';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
const receipt = { schemaVersion: 1, operationId: 'a67c8e40-93be-43ed-a7ed-e07378c7e773', repositoryId: 7,
  baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64) };
const hash = (content: string) => createHash('sha256').update(content).digest('hex');
describe('batch receipts and legacy guidance compatibility', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'batch-guidance-')); jest.spyOn(console, 'log').mockImplementation(() => undefined); });
  afterEach(() => { rmSync(root, { recursive: true, force: true }); jest.restoreAllMocks(); });
  async function install() {
    const configuration = createDefaultSetupConfiguration(); const renderer = new SetupBatchWorkspaceAdapter();
    const files = await renderer.render(configuration, []);
    for (const file of files) { const path = join(root, file.path); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, file.content!); }
    const manifestPath = join(root, '.copilot/setup-manifest.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    return { configuration, renderer, files, manifestPath, manifest };
  }
  it('retains a valid installation receipt during subsequent no-op setup', async () => {
    const f = await install(); f.manifest.installation = receipt;
    writeFileSync(f.manifestPath, JSON.stringify(f.manifest, null, 2) + '\n');
    expect(inspectRepositoryAgentGuidance(root)[0].status).toBe('pass');
    expect(reconcileRepositoryAgentGuidance(root, f.configuration)).toEqual({ copied: 0, skipped: 0 });
    const existing = f.files.map(file => file.path === '.copilot/setup-manifest.json' ? { ...file, content: readFileSync(f.manifestPath, 'utf8') } : file);
    expect(await f.renderer.render(f.configuration, existing)).toEqual([]);
    expect(JSON.parse(readFileSync(f.manifestPath, 'utf8')).installation).toEqual(receipt);
  });
  it.each([{ extra: true }, { installation: { ...receipt, schemaVersion: 2 } }])('preserves unknown or invalid manifest extensions %j', async change => {
    const f = await install(); writeFileSync(f.manifestPath, JSON.stringify({ ...f.manifest, ...change }));
    expect(inspectRepositoryAgentGuidance(root)[0].status).toBe('warn');
    expect(reconcileRepositoryAgentGuidance(root, f.configuration)).toEqual({ copied: 0, skipped: 1 });
  });
  it.each([undefined, { lifecycleOwner: 'setup-cli', branchNamespace: 'setup/copilot/<operation-id>', requiresIssue: false, automaticMerge: false },
    { lifecycleOwner: 'foreign' }, { lifecycleOwner: 'setup-cli', branchNamespace: 'feature/<id>', requiresIssue: false, automaticMerge: false },
    { lifecycleOwner: 'setup-cli', branchNamespace: 'setup/copilot/<operation-id>', requiresIssue: true, automaticMerge: false },
    { lifecycleOwner: 'setup-cli', branchNamespace: 'setup/copilot/<operation-id>', requiresIssue: false, automaticMerge: true }])('validates legacy and optional installer profile contracts %j', async installation => {
    const f = await install(); const path = join(root, '.copilot/repository-profile.json'); const profile = JSON.parse(readFileSync(path, 'utf8'));
    delete profile.installation; if (installation) profile.installation = installation;
    const content = JSON.stringify(profile); writeFileSync(path, content);
    f.manifest.artifacts['.copilot/repository-profile.json'].sha256 = hash(content); f.manifest.profileDigest = hash(content);
    writeFileSync(f.manifestPath, JSON.stringify(f.manifest));
    const check = inspectRepositoryAgentGuidance(root).find(item => item.id === 'agent-profile-schema');
    expect(check?.status).toBe(!installation || Object.keys(installation).length === 4 && installation.automaticMerge === false
      && installation.requiresIssue === false && installation.branchNamespace === 'setup/copilot/<operation-id>' ? 'pass' : 'fail');
  });
});
