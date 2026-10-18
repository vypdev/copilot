import { createSetupBatchCompositionRoot } from '../composition/setup_batch_composition_root';
import { IssueLabelProvisioningRepository } from '../../data/repository/issue/issue_label_provisioning_repository';
import { IssueTypeRepository } from '../../data/repository/issue/issue_type_repository';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';
import type { SetupBatchTargetPlan } from '../../domain/setup_batch';
import * as octokit from '../github/octokit_client_resolver';
jest.mock('../../data/repository/issue/issue_label_provisioning_repository', () => ({ IssueLabelProvisioningRepository: jest.fn() }));
jest.mock('../../data/repository/issue/issue_type_repository', () => ({ IssueTypeRepository: jest.fn() }));
describe('batch resource composition', () => {
  function fixture() {
    const labels = jest.fn(async () => ({ configured: { errors: [] as string[] }, progress: { errors: [] as string[] } }));
    const types = jest.fn(async () => ({ errors: [] as string[] }));
    (IssueLabelProvisioningRepository as jest.Mock).mockImplementation(() => ({ ensureInitialLabels: labels }));
    (IssueTypeRepository as jest.Mock).mockImplementation(() => ({ ensureIssueTypes: types }));
    const configuration = createDefaultSetupConfiguration(); configuration.issueWorkflows = { enabled: ['bugfix'] };
    configuration.features.release = false; configuration.features.hotfix = false;
    const plan = { configuration, target: { owner: 'acme', name: 'repo' } } as SetupBatchTargetPlan;
    return { labels, types, plan, root: createSetupBatchCompositionRoot() };
  }
  it('binds the real discovery transport to the supplied temporary setup PAT', async () => {
    const request = jest.fn().mockResolvedValue({ data: [] });
    const resolve = jest.spyOn(octokit, 'getOctokitClient').mockReturnValue({ request });
    try {
      const f = fixture();
      expect(await f.root.discovery.list('acme', 'fixture-setup-token')).toEqual({ targets: [], truncated: false });
      expect(resolve).toHaveBeenCalledWith('fixture-setup-token');
      expect(request).toHaveBeenCalledWith('GET /orgs/{org}/repos', expect.objectContaining({ org: 'acme', page: 1 }));
    } finally { resolve.mockRestore(); }
  });
  it('projects only selected labels and organization Issue Types through existing provisioning repositories', async () => {
    const f = fixture(); await f.root.writer.labels(f.plan, 'private-token'); await f.root.writer.issueTypes(f.plan, 'private-token');
    expect(f.labels).toHaveBeenCalledWith('acme', 'repo', expect.objectContaining({ bug: 'bug', bugfix: 'bugfix', feature: '', release: '' }), 'private-token');
    expect(f.types).toHaveBeenCalledWith('acme', expect.objectContaining({ bug: 'Bug', feature: '', release: '' }), 'private-token');
  });
  it.each(['configured', 'progress'])('preserves a failed %s label result as a bounded provider failure', async field => {
    const f = fixture(); f.labels.mockResolvedValue({ configured: { errors: field === 'configured' ? ['private response'] : [] }, progress: { errors: field === 'progress' ? ['private response'] : [] } });
    await expect(f.root.writer.labels(f.plan, 'private-token')).rejects.toThrow('unknown');
  });
  it('does not hide Issue Type provisioning failures', async () => {
    const f = fixture(); f.types.mockResolvedValue({ errors: ['private response'] });
    await expect(f.root.writer.issueTypes(f.plan, 'private-token')).rejects.toThrow('unknown');
  });
});
