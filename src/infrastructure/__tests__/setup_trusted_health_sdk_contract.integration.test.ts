import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

test('the real Octokit SDK reads exact default-branch health evidence without dispatching or mutating resources', () => {
  const output = execFileSync(process.execPath, [resolve('test-support/setup-trusted-health-sdk-contract.cjs')], {
    cwd: process.cwd(), encoding: 'utf8', timeout: 15_000,
    env: { ...process.env, PERSONAL_ACCESS_TOKEN: '', GH_TOKEN: '', GITHUB_TOKEN: '' },
  });
  const { result, requests } = JSON.parse(output);
  expect(result).toEqual([expect.objectContaining({ name: 'PAT', status: 'valid' }),
    expect.objectContaining({ name: 'OPENAI_API_KEY', status: 'valid' })]);
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.every((request: { method: string }) => request.method === 'GET')).toBe(true);
  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: '/repos/owner/repo/actions/organization-secrets' }),
    expect.objectContaining({ path: '/repos/owner/repo/actions/secrets' }),
    expect.objectContaining({ path: '/repos/owner/repo/contents/.github/workflows/copilot_credential_health.yml', query: { ref: 'a'.repeat(40) } }),
  ]));
}, 20_000);
