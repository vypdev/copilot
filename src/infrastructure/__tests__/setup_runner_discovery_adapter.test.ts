import { SetupRunnerDiscoveryAdapter } from '../setup_runner_discovery_adapter';
import type { SetupBatchGithubTransport } from '../setup_batch_github_read_adapter';

const runner = (id = 1) => ({ id, status: 'online', busy: false, labels: [{ name: 'self-hosted' }, { name: 'Linux' }, { name: 'codex' }] });
const group = { id: 3, name: 'vypdev', restricted_to_workflows: false };
function fixture(options: { local?: unknown; groups?: unknown; members?: unknown; reject?: string } = {}) {
  const call = jest.fn(async (_token: string, route: string, _parameters: Record<string, unknown>): Promise<unknown> => {
    if (route.includes(options.reject ?? 'never-reject')) throw new Error('denied');
    if (route.includes('/repos/')) return options.local === undefined ? { total_count: 0, runners: [] } : options.local;
    if (route.endsWith('/runner-groups')) return options.groups ?? { total_count: 1, runner_groups: [group] };
    return options.members ?? { total_count: 1, runners: [runner()] };
  });
  return { call, adapter: new SetupRunnerDiscoveryAdapter({ call } as unknown as SetupBatchGithubTransport) };
}
describe('optional bounded GET-only runner discovery', () => {
  test('confirms repository eligibility through the filtered group endpoint', async () => {
    const { adapter, call } = fixture(); const inventory = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(inventory.status).toBe('available'); expect(inventory.groups).toEqual([{ name: 'vypdev', access: 'confirmed' }]);
    expect(inventory.candidates[0]).toMatchObject({ id: 1, group: 'vypdev', access: 'confirmed', labels: ['self-hosted', 'Linux', 'codex'] });
    expect(call.mock.calls.every(([, route]) => route.startsWith('GET '))).toBe(true);
    expect(call).toHaveBeenCalledWith('fixture', 'GET /orgs/{org}/actions/runner-groups', { org: 'vypdev', visible_to_repository: 'platform', per_page: 100, page: 1 });
  });
  test('workflow/ref restrictions prevent confirmed access', async () => {
    const { adapter } = fixture({ groups: { total_count: 1, runner_groups: [{ ...group, restricted_to_workflows: true }] } });
    const result = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(result.groups[0].access).toBe('unknown'); expect(result.candidates[0].access).toBe('unknown');
  });
  test('a group 403 is not an empty inventory or a request for wider permissions', async () => {
    const { adapter, call } = fixture({ reject: '/orgs/' });
    expect(await adapter.discover('vypdev', 'platform', 'fixture', 'Organization')).toEqual({ status: 'unavailable', candidates: [], groups: [] });
    expect(call).toHaveBeenCalledTimes(2);
  });
  test('local evidence is retained but marked incomplete if organization access is denied', async () => {
    const { adapter } = fixture({ local: { total_count: 1, runners: [runner(5)] }, reject: '/orgs/' });
    const result = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(result.status).toBe('incomplete'); expect(result.candidates[0]).toMatchObject({ id: 5, access: 'confirmed' });
  });
  test('personal repositories do not request organization APIs', async () => {
    const { adapter, call } = fixture({ local: { total_count: 1, runners: [runner()] } });
    expect((await adapter.discover('user', 'repo', 'fixture', 'User')).status).toBe('available'); expect(call).toHaveBeenCalledTimes(1);
  });
  test('unknown owner type cannot establish complete discovery', async () => {
    const { adapter } = fixture(); expect((await adapter.discover('owner', 'repo', 'fixture', 'Unknown')).status).toBe('unavailable');
  });
  test('failed local inventory does not hide discovered group evidence', async () => {
    const { adapter } = fixture({ reject: '/repos/' }); const result = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(result.status).toBe('incomplete'); expect(result.groups).toHaveLength(1);
  });
  test('inaccessible group capacity is incomplete', async () => {
    const { adapter } = fixture({ reject: 'runner_group_id' });
    expect((await adapter.discover('vypdev', 'platform', 'fixture', 'Organization')).status).toBe('incomplete');
  });
  test.each([
    null, [], { total_count: -1, runners: [] }, { total_count: 1_001, runners: [] },
    { total_count: 1, runners: 'no' }, { total_count: 0, runners: Array(101).fill(runner()) },
    { total_count: 2, runners: [runner(), runner()] }, { total_count: 1, runners: [{ ...runner(), id: 0 }] },
    { total_count: 1, runners: [] }, { total_count: 0, runners: [runner()] },
    { total_count: 1, runners: [{ ...runner(), status: 'future' }] },
    { total_count: 1, runners: [{ ...runner(), busy: 'yes' }] },
    { total_count: 1, runners: [{ ...runner(), labels: [] }] },
    { total_count: 1, runners: [{ ...runner(), labels: Array(101).fill({ name: 'label' }) }] },
    { total_count: 1, runners: [{ ...runner(), labels: [{ name: 'x\n' }] }] },
    { total_count: 1, runners: [{ ...runner(), labels: [{ name: 3 }] }] },
    { total_count: 1, runners: [{ ...runner(), labels: [{ name: 'Linux' }, { name: 'linux' }] }] },
  ])('malformed local collection cannot establish absence or readiness %#', async local => {
    const { adapter } = fixture({ local }); expect((await adapter.discover('user', 'repo', 'fixture', 'User')).status).toBe('unavailable');
  });
  test.each([
    { total_count: 1, runner_groups: [{ ...group, id: 0 }] },
    { total_count: 1, runner_groups: [{ ...group, name: '\u001b[31m' }] },
    { total_count: 1, runner_groups: [{ ...group, restricted_to_workflows: undefined }] },
    { total_count: 2, runner_groups: [group, { ...group, id: 4 }] },
    { total_count: 11, runner_groups: Array.from({ length: 11 }, (_, i) => ({ ...group, id: i + 1, name: `group-${i}` })) },
  ])('invalid groups or excessive fan-out cannot certify access %#', async groups => {
    const { adapter } = fixture({ groups }); expect((await adapter.discover('vypdev', 'platform', 'fixture', 'Organization')).status).not.toBe('available');
  });
  test('reads at most ten pages for the 1,000-runner bound', async () => {
    const call = jest.fn(async (_token: string, _route: string, parameters: Record<string, unknown>) => ({ total_count: 1_000,
      runners: Array.from({ length: 100 }, (_, index) => runner((Number(parameters.page) - 1) * 100 + index + 1)) }));
    const adapter = new SetupRunnerDiscoveryAdapter({ call } as unknown as SetupBatchGithubTransport);
    expect((await adapter.discover('user', 'repo', 'fixture', 'User')).candidates).toHaveLength(1_000); expect(call).toHaveBeenCalledTimes(10);
  });
  test('pagination rejects a changed total', async () => {
    const call = jest.fn(async (_token: string, _route: string, parameters: Record<string, unknown>) => ({ total_count: parameters.page === 1 ? 101 : 100,
      runners: Array.from({ length: 100 }, (_, index) => runner(index + 1)) }));
    const adapter = new SetupRunnerDiscoveryAdapter({ call } as unknown as SetupBatchGithubTransport);
    expect((await adapter.discover('user', 'repo', 'fixture', 'User')).status).toBe('unavailable'); expect(call).toHaveBeenCalledTimes(2);
  });
  test('combined local/group inventory stops at the 1,000-runner bound', async () => {
    const call = jest.fn(async (_token: string, route: string, parameters: Record<string, unknown>) => {
      if (route.includes('/repos/')) return { total_count: 1, runners: [runner(99_999)] };
      if (route.endsWith('/runner-groups')) return { total_count: 10, runner_groups: Array.from({ length: 10 }, (_, i) => ({ ...group, id: i + 1, name: `pool-${i}` })) };
      return { total_count: 100, runners: Array.from({ length: 100 }, (_, i) => runner(Number(parameters.runner_group_id) * 1_000 + i + 1)) };
    });
    const adapter = new SetupRunnerDiscoveryAdapter({ call } as unknown as SetupBatchGithubTransport);
    const inventory = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(inventory.status).toBe('incomplete'); expect(inventory.candidates).toHaveLength(901); expect(call).toHaveBeenCalledTimes(12);
  });
  test('an exhausted local inventory budget does not fan out through group runners', async () => {
    const call = jest.fn(async (_token: string, route: string, parameters: Record<string, unknown>) => route.includes('/repos/')
      ? { total_count: 1_000, runners: Array.from({ length: 100 }, (_, i) => runner((Number(parameters.page) - 1) * 100 + i + 1)) }
      : { total_count: 1, runner_groups: [group] });
    const adapter = new SetupRunnerDiscoveryAdapter({ call } as unknown as SetupBatchGithubTransport);
    const inventory = await adapter.discover('vypdev', 'platform', 'fixture', 'Organization');
    expect(inventory.status).toBe('incomplete'); expect(inventory.candidates).toHaveLength(1_000); expect(call).toHaveBeenCalledTimes(11);
    expect(call.mock.calls.some(([, route]) => route.includes('runner_group_id'))).toBe(false);
  });
});
