import { ProbeFailure, probeJsonRecord, type SetupPermissionProbeHttp } from './setup_permission_probe_http';

export function selectedProjectNumbers(selection: string): number[] | undefined {
    const values = selection.split(',');
    return values.length >= 1 && values.length <= 10 && new Set(values).size === values.length
        && values.every(value => /^[1-9][0-9]*$/u.test(value) && Number.isSafeInteger(Number(value))
            && Number(value) <= 2_147_483_647) ? values.map(Number) : undefined;
}

/** A disposable Project proves the grant; these reads additionally prove the selected Project roles. */
export async function requireSelectedProjectsWriteAccess(
    owner: string, selection: string, http: SetupPermissionProbeHttp,
): Promise<void> {
    const numbers = selectedProjectNumbers(selection);
    if (!numbers) throw new ProbeFailure('The approved Project selection was not a bounded list of numbers.');
    for (const number of numbers) {
        const body = await probeJsonRecord(await http.expect('https://api.github.com/graphql', 'POST', [200], {
            query: 'query($owner:String!,$number:Int!){organization(login:$owner){login projectV2(number:$number){number viewerCanUpdate}}}',
            variables: { owner, number },
        }));
        if (body.errors !== undefined) throw new ProbeFailure('GitHub could not verify selected Project write access.');
        const organization = child(child(body, 'data'), 'organization');
        const project = child(organization, 'projectV2');
        if (typeof organization.login !== 'string' || organization.login.toLowerCase() !== owner.toLowerCase()
            || project.number !== number || typeof project.viewerCanUpdate !== 'boolean') {
            throw new ProbeFailure('GitHub did not confirm the exact selected Project write access.');
        }
        if (!project.viewerCanUpdate) throw new ProbeFailure(
            `The workflow PAT cannot update selected Project #${number}. Grant its account write access to that Project.`,
            undefined, false, true);
    }
}

function child(parent: Record<string, unknown>, key: string): Record<string, unknown> {
    const value = parent[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new ProbeFailure('GitHub returned an invalid selected Project access response.');
    }
    return value as Record<string, unknown>;
}
