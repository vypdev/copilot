import { getProjectItemId, getProjectItemIdByContentId, isProjectContentLinked } from '../project_board_item_query';
import { setProjectBoardSingleSelectField } from '../project_board_field_update';
import { ProjectDetail } from '../../../model/project_detail';
import type { GithubGraphqlTransportClient } from '../../../../infrastructure/github/ports/github_graphql_transport_port';

jest.mock('../../../../utils/logger', () => ({ logDebugInfo: jest.fn(), logError: jest.fn() }));
const project = new ProjectDetail({ id: 'PVT_board', title: 'Board', url: 'https://github.com/orgs/owner/projects/1', type: 'organization', owner: 'owner', number: 1 });
const page = (nodes: unknown[], more = false, cursor: string | null = null) => ({ nodes, pageInfo: { hasNextPage: more, endCursor: cursor } });
const linked = { id: 'PVTI_exact', project: { id: project.id }, content: { id: 'CONTENT_exact' } };
const source = (kind = 'PullRequest', items: unknown = page([linked])) => ({ id: 'CONTENT_exact', __typename: kind, projectItems: items });
function queryHarness(fallback: unknown = source()) {
  const graphql = jest.fn(async (document: string) => {
    if (document.includes('issueOrPullRequest(number:')) return { repository: { issueOrPullRequest: { id: 'CONTENT_exact' } } };
    if (document.includes('projectItems(first:')) return { node: fallback };
    return { node: { items: page([]) } };
  });
  return { graphql, client: { graphql } as unknown as GithubGraphqlTransportClient };
}

describe('bounded content-side project membership recovery', () => {
  it.each(['Issue', 'PullRequest'])('recovers %s membership omitted by the board list', async kind => {
    const h = queryHarness(source(kind));
    await expect(getProjectItemId(h.client, project, 'owner', 'repo', 42)).resolves.toBe('PVTI_exact');
    expect(h.graphql).toHaveBeenCalledTimes(3);
    expect(h.graphql.mock.calls[2][0]).toContain('projectItems(first: 100');
  });
  it('reuses the same recovered item during linkage instead of adding another', async () => {
    const h = queryHarness();
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).resolves.toBe('PVTI_exact');
    expect(h.graphql).toHaveBeenCalledTimes(2);
  });
  it('continues once to a second content membership page', async () => {
    const h = queryHarness(); let reads = 0;
    h.graphql.mockImplementation(async document => document.includes('projectItems(first:')
      ? { node: source('Issue', ++reads === 1 ? page([], true, 'next') : page([linked])) }
      : { node: { items: page([]) } });
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).resolves.toBe('PVTI_exact');
    expect(reads).toBe(2);
  });
  it('retains truthful absence when neither view contains the item', async () => {
    const h = queryHarness(source('Issue', page([])));
    await expect(getProjectItemId(h.client, project, 'owner', 'repo', 42)).rejects.toThrow('is not in project');
  });
  it.each(['wrong-content', 'wrong-kind', 'missing-connection', 'null-node', 'malformed-page', 'bad-item'])('rejects %s evidence', async kind => {
    let node: unknown = source();
    if (kind === 'wrong-content') node = { ...source(), id: 'FOREIGN' };
    if (kind === 'wrong-kind') node = source('DraftIssue');
    if (kind === 'missing-connection') node = { id: 'CONTENT_exact', __typename: 'Issue' };
    if (kind === 'null-node') node = null;
    if (kind === 'malformed-page') node = source('Issue', { nodes: [], pageInfo: null });
    if (kind === 'bad-item') node = source('Issue', page([{ ...linked, id: '' }]));
    const h = queryHarness(node);
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).rejects.toThrow();
  });
  it('rejects continued pagination after two recovery pages', async () => {
    const h = queryHarness(source('Issue', page([], true, 'next')));
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).rejects.toThrow('stopped after 2 pages');
    expect(h.graphql).toHaveBeenCalledTimes(3);
  });
  it('does not retry permission errors from the first board view', async () => {
    const h = queryHarness(); h.graphql.mockRejectedValue(new Error('403 forbidden'));
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).rejects.toThrow('403 forbidden');
    expect(h.graphql).toHaveBeenCalledTimes(1);
  });
  it('does not accept membership in a different Project or for different content', async () => {
    const h = queryHarness(source('Issue', page([{ ...linked, project: { id: 'OTHER' } }, { ...linked, content: { id: 'OTHER' } }])));
    await expect(getProjectItemIdByContentId(h.client, project, 'CONTENT_exact')).resolves.toBeUndefined();
  });
});

