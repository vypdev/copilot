import { requireSelectedProjectsWriteAccess, selectedProjectNumbers } from '../setup_permission_projects_access';
import { SetupPermissionProbeHttp } from '../setup_permission_probe_http';

describe('selected workflow Project access', () => {
    it.each(['', '0', '01', '1,1', '1, 2', '2147483648', '1,2,3,4,5,6,7,8,9,10,11'])(
        'rejects an invalid or unbounded selection %s before requesting GitHub', async selection => {
            const fetcher = jest.fn();
            expect(selectedProjectNumbers(selection)).toBeUndefined();
            await expect(requireSelectedProjectsWriteAccess('owner', selection, new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
                .rejects.toThrow('bounded list');
            expect(fetcher).not.toHaveBeenCalled();
        });

    it('checks every selected Project number and authenticated role without changing an existing Project', async () => {
        const fetcher = jest.fn(async (_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
            const { variables } = JSON.parse(String(init?.body));
            return new Response(JSON.stringify({ data: { organization: {
                login: 'OWNER', projectV2: { number: variables.number, viewerCanUpdate: true },
            } } }));
        });
        await requireSelectedProjectsWriteAccess('owner', '7,9', new SetupPermissionProbeHttp(fetcher, 'workflow-pat', 1000));
        expect(fetcher).toHaveBeenCalledTimes(2);
        for (const [url, init] of fetcher.mock.calls) {
            expect(url).toBe('https://api.github.com/graphql');
            expect(JSON.parse(String(init?.body)).query).toMatch(/^query\(/u);
            expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer workflow-pat');
        }
    });

    it.each([
        { data: { organization: { login: 'owner', projectV2: { number: 7, viewerCanUpdate: false } } } },
        { data: { organization: { login: 'other', projectV2: { number: 7, viewerCanUpdate: true } } } },
        { data: { organization: { login: 'owner', projectV2: { number: 8, viewerCanUpdate: true } } } },
        { data: { organization: { login: 'owner', projectV2: { number: 7 } } } },
        { data: { organization: null } },
        { errors: [{ message: 'sensitive provider diagnostic' }] },
    ])('blocks denied, mismatched, missing or malformed selected-Project access %j', async body => {
        const fetcher = jest.fn().mockResolvedValue(new Response(JSON.stringify(body)));
        await expect(requireSelectedProjectsWriteAccess('owner', '7', new SetupPermissionProbeHttp(fetcher, 'fixture', 1000)))
            .rejects.toThrow(/selected Project|selected Project access/u);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });
});
