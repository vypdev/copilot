import { keys, record } from './value.ts';
import { localIdentifier } from './center_routes.ts';
import { repositoryAddress, sessionName } from './session_vault_entries.ts';
import { optionalRoleCredential, writePurpose, type WritePurpose } from './credential_roles.ts';

export type ConnectionIntent = { readonly type: 'connect'; readonly name: string; readonly secret: string; readonly repository: string }
    | { readonly type: 'connect-role'; readonly purpose: WritePurpose; readonly name: string; readonly secret: string; readonly repository: string }
    | { readonly type: 'select'; readonly id: string; readonly repository?: string }
    | { readonly type: 'remove'; readonly id: string }
    | { readonly type: 'disable-role'; readonly purpose: WritePurpose }
    | { readonly type: 'disconnect' } | { readonly type: 'revoke-all' };

/** Existing read intents cannot acquire an extra role field or be silently promoted. */
export function connectionIntent(value: unknown): value is ConnectionIntent {
    if (!record(value)) return false;
    if (value.type === 'disconnect' || value.type === 'revoke-all') return keys(value, ['type']) && Object.keys(value).length === 1;
    if (value.type === 'disable-role') return keys(value, ['type', 'purpose']) && Object.keys(value).length === 2 && writePurpose(value.purpose);
    if (value.type === 'remove') return keys(value, ['type', 'id']) && Object.keys(value).length === 2 && localIdentifier(value.id);
    if (value.type === 'select') return keys(value, ['type', 'id', 'repository']) && localIdentifier(value.id)
        && Object.keys(value).length === (Object.hasOwn(value, 'repository') ? 3 : 2)
        && (!Object.hasOwn(value, 'repository') || repositoryAddress(value.repository));
    const fields = value.type === 'connect-role' ? ['type', 'purpose', 'name', 'secret', 'repository'] : ['type', 'name', 'secret', 'repository'];
    return (value.type === 'connect' || value.type === 'connect-role' && writePurpose(value.purpose) && optionalRoleCredential(value.secret))
        && keys(value, fields) && Object.keys(value).length === fields.length && sessionName(value.name)
        && typeof value.secret === 'string' && /^[A-Za-z0-9_]{8,255}$(?![\s\S])/u.test(value.secret) && repositoryAddress(value.repository);
}
