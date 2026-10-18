import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSetupRunnerDiscovery, createSetupInstallationReview } from '../composition/setup_runner_composition_root';
import * as clients from '../github/octokit_client_resolver';
import { createDefaultSetupConfiguration } from '../../application/policies/setup_configuration_defaults';

describe('runner composition keeps read-only ports', () => {
  test('binds only fixed GET discovery to the setup credential', async () => {
    const request = jest.fn(async () => ({ data: { total_count: 0, runners: [] } }));
    const client = jest.spyOn(clients, 'getOctokitClient').mockReturnValue({ request });
    try {
      expect(await createSetupRunnerDiscovery().discover('owner', 'repo', 'fixture', 'User')).toEqual({ status: 'available', groups: [], candidates: [] });
      expect(client).toHaveBeenCalledWith('fixture'); expect(request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/actions/runners', expect.objectContaining({ owner: 'owner', repo: 'repo', per_page: 100, page: 1 }));
    } finally { client.mockRestore(); }
  });
  test('inspection of a clean directory and the source checkout never writes', async () => {
    const root = mkdtempSync(join(tmpdir(), 'copilot-runner-inspection-'));
    try {
      const configuration = createDefaultSetupConfiguration();
      const clean = await createSetupInstallationReview(root).inspect(configuration);
      expect(clean.changes.length).toBeGreaterThan(0); expect(readdirSync(root)).toEqual([]);
      const source = await createSetupInstallationReview().inspect(configuration);
      expect(source.assets.some(asset => asset.path === '.github/workflows/ci_check.yml' && asset.status === 'source-only')).toBe(true);
      expect(source.jobs.some(job => job.role === 'publication' && job.runsOn === 'ubuntu-latest')).toBe(true);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
