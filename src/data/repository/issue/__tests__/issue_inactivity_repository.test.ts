import { IssueInactivityRepository } from '../issue_inactivity_repository';
import type { GithubIssueInactivityClient } from '../../../../infrastructure/github/ports/github_issue_provider_ports';

describe('IssueInactivityRepository', () => {
    it('lists open issues by waiting label and maps issue activity metadata', async () => {
        const listForRepo = jest.fn();
        const iterator = jest.fn(async function* () {
            yield {
                data: [
                    {
                        number: 42,
                        updated_at: '2026-08-28T00:00:00.000Z',
                        labels: [{ name: 'state:awaiting-maintainer' }, 'bug'],
                    },
                    {
                        number: 43,
                        updated_at: null,
                        pull_request: {},
                        labels: [],
                    },
                ],
            };
        });
        const client: GithubIssueInactivityClient = {
            paginate: {
                iterator,
            },
            rest: {
                issues: {
                    listForRepo,
                    get: jest.fn(),
                },
            },
        };
        const repository = new IssueInactivityRepository({ getClient: () => client });

        const issues = await repository.listOpenIssuesByLabel('owner', 'repo', 'state:awaiting-maintainer', 'token');

        expect(iterator).toHaveBeenCalledWith(listForRepo, {
            owner: 'owner',
            repo: 'repo',
            state: 'open',
            labels: 'state:awaiting-maintainer',
            sort: 'updated',
            direction: 'asc',
            per_page: 100,
        });
        expect(issues).toEqual([
            {
                number: 42,
                updatedAt: '2026-08-28T00:00:00.000Z',
                isPullRequest: false,
                labels: ['state:awaiting-maintainer', 'bug'],
            },
            {
                number: 43,
                updatedAt: undefined,
                isPullRequest: true,
                labels: [],
            },
        ]);
    });

    it('returns no issue when the revalidation request is already closed', async () => {
        const get = jest.fn().mockResolvedValue({ data: { number: 42, state: 'closed' } });
        const client = {
            paginate: { iterator: async function* () {} },
            rest: { issues: { listForRepo: jest.fn(), get } },
        } as unknown as GithubIssueInactivityClient;
        const repository = new IssueInactivityRepository({ getClient: () => client });

        await expect(repository.getOpenIssue('owner', 'repo', 42, 'token')).resolves.toBeUndefined();
        expect(get).toHaveBeenCalledWith({ owner: 'owner', repo: 'repo', issue_number: 42 });
    });

    it('maps an open issue returned during revalidation', async () => {
        const get = jest.fn().mockResolvedValue({
            data: {
                number: 42,
                state: 'open',
                updated_at: '2026-08-28T00:00:00.000Z',
                labels: [{ name: 'state:awaiting-issue-author' }],
            },
        });
        const client = {
            paginate: { iterator: async function* () {} },
            rest: { issues: { listForRepo: jest.fn(), get } },
        } as unknown as GithubIssueInactivityClient;
        const repository = new IssueInactivityRepository({ getClient: () => client });

        await expect(repository.getOpenIssue('owner', 'repo', 42, 'token')).resolves.toEqual({
            number: 42,
            updatedAt: '2026-08-28T00:00:00.000Z',
            isPullRequest: false,
            labels: ['state:awaiting-issue-author'],
        });
    });

    it('fails closed when GitHub returns an invalid issue number', async () => {
        const client: GithubIssueInactivityClient = {
            paginate: {
                iterator: async function* () {
                    yield { data: [{ number: 0 }] };
                },
            },
            rest: { issues: { listForRepo: jest.fn(), get: jest.fn() } },
        };
        const repository = new IssueInactivityRepository({ getClient: () => client });

        await expect(repository.listOpenIssuesByLabel('owner', 'repo', 'state:awaiting-maintainer', 'token'))
            .rejects.toThrow('invalid issue number');
    });
});
