import { permissionName } from '../../../web/src/i18n/permissionTerms';
import { useWebSetupRenderer } from '../../../test-support/web-setup-renderer';
import type { SetupBatchView } from '../../application/contracts/setup_batch_view';
import { buildSetupBatchView } from '../../application/policies/setup_batch_view_policy';
import { unavailableSetupRemoteConfiguration } from '../../application/policies/setup_remote_facts_policy';
import { beginSetupBatchOperation } from '../../application/policies/setup_batch_policy';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import type { SetupBatchPlan } from '../../domain/setup_batch';

const markup = useWebSetupRenderer();
function batch(status: SetupBatchView['targets'][number]['status'] = 'ready'): SetupBatchView {
  return { operationId: 'a67c8e40-93be-43ed-a7ed-e07378c7e773', organization: 'acme', phase: 'review', retryRemaining: 1,
    targets: [{ repositoryId: 7, repository: 'acme/repo', status, installationBranch: 'setup/copilot/a67c8e40-93be-43ed-a7ed-e07378c7e773',
      baseBranch: 'master', baseSha: 'a'.repeat(40), blockers: [], files: [{ path: 'AGENTS.md', content: '<script>alert(1)</script>' }], repositoryVariables: ['MODEL'], grants: [{ kind: 'secret', name: 'PAT' }],
      retainedSecrets: ['PAT'], completedEffects: [], permissionProbes: [{ scope: 'repository', permission: 'Contents' }] }] };
}
describe('batch selection and reviewed plan UI', () => {
  test.each(['en', 'es', 'fr', 'pt'])('%s renders repository metadata, bounded selection and native keyboard controls', async locale => {
    const html = await markup('RepositorySelector', { selection: { organization: 'acme', currentRepositoryId: 7, selectedIds: [7], discoveryStatus: 'available', truncated: true,
      candidates: [{ id: 7, name: 'current', private: true }, { id: 8, name: 'archived', private: false, unavailable: 'archived' }] }, controller: true, busy: false }, locale);
    expect(html).toContain('type="checkbox"'); expect(html).toContain('type="search"'); expect(html).toContain('current'); expect(html).toContain('archived');
    expect(html).not.toContain('Select all'); expect(html).toContain('disabled');
  });
  test.each(['en', 'es', 'fr', 'pt'])('%s discloses files, additive grants, retained Secrets, probes and exact branch/base before Apply', async locale => {
    const html = await markup('BatchSetupPanel', { batch: batch(), mode: 'review', controller: true, busy: false }, locale);
    expect(html).toContain('setup/copilot/'); expect(html).toContain('a'.repeat(40)); expect(html).toContain(permissionName(locale as 'en' | 'es' | 'fr' | 'pt', 'Contents')); expect(html).toContain('PAT');
    expect(html).toContain('&lt;script>'); expect(html).not.toContain('<script>alert'); expect(html).toContain('AGENTS.md');
  });
  test.each(['ready', 'blocked', 'applying', 'partial', 'waiting-for-merge', 'verification-pending', 'unchanged', 'cancelled'] as const)('renders a textual %s outcome and keeps PR creation distinct from installation', async status => {
    const view = batch(status); const html = await markup('BatchSetupPanel', { batch: view, mode: 'result', controller: true, busy: false });
    expect(html).toContain('role="status"'); expect(html).toContain('acme/repo');
    if (status === 'waiting-for-merge') expect(html).toContain('waiting for human merge');
  });
  test('disables Apply when every selected target is blocked or the tab is an observer', async () => {
    const blocked = await markup('BatchSetupPanel', { batch: batch('blocked'), mode: 'review', controller: true, busy: false });
    const observer = await markup('BatchSetupPanel', { batch: batch(), mode: 'review', controller: false, busy: false });
    expect(blocked).toMatch(/class="primary(?: [^"]*)?"[^>]*disabled/u); expect(observer).toMatch(/class="primary(?: [^"]*)?"[^>]*disabled/u);
  });
  test('retains results on cancellation and accepts only constructed GitHub PR links', async () => {
    const view = batch('partial'); const target = { ...view.targets[0], pullRequestUrl: 'javascript:alert(1)', reason: 'provider' as const };
    const html = await markup('BatchSetupPanel', { batch: { ...view, stopRequested: true, targets: [target] }, mode: 'progress', controller: true, busy: false });
    expect(html).not.toContain('javascript:'); expect(html).toContain('role="status"'); expect(html).toMatch(/<button[^>]*disabled/u);
    const linked = await markup('BatchSetupPanel', { batch: { ...view, targets: [{ ...target, pullRequestUrl: 'https://github.com/acme/repo/pull/31' }] }, mode: 'result', controller: true, busy: false });
    expect(linked).toContain('rel="noopener noreferrer"'); expect(linked).toContain('https://github.com/acme/repo/pull/31');
  });
  test('builds a value-free view with metadata and only safe file content', () => {
    const configuration = createDefaultSetupConfiguration(); const remote = unavailableSetupRemoteConfiguration();
    const plan: SetupBatchPlan = { operationId: batch().operationId, organization: 'acme', targets: [{ configuration, remote,
      target: { id: 7, ownerId: 3, owner: 'acme', name: 'repo', defaultBranch: 'master', baseSha: 'a'.repeat(40), private: true, archived: false, disabled: false, canPush: true },
      digest: 'b'.repeat(64), files: [], repositoryVariables: [{ name: 'MODEL', value: 'private-configuration' }], grants: [], sharedSnapshot: [], blocked: ['Read access is unavailable.'] }] };
    const operation = beginSetupBatchOperation(plan); const view = buildSetupBatchView(plan, operation, 'review', 1);
    expect(view.targets[0].blockers).toEqual(['Read access is unavailable.']); expect(JSON.stringify(view)).not.toContain('private-configuration');
    expect(() => buildSetupBatchView(plan, { ...operation, targets: [] }, 'review', 1)).toThrow('identity mismatch');
  });
});
