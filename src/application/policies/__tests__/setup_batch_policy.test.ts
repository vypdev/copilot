import { beginSetupBatchOperation, isSetupBatchInstallationReceipt, parseSetupBatchOperation, setupBatchBranch,
  setupBatchMarker, setupSharedResourceApplies, validSetupBatchAssetPath, validateSetupBatchTargets } from '../setup_batch_policy';
import type { SetupBatchTarget, SetupBatchPlan } from '../../../domain/setup_batch';
const id = 'a67c8e40-93be-43ed-a7ed-e07378c7e773';
const target = (): SetupBatchTarget => ({ id: 7, ownerId: 3, owner: 'acme', name: 'repo', defaultBranch: 'master',
  baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true });
const plan = (): SetupBatchPlan => ({ operationId: id, organization: 'acme', targets: [{ target: target(), digest: 'b'.repeat(64), blocked: [] } as unknown as SetupBatchPlan['targets'][number]] });
describe('bounded setup operation and ownership policy', () => {
  it('constructs only canonical installer refs and operation markers', () => {
    expect(setupBatchBranch(id)).toBe(`setup/copilot/${id}`);
    expect(setupBatchMarker(id, 7)).toBe(`<!-- copilot-setup-operation:v1:${id}:7 -->`);
    expect(() => setupBatchMarker(id, 0)).toThrow();
  });
  it.each(['master', '../other', id.toUpperCase(), 'a67c8e40-93be-13ed-a7ed-e07378c7e773'])('rejects noncanonical operation %s', value => {
    expect(() => setupBatchBranch(value)).toThrow();
  });
  it('accepts 25 explicit distinct same-organization identities', () => {
    expect(validateSetupBatchTargets('acme', Array.from({ length: 25 }, (_, index) => ({ ...target(), id: index + 1, name: `repo-${index}` })))).toEqual([]);
  });
  it.each([0, 26])('rejects %s targets', count => {
    expect(validateSetupBatchTargets('acme', Array.from({ length: count }, (_, index) => ({ ...target(), id: index + 1, name: `repo-${index}` })))).not.toEqual([]);
  });
  it.each([{ id: 0 }, { ownerId: 4 }, { owner: 'other' }, { name: 'unsafe/name' }, { baseSha: 'HEAD' },
    { archived: true }, { disabled: true }, { canPush: false }])('rejects target drift or ineligibility %j', change => {
    expect(validateSetupBatchTargets('acme', [target(), { ...target(), id: 8, name: 'other', ...change }])).not.toEqual([]);
  });
  it.each(['HEAD..other', 'feature//double', '.hidden', 'other.lock', 'bad@{ref', '@', 'bad]', 'bad\\path', 'with space', 'line\nfeed', '-option', 'end.'])('rejects unsafe default branch %s', branch => {
    expect(validateSetupBatchTargets('acme', [{ ...target(), defaultBranch: branch }])).not.toEqual([]);
  });
  it('rejects duplicate identities even when differently cased names look distinct', () => {
    expect(validateSetupBatchTargets('acme', [target(), { ...target(), name: 'REPO', id: 8 }])).not.toEqual([]);
    expect(validateSetupBatchTargets('acme', [target(), target()])).not.toEqual([]);
    expect(validateSetupBatchTargets('bad/name', [target()])).not.toEqual([]);
  });
  it.each(['AGENTS.md', '.agents/skills/copilot-repository-workflow/SKILL.md', '.github/workflows/copilot.yml',
    '.github/ISSUE_TEMPLATE/feature.yml', '.github/pull_request_template.md', '.copilot/repository-profile.json',
    '.copilot/setup-manifest.json', '.copilot/AGENT_GUIDE.md', '.copilot/setup-backups/abc/original.yml'])('allows setup asset %s', path => {
    expect(validSetupBatchAssetPath(path)).toBe(true);
  });
  it.each(['../secret', '.git/config', '.github/workflows/../../secret', 'src/index.ts', '.copilot//bad', '/absolute',
    '.copilot/setup-backups/x/../secret', 'AGENTS.md\n', 'x'.repeat(241)])('blocks non-asset path %s', path => {
    expect(validSetupBatchAssetPath(path)).toBe(false);
  });
  it('models access without expanding visibility or selected membership', () => {
    const shared = { kind: 'secret' as const, name: 'PAT', updatedAt: '2026-10-17T14:00:00Z', selectedRepositoryIds: [7] };
    expect(setupSharedResourceApplies({ ...shared, visibility: 'all' }, target())).toBe(true);
    expect(setupSharedResourceApplies({ ...shared, visibility: 'private' }, target())).toBe(true);
    expect(setupSharedResourceApplies({ ...shared, visibility: 'private' }, { ...target(), private: false })).toBe(false);
    expect(setupSharedResourceApplies({ ...shared, visibility: 'selected' }, target())).toBe(true);
    expect(setupSharedResourceApplies({ ...shared, visibility: 'selected', selectedRepositoryIds: [] }, target())).toBe(false);
  });
  it('round-trips metadata only and rejects future fields, versions and incomplete PR receipts', () => {
    const operation = beginSetupBatchOperation(plan());
    expect(parseSetupBatchOperation(operation)).toEqual(operation);
    expect(parseSetupBatchOperation(operation)).not.toBe(operation);
    const cleanup = { ...operation, targets: [{ ...operation.targets[0], status: 'blocked', reason: 'provider', cleanupPending: true }] };
    expect(parseSetupBatchOperation(cleanup)).toEqual(cleanup);
    for (const change of [{ schemaVersion: 2 }, { token: 'fixture' }, { targets: [] },
      { targets: [{ ...operation.targets[0], status: 'waiting-for-merge' }] },
      { targets: [{ ...operation.targets[0], secretValue: 'fixture' }] },
      { targets: [{ ...operation.targets[0], cleanupPending: false }] },
      { targets: [{ ...operation.targets[0], effects: ['branch', 'branch'] }] }]) {
      expect(() => parseSetupBatchOperation({ ...operation, ...change })).toThrow();
    }
  });
  it('requires an exact v1 installation receipt, never a branch name alone', () => {
    const receipt = { schemaVersion: 1, operationId: id, repositoryId: 7, baseSha: 'a'.repeat(40), planDigest: 'b'.repeat(64) };
    expect(isSetupBatchInstallationReceipt(receipt)).toBe(true);
    expect(isSetupBatchInstallationReceipt({ ...receipt, token: 'fixture' })).toBe(false);
    expect(isSetupBatchInstallationReceipt({ ...receipt, schemaVersion: 2 })).toBe(false);
    expect(isSetupBatchInstallationReceipt({ ...receipt, planDigest: 'other' })).toBe(false);
    expect(isSetupBatchInstallationReceipt(null)).toBe(false);
  });
});
