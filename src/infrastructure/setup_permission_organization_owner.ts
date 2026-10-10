import { ProbeFailure, probeJsonRecord, SetupPermissionProbeHttp } from './setup_permission_probe_http';

/** Bind early organization transactions to the actual selected repository owner. */
export async function requireRepositoryOrganizationOwner(
    owner: string, repository: string, http: SetupPermissionProbeHttp,
): Promise<void> {
    const metadata = await probeJsonRecord(await http.expect(
        `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}`, 'GET', [200]));
    const account = metadata.owner;
    if (!Number.isSafeInteger(metadata.id) || (metadata.id as number) <= 0
        || typeof metadata.full_name !== 'string'
        || metadata.full_name.toLowerCase() !== `${owner}/${repository}`.toLowerCase()
        || !account || typeof account !== 'object' || Array.isArray(account)
        || typeof (account as Record<string, unknown>).login !== 'string'
        || ((account as Record<string, unknown>).login as string).toLowerCase() !== owner.toLowerCase()
        || (account as Record<string, unknown>).type !== 'Organization') {
        throw new ProbeFailure('Organization write tests require a confirmed organization owner for the selected repository.');
    }
}
