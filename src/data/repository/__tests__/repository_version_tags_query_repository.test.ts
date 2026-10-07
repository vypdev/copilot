import { RepositoryVersionTagsQueryRepository } from '../release/repository_version_tags_query_repository';

function fixture() {
  const listTags = jest.fn();
  const getClient = jest.fn(() => ({ rest: { repos: { listTags } } }));
  return { listTags, getClient, repository: new RepositoryVersionTagsQueryRepository({ getClient }) };
}

describe('remote setup version tags', () => {
  it('uses the supplied PAT and greatest numeric version, ignoring moving aliases and unrelated tags', async () => {
    const { repository, listTags, getClient } = fixture();
    listTags.mockResolvedValue({ data: ['v1', 'v2', 'v3', 'v9.1.0', '10.0.0', 'v3.12.1', 'prefix99.0.0', 'v01.2.3', 'v9007199254740992.1.0'].map(name => ({ name })) });
    expect(await repository.getLatestTag('owner', 'repo', 'setup-fixture')).toBe('10.0.0');
    expect(getClient).toHaveBeenCalledWith('setup-fixture');
    expect(listTags).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', page: 1, per_page: 100 });
  });

  it('reads later pages before choosing the greatest version', async () => {
    const { repository, listTags } = fixture();
    listTags.mockResolvedValueOnce({ data: Array.from({ length: 100 }, (_, index) => ({ name: `v1.0.${index}` })) })
      .mockResolvedValueOnce({ data: [{ name: 'v20.0.0' }] });
    expect(await repository.getLatestTag('owner', 'repo', 'fixture')).toBe('20.0.0');
    expect(listTags).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
  });

  it.each([{ data: [] }, { data: [{ name: 'v3' }, { name: 'not-a-version' }] }])('returns absence only for a completed inventory without semantic version tags: %j', async ({ data }) => {
    const { repository, listTags } = fixture();
    listTags.mockResolvedValue({ data });
    expect(await repository.getLatestTag('owner', 'repo', 'fixture')).toBeUndefined();
  });

  it.each([{ data: null }, { data: [{}] }, { data: [{ name: 12 }] }])('rejects malformed inventory instead of authorizing an initial tag: %j', async ({ data }) => {
    const { repository, listTags } = fixture();
    listTags.mockResolvedValue({ data });
    await expect(repository.getLatestTag('owner', 'repo', 'fixture')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
  });

  it('propagates a failed later page rather than treating a partial inventory as absence', async () => {
    const { repository, listTags } = fixture();
    listTags.mockResolvedValueOnce({ data: Array.from({ length: 100 }, () => ({ name: 'v3' })) }).mockRejectedValueOnce(new Error('denied'));
    await expect(repository.getLatestTag('owner', 'repo', 'fixture')).rejects.toThrow('denied');
  });

  it('stops at the inspection bound without reporting absence', async () => {
    const { repository, listTags } = fixture();
    listTags.mockResolvedValue({ data: Array.from({ length: 100 }, () => ({ name: 'v3' })) });
    await expect(repository.getLatestTag('owner', 'repo', 'fixture')).rejects.toMatchObject({ code: 'provider.contract-invalid' });
    expect(listTags).toHaveBeenCalledTimes(100);
  });
});
