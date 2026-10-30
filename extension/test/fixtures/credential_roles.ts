import type { SessionPurpose } from '../../src/domain/credential_roles.ts';
import type { PurposeSessionEntry } from '../../src/domain/session_vault_entries.ts';
import type { PurposeSessionVault, ReadSessionVault } from '../../src/domain/purpose_session_vault.ts';
import { CONNECTED } from './runtime.ts';

export function purposeEntry(role: SessionPurpose, id: string = role, name: string = id): PurposeSessionEntry {
    return { id, name, host: 'github.com', role, connection: { ...CONNECTED, schemaVersion: 1,
        secret: `github_pat_synthetic_${role.replaceAll('-', '_')}_not_a_real_credential` } };
}
export function readRoleVault(): ReadSessionVault {
    return { schemaVersion: 1, revision: 3, selected: 'read', entries: [{ ...purposeEntry('repository-read', 'read', 'Work read'), role: 'repository-read' }] };
}
export function purposeVault(): PurposeSessionVault {
    return { schemaVersion: 2, revision: 4, selected: 'read', writeSelections: { 'issues-write': 'issues', 'actions-write': null },
        entries: [readRoleVault().entries[0], purposeEntry('issues-write', 'issues', 'Issue triage'), purposeEntry('actions-write', 'actions', 'Run controls')] };
}
