import { GithubPublicationSourceRepository } from '../github_publication_source_repository';

describe('GitHub publication source repository', () => {
    it('returns a canonical authoritative branch head', async () => {
        const getRef = jest.fn().mockResolvedValue({ data: { object: { sha: 'A'.repeat(40) } } });
        const repository = new GithubPublicationSourceRepository({
            getClient: () => ({ rest: { git: { getRef } } }),
        } as never);

        await expect(repository.getBranchHeadSha('acme', 'widgets', 'feature/work', 'token'))
            .resolves.toBe('a'.repeat(40));
        expect(getRef).toHaveBeenCalledWith({ owner: 'acme', repo: 'widgets', ref: 'heads/feature/work' });
    });

    it.each([undefined, 'not-a-sha', '0'.repeat(40)])(
        'rejects an invalid provider object ID: %s',
        async (sha) => {
            const repository = new GithubPublicationSourceRepository({
                getClient: () => ({ rest: { git: { getRef: jest.fn().mockResolvedValue({ data: { object: { sha } } }) } } }),
            } as never);

            await expect(repository.getBranchHeadSha('acme', 'widgets', 'feature/work', 'token'))
                .rejects.toMatchObject({ code: 'provider.contract-invalid' });
        },
    );
});
