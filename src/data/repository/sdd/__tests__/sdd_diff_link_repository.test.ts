import { SddDiffLinkRepository } from '../sdd_diff_link_repository';

const binding = { owner: 'acme', repository: 'demo', repositoryId: 17, token: 'bound-test-token' };
const head = 'a'.repeat(40);
const repository = () => ({ databaseId: 17, nameWithOwner: 'acme/demo' });
function response(numbers: number[] = [42]) {
  return { repository: { ...repository(), pullRequest: { number: 99, headRefOid: head, headRefName: 'feature/42', headRepository: repository(), repository: repository(),
    closingIssuesReferences: { totalCount: numbers.length, pageInfo: { hasNextPage: false },
      nodes: numbers.map(number => ({ number, author: { login: 'issue-author' }, repository: repository() })) } } } };
}
function fixture(data: unknown = response(), selectedBinding = binding) {
  const graphql = jest.fn().mockResolvedValue(data);
  const getClient = jest.fn().mockReturnValue({ graphql });
  return { graphql, getClient, adapter: new SddDiffLinkRepository({ getClient }, selectedBinding) };
}

describe('exact native closing issues for SDD structural comparison', () => {
  it.each([[], [42], [43, 42], Array.from({ length: 100 }, (_, index) => index + 1)].map(numbers => ({ numbers })))('retains a complete bounded native inventory of $numbers', ({ numbers }) => {
    const f = fixture(response(numbers));
    return expect(f.adapter.readClosingIssues(99)).resolves.toEqual({ state: 'verified', pullNumber: 99, headSha: head, headBranch: 'feature/42',
      issueNumbers: [...numbers].sort((left, right) => left - right), issueAuthors: Object.fromEntries(numbers.map(number => [number, 'issue-author'])) });
  });
  it('binds the exact PR request and transport token without requesting content or mutations', async () => {
    const f = fixture(); await f.adapter.readClosingIssues(99);
    expect(f.getClient).toHaveBeenCalledWith(binding.token);
    expect(f.graphql).toHaveBeenCalledTimes(1);
    expect(f.graphql).toHaveBeenCalledWith(expect.stringContaining('closingIssuesReferences(first: 100)'), { owner: 'acme', repo: 'demo', number: 99 });
    expect(f.graphql.mock.calls[0][0]).not.toMatch(/\b(?:mutation|body|title|labels)\b/u);
  });
  it('returns an immutable result independent from provider ordering and future binding mutation', async () => {
    const mutable = { ...binding }; const f = fixture(response([43, 42]), mutable); mutable.repository = 'other';
    const result = await f.adapter.readClosingIssues(99);
    expect(result.state).toBe('verified'); expect(Object.isFrozen(result)).toBe(true);
    if (result.state === 'verified') { expect(Object.isFrozen(result.issueNumbers)).toBe(true); expect(Object.isFrozen(result.issueAuthors)).toBe(true); }
    expect(f.graphql.mock.calls[0][1].repo).toBe('demo');
  });
  it('accepts GitHub repository casing while retaining exact numeric identity', async () => {
    const data = response(); data.repository.nameWithOwner = 'AcMe/DeMo';
    data.repository.pullRequest.repository.nameWithOwner = 'ACME/DEMO';
    data.repository.pullRequest.closingIssuesReferences.nodes[0].repository.nameWithOwner = 'Acme/Demo';
    await expect(fixture(data).adapter.readClosingIssues(99)).resolves.toMatchObject({ state: 'verified' });
  });
  it.each([null, [], 'opaque', {}])('does not infer native authority from missing or malformed top-level data %s', data =>
    expect(fixture(data).adapter.readClosingIssues(99)).resolves.toEqual({ state: 'unavailable' }));
  it.each(['repository ID', 'repository name', 'PR repository ID', 'PR repository name', 'fork head ID', 'fork head name', 'deleted head repository', 'head branch missing', 'head branch unsafe', 'head branch overlong', 'PR number', 'head missing', 'head malformed',
    'page incomplete', 'page missing', 'count missing', 'count mismatch', 'nodes missing', 'too many nodes', 'null node',
    'foreign issue repository', 'wrong issue repository ID', 'unsafe issue number', 'missing issue author', 'empty issue author', 'oversized issue author', 'duplicate issue'])('withholds a %s inventory', async scenario => {
    const data: any = response(); const pull = data.repository.pullRequest; const links = pull.closingIssuesReferences;
    if (scenario === 'repository ID') data.repository.databaseId = 18;
    if (scenario === 'repository name') data.repository.nameWithOwner = 'foreign/demo';
    if (scenario === 'PR repository ID') pull.repository.databaseId = 18;
    if (scenario === 'PR repository name') pull.repository.nameWithOwner = 'acme/other';
    if (scenario === 'fork head ID') pull.headRepository.databaseId = 18;
    if (scenario === 'fork head name') pull.headRepository.nameWithOwner = 'foreign/demo';
    if (scenario === 'deleted head repository') pull.headRepository = null;
    if (scenario === 'head branch missing') delete pull.headRefName;
    if (scenario === 'head branch unsafe') pull.headRefName = 'feature/42\nforged';
    if (scenario === 'head branch overlong') pull.headRefName = 'a'.repeat(251);
    if (scenario === 'PR number') pull.number = 42;
    if (scenario === 'head missing') delete pull.headRefOid;
    if (scenario === 'head malformed') pull.headRefOid = 'unverified';
    if (scenario === 'page incomplete') links.pageInfo.hasNextPage = true;
    if (scenario === 'page missing') delete links.pageInfo;
    if (scenario === 'count missing') delete links.totalCount;
    if (scenario === 'count mismatch') links.totalCount = 2;
    if (scenario === 'nodes missing') delete links.nodes;
    if (scenario === 'too many nodes') Object.assign(links, response(Array.from({ length: 101 }, (_, index) => index + 1)).repository.pullRequest.closingIssuesReferences);
    if (scenario === 'null node') links.nodes[0] = null;
    if (scenario === 'foreign issue repository') links.nodes[0].repository.nameWithOwner = 'foreign/demo';
    if (scenario === 'wrong issue repository ID') links.nodes[0].repository.databaseId = 18;
    if (scenario === 'unsafe issue number') links.nodes[0].number = Number.MAX_SAFE_INTEGER + 1;
    if (scenario === 'missing issue author') links.nodes[0].author = null;
    if (scenario === 'empty issue author') links.nodes[0].author.login = ' ';
    if (scenario === 'oversized issue author') links.nodes[0].author.login = 'a'.repeat(101);
    if (scenario === 'duplicate issue') { links.nodes.push(links.nodes[0]); links.totalCount = 2; }
    await expect(fixture(data).adapter.readClosingIssues(99)).resolves.toEqual({ state: 'unavailable' });
  });
  it.each([0, -1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid event PR %s before provider access', async number => {
    const f = fixture(); await expect(f.adapter.readClosingIssues(number)).resolves.toEqual({ state: 'unavailable' });
    expect(f.getClient).not.toHaveBeenCalled();
  });
  it.each([{ ...binding, repositoryId: 0 }, { ...binding, owner: 'foreign/name' }, { ...binding, repository: '..' }])('rejects invalid bound repository %s before provider access', async selected => {
    const f = fixture(response(), selected); await expect(f.adapter.readClosingIssues(99)).resolves.toEqual({ state: 'unavailable' });
    expect(f.getClient).not.toHaveBeenCalled();
  });
  it('contains provider denial without leaking its message or falling back to body numbers', async () => {
    const f = fixture(); f.graphql.mockRejectedValue({ status: 403, message: 'PRIVATE-TRANSPORT-DETAIL' });
    await expect(f.adapter.readClosingIssues(99)).resolves.toEqual({ state: 'unavailable' });
    expect(f.graphql).toHaveBeenCalledTimes(1);
  });
});
