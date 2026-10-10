import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';
import { requireRepositoryOrganizationOwner } from '../setup_permission_organization_owner';

const valid = { id: 123, full_name: 'OWNER/REPO', owner: { login: 'OWNER', type: 'Organization' } };
const response = (payload: unknown) => ({ status: 200, ok: true, json: async () => payload }) as Response;

describe('early organization Write scope', () => {
    test('accepts only the actual repository organization owner, ignoring case', async () => {
        const fetcher = jest.fn().mockResolvedValue(response(valid));
        await requireRepositoryOrganizationOwner('owner', 'repo', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000));
        expect(fetcher).toHaveBeenCalledWith('https://api.github.com/repos/owner/repo', expect.objectContaining({ method: 'GET' }));
    });
    test.each([
        { ...valid, id: 0 }, { ...valid, id: '123' }, { ...valid, full_name: undefined },
        { ...valid, full_name: 'owner/other' }, { ...valid, owner: null }, { ...valid, owner: [] },
        { ...valid, owner: 'owner' }, { ...valid, owner: { type: 'Organization' } },
        { ...valid, owner: { login: 'other', type: 'Organization' } },
        { ...valid, owner: { login: 'owner', type: 'User' } },
    ])('rejects an unconfirmed or foreign owner', async payload => {
        const fetcher = jest.fn().mockResolvedValue(response(payload));
        await expect(requireRepositoryOrganizationOwner('owner', 'repo',
            new SetupPermissionProbeHttp(fetcher, 'fixture', 1000))).rejects.toThrow('confirmed organization owner');
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
