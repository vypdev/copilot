import * as github from '@actions/github';
import { GithubSetupProjectDiscoveryAdapter } from '../github_setup_project_discovery_adapter';

jest.mock('@actions/github', () => ({ getOctokit: jest.fn() }));

const adapter = new GithubSetupProjectDiscoveryAdapter();
const owner = 'acme';

function arrange(request: jest.Mock): void {
  (github.getOctokit as jest.Mock).mockReturnValue({ request });
}

describe('GitHub setup Project discovery', () => {
  beforeEach(() => jest.clearAllMocks());

  test('lists existing organization Projects and reads their Status options without writes', async () => {
    const request = jest.fn().mockImplementation(async (route: string) => route.endsWith('/fields')
      ? { data: [{ name: 'Status', data_type: 'single_select', options: [{ name: { raw: 'Todo' } }, { name: { raw: 'In Progress' } }] }], headers: {} }
      : { data: [{ number: 5, title: 'Roadmap', state: 'open' }], headers: {} });
    arrange(request);
    expect(await adapter.discover(owner, 'Organization', 'secret')).toEqual({ status: 'observed', candidates: [{
      number: 5, title: 'Roadmap', owner, url: 'https://github.com/orgs/acme/projects/5', statusOptions: ['Todo', 'In Progress'],
    }] });
    expect(request).toHaveBeenCalledWith('GET /orgs/{org}/projectsV2', { org: owner, per_page: 50 });
    expect(request).toHaveBeenCalledWith('GET /orgs/{org}/projectsV2/{project_number}/fields', { org: owner, project_number: 5, per_page: 100 });
    expect(request.mock.calls.every(([route]) => route.startsWith('GET '))).toBe(true);
  });

  test('uses bounded cursor pagination and marks inaccessible Status options as unverified', async () => {
    const request = jest.fn().mockResolvedValueOnce({ data: [{ number: 2, title: 'First' }],
      headers: { link: '<https://api.github.com/orgs/acme/projectsV2?after=cursor2>; rel="next"' } })
      .mockResolvedValueOnce({ data: [{ number: 3, title: 'Second' }], headers: {} })
      .mockResolvedValueOnce({ data: [], headers: {} })
      .mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403 }));
    arrange(request);
    const result = await adapter.discover(owner, 'Organization', 'secret');
    expect(result).toMatchObject({ status: 'observed', candidates: [
      { number: 2, title: 'First' }, { number: 3, title: 'Second' },
    ] });
    expect(result.candidates.every(candidate => candidate.statusOptions === undefined)).toBe(true);
    expect(request).toHaveBeenNthCalledWith(2, 'GET /orgs/{org}/projectsV2', { org: owner, per_page: 50, after: 'cursor2' });
  });

  test('distinguishes personal-owner unsupported, empty, denied and provider unavailable', async () => {
    expect(await adapter.discover(owner, 'User', 'secret')).toEqual({ status: 'unsupported', candidates: [] });
    expect(github.getOctokit).not.toHaveBeenCalled();
    arrange(jest.fn().mockResolvedValue({ data: [], headers: {} }));
    expect(await adapter.discover(owner, 'Organization', 'secret')).toEqual({ status: 'empty', candidates: [] });
    arrange(jest.fn().mockRejectedValue(Object.assign(new Error('denied'), { status: 403 })));
    expect(await adapter.discover(owner, 'Organization', 'secret')).toEqual({ status: 'permission-denied', candidates: [] });
    arrange(jest.fn().mockRejectedValue(new Error('offline')));
    expect(await adapter.discover(owner, 'Organization', 'secret')).toEqual({ status: 'unavailable', candidates: [] });
  });

  test('ignores closed, malformed and unsafe Project rows', async () => {
    arrange(jest.fn().mockResolvedValue({ data: [
      { number: 1, title: 'Closed', state: 'closed' }, { number: 0, title: 'Zero' },
      { number: 2, title: '<script>' }, { number: 3, title: 'Safe' },
    ], headers: {} }));
    const result = await adapter.discover(owner, 'Organization', 'secret');
    expect(result.candidates.map(candidate => candidate.number)).toEqual([3]);
  });
});
