import type { CenterIdentity } from '../domain/center_reply.ts';
import type { CenterMessage } from '../domain/center_protocol.ts';

function same(before: CenterIdentity, after: CenterIdentity | null): boolean {
    return (['clientId', 'controllerEpoch', 'credentialEpoch', 'role'] as const).every(key => after?.[key] === before[key]);
}
/** Private transport binding only; no native selectors enter a public observation-change event. */
export async function readCurrentOperation(owner: CenterIdentity | null, stopped: boolean,
    request: (message: Extract<CenterMessage, { method: 'center.operation.read' }>) => Promise<Record<string, unknown> | null>, current: () => CenterIdentity | null): Promise<Record<string, unknown> | null> {
    if (stopped || !owner) return null;
    const value = await request({ version: 1, method: 'center.operation.read', clientId: owner.clientId });
    return same(owner, current()) ? value : null;
}
/** Same private native binding as other observations, with a fixed metadata-only request. */
export async function readHelperSample(owner: CenterIdentity | null, stopped: boolean,
    request: (message: Extract<CenterMessage, { method: 'center.health.read' }>) => Promise<Record<string, unknown> | null>, current: () => CenterIdentity | null): Promise<Record<string, unknown> | null> {
    if (stopped || !owner) return null;
    const value = await request({ version: 1, method: 'center.health.read', clientId: owner.clientId });
    return same(owner, current()) ? value : null;
}
export function observationContextChanged(before: CenterIdentity, after: CenterIdentity, changed?: () => void): void {
    if (!same(before, after)) { try { changed?.(); } catch { /* Secondary readers cannot poison primary preferences/connections. */ } }
}
