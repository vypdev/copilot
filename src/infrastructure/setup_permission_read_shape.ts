import type { SetupTokenPermissionProbe } from '../domain/setup_token_permissions';

const record = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && !Array.isArray(value);
const collection = (value: unknown): boolean => Array.isArray(value) && value.every(record);

/** A 200 with a malformed payload is not capability evidence or an empty inventory. */
export function hasSetupPermissionReadShape(probe: SetupTokenPermissionProbe, payload: unknown): boolean {
    if (probe === 'metadata') return record(payload) && typeof payload.private === 'boolean';
    if (probe === 'administration') return record(payload) && typeof payload.enabled === 'boolean';
    if (['contents', 'issues', 'pull-requests', 'workflows', 'issue-types'].includes(probe)) {
        return collection(payload);
    }
    const field = { actions: 'workflows', checks: 'check_runs', variables: 'variables', secrets: 'secrets' }[probe as string];
    return field !== undefined && record(payload) && collection(payload[field]);
}