describe('read-only membership for a newly opened PR', () => {
  it('recognizes a linked PR from the recovered exact content membership', async () => {
    const h = queryHarness();
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).resolves.toBe(true);
  });
  it('returns false only after both bounded membership views prove absence', async () => {
    const h = queryHarness(source('PullRequest', page([])));
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).resolves.toBe(false);
    expect(h.graphql).toHaveBeenCalledTimes(3);
  });
  it('rejects missing repository content rather than inventing pending membership', async () => {
    const h = queryHarness(); h.graphql.mockResolvedValue({ repository: { issueOrPullRequest: null } } as never);
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).rejects.toThrow('content identity');
  });
  it('propagates denied membership reads', async () => {
    const h = queryHarness(); h.graphql.mockRejectedValue(new Error('403 forbidden'));
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).rejects.toThrow('403 forbidden');
  });
  it('rejects malformed content-side membership rather than treating it as absent', async () => {
    const h = queryHarness(source('PullRequest', { nodes: [], pageInfo: null }));
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).rejects.toThrow('malformed');
  });
  it.each([0, Number.NaN])('refuses unsafe native content identity %s before reading', async number => {
    const h = queryHarness();
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', number)).rejects.toThrow('safe content identity');
    expect(h.graphql).not.toHaveBeenCalled();
  });
  it('does not claim membership from a different Project or content', async () => {
    const h = queryHarness(source('PullRequest', page([{ ...linked, project: { id: 'OTHER' } }, { ...linked, content: { id: 'OTHER' } }])));
    await expect(isProjectContentLinked(h.client, project, 'owner', 'repo', 99)).resolves.toBe(false);
  });
});

function fieldHarness(node: unknown) {
  const graphql = jest.fn(async (document: string) => {
    if (document.includes('mutation(')) return { updateProjectV2ItemFieldValue: { projectV2Item: { id: 'PVTI_exact' } } };
    if (document.includes('fieldValueByName(name: $fieldName)')) return { node };
    if (document.includes('fields(first:')) return { node: { fields: page([{ id: 'FIELD_size', name: 'Size', options: [{ id: 'OPTION_m', name: 'M' }] }]) } };
    return { node: { items: page([]) } };
  });
  const client = { graphql } as unknown as GithubGraphqlTransportClient;
  const update = () => setProjectBoardSingleSelectField({ getProjectItemId: async () => 'PVTI_exact' }, { getClient: () => client }, project, 'owner', 'repo', 42, 'Size', 'M', 'token');
  return { graphql, update };
}
const item = (value: unknown = null) => ({ id: 'PVTI_exact', __typename: 'ProjectV2Item', project: { id: project.id }, fieldValueByName: value });
describe('direct exact-item field recovery', () => {
  it('updates an unset field even when the item is absent from the board list', async () => {
    const h = fieldHarness(item()); await expect(h.update()).resolves.toBe(true);
    const mutations = h.graphql.mock.calls.filter(([q]) => q.includes('mutation(')); expect(mutations).toHaveLength(1);
  });
  it('keeps a matching field unchanged on replay', async () => {
    const h = fieldHarness(item({ optionId: 'OPTION_m' })); await expect(h.update()).resolves.toBe(false);
    expect(h.graphql.mock.calls.some(([q]) => q.includes('mutation('))).toBe(false);
  });
  it.each(['null', 'wrong-item', 'wrong-project', 'wrong-kind', 'missing-value', 'bad-option'])('refuses %s direct item before mutation', async kind => {
    let node: unknown = item();
    if (kind === 'null') node = null;
    if (kind === 'wrong-item') node = { ...item(), id: 'OTHER' };
    if (kind === 'wrong-project') node = { ...item(), project: { id: 'OTHER' } };
    if (kind === 'wrong-kind') node = { ...item(), __typename: 'Issue' };
    if (kind === 'missing-value') node = { id: 'PVTI_exact', __typename: 'ProjectV2Item', project: { id: project.id } };
    if (kind === 'bad-option') node = item({ optionId: '' });
    const h = fieldHarness(node); await expect(h.update()).rejects.toThrow();
    expect(h.graphql.mock.calls.some(([q]) => q.includes('mutation('))).toBe(false);
  });
});
