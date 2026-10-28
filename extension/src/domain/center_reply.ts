import type { Settings } from './settings.ts';
import { validSettings } from './settings.ts';
import type { SettingsOwnerFence, SettingsReceipt, SettingsPreview, SettingsOperationOutcome } from './settings_result.ts';
import { sameSettingsContent, settingsOperationId } from './settings_operation.ts';
import { MAX_CENTER_RESPONSE_BYTES } from './center_protocol.ts';
import { deepFreeze, jsonBytesWithin, keys, natural, record } from './value.ts';

export interface CenterIdentity extends SettingsOwnerFence { readonly clientId: string; readonly role: 'editor' | 'observer' }
export interface CenterDocument {
    readonly identity: CenterIdentity; readonly state: 'ready' | 'future' | 'corrupt' | 'migration-required';
    readonly settings: Settings | null; readonly rollbackAvailable: boolean; readonly lastOperation: SettingsReceipt | null;
}
export type CenterPlan = Extract<SettingsPreview, { state: 'preview' }>;
const identityKeys = ['state', 'clientId', 'role', 'controllerEpoch', 'credentialEpoch'];
const actions = ['profile-create', 'profile-edit', 'profile-select', 'profile-deselect', 'profile-remove', 'preferences', 'appearance',
    'center-preferences', 'repository-preferences', 'import', 'rollback', 'reset-global', 'reset-profiles', 'reset-appearance', 'reset-repository', 'reset-all'];
const reasons = ['invalid-input', 'profile-invalid', 'profile-capacity', 'profile-not-found', 'profile-conflict', 'future-schema', 'pause-protected', 'no-rollback'];
const copied = <T>(value: T): T => deepFreeze(JSON.parse(JSON.stringify(value)) as T);

/** A stale or mixed installed build never becomes authority for this view. */
export function centerPayload(value: unknown, expectedSource: string): Record<string, unknown> | null {
    if (!record(value) || !jsonBytesWithin(value, MAX_CENTER_RESPONSE_BYTES) || value.sourceTree !== expectedSource
        || !(expectedSource === 'unbundled' || /^[a-f0-9]{64}$(?![\s\S])/u.test(expectedSource))) return null;
    const { sourceTree: _source, ...body } = value;
    return body;
}
function identity(value: Record<string, unknown>): CenterIdentity | null {
    return value.state === 'ready' && settingsOperationId(value.clientId) && (value.role === 'editor' || value.role === 'observer')
        && natural(value.controllerEpoch) && natural(value.credentialEpoch)
        ? { clientId: value.clientId, role: value.role, controllerEpoch: value.controllerEpoch, credentialEpoch: value.credentialEpoch } : null;
}
export function decodeCenterIdentity(value: unknown): CenterIdentity | null {
    return record(value) && keys(value, identityKeys) ? identity(value) : null;
}
export function decodeCenterDocument(value: unknown): CenterDocument | null {
    if (!record(value) || !keys(value, [...identityKeys, 'loaded', 'rollbackAvailable', 'lastOperation'])) return null;
    const owner = identity(value); const loaded = value.loaded;
    if (!owner || !record(loaded) || !keys(loaded, ['state', 'settings', 'migrated']) || !validSettings(loaded.settings)
        || typeof loaded.migrated !== 'boolean' || typeof value.rollbackAvailable !== 'boolean'
        || !['ready', 'future', 'invalid'].includes(loaded.state as string)) return null;
    const receipt = value.lastOperation;
    if (receipt !== null && (!record(receipt) || !keys(receipt, ['id', 'beforeRevision']) || !settingsOperationId(receipt.id)
        || !natural(receipt.beforeRevision) || loaded.settings.revision !== receipt.beforeRevision + 1)) return null;
    if (loaded.state !== 'ready' && (loaded.migrated || value.rollbackAvailable || receipt !== null)) return null;
    return copied({ identity: owner, state: loaded.state === 'future' ? 'future' : loaded.state === 'invalid' ? 'corrupt'
        : loaded.migrated ? 'migration-required' : 'ready', settings: loaded.state === 'ready' ? loaded.settings : null,
        rollbackAvailable: value.rollbackAvailable, lastOperation: receipt as SettingsReceipt | null });
}
export function decodeCenterPreview(value: unknown): SettingsPreview | null {
    if (!record(value)) return null;
    if (value.state !== 'preview') {
        if (value.state === 'invalid') return keys(value, ['state', 'reason']) && reasons.includes(value.reason as string) ? copied(value) as unknown as SettingsPreview : null;
        return keys(value, ['state']) && ['unchanged', 'denied', 'stale', 'conflict', 'unavailable', 'future', 'corrupt', 'busy', 'migration-required'].includes(value.state as string)
            ? copied(value) as unknown as SettingsPreview : null;
    }
    return keys(value, ['state', 'operationId', 'revision', 'expiresAt', 'action', 'before', 'after']) && settingsOperationId(value.operationId)
        && natural(value.revision) && natural(value.expiresAt) && actions.includes(value.action as string)
        && validSettings(value.before) && validSettings(value.after) && value.before.revision === value.revision
        && value.after.revision === value.revision && !sameSettingsContent(value.before, value.after)
        ? copied(value) as unknown as CenterPlan : null;
}
export function decodeCenterOutcome(value: unknown): SettingsOperationOutcome | null {
    if (!record(value)) return null;
    if (value.state === 'committed') return keys(value, ['state', 'revision', 'acknowledgement', 'current']) && natural(value.revision)
        && ['accepted', 'unknown'].includes(value.acknowledgement as string) && typeof value.current === 'boolean' ? copied(value) as unknown as SettingsOperationOutcome : null;
    if (value.state === 'replayed') return keys(value, ['state', 'revision']) && natural(value.revision) ? copied(value) as unknown as SettingsOperationOutcome : null;
    if (value.state === 'unknown') return keys(value, ['state', 'observedRevision', 'acknowledgement', 'observation'])
        && (value.observedRevision === null || natural(value.observedRevision)) && ['accepted', 'unknown'].includes(value.acknowledgement as string)
        && ['unchanged', 'changed', 'unavailable'].includes(value.observation as string) ? copied(value) as unknown as SettingsOperationOutcome : null;
    return keys(value, ['state']) && ['conflict', 'invalid', 'stale', 'unavailable', 'expired', 'cancelled', 'pending', 'denied'].includes(value.state as string)
        ? copied(value) as unknown as SettingsOperationOutcome : null;
}
