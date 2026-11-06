import { centerLocationHash, parseCenterLocation, type CenterRoute } from './center_routes.ts';
import { journalFact } from './journal_facts.ts';
import { decodeHistoryValue, exactHistoryFields } from './history_decode.ts';
import { natural, record } from './value.ts';

export interface CenterDestination { readonly route: CenterRoute; readonly featureId?: string }
export interface RecentsPermit { readonly state: 'ready'; readonly permit: string | null; readonly epoch: number | null; readonly sequence: number }
export interface VisitDeliveryView { readonly pending: number; readonly dropped: number; readonly incomplete: boolean }
export const EMPTY_VISIT_DELIVERY: VisitDeliveryView = Object.freeze({ pending: 0, dropped: 0, incomplete: false });
export const recentsPermitId = (value: unknown): value is string => typeof value === 'string' && /^visit-[a-f0-9]{32}$(?![\s\S])/u.test(value);
export function validCenterDestination(value: unknown): value is CenterDestination {
    return record(value) && journalFact('recents', { ...value, kind: 'destination' }) && !Object.hasOwn(value, 'kind');
}
/** Project a validated local route before IPC: private profile details never leave the application. */
export function centerDestination(location: unknown): CenterDestination | null {
    const hash = centerLocationHash(location); if (hash === null) return null;
    const parsed = parseCenterLocation(hash)!;
    return Object.freeze({ route: parsed.route, ...(parsed.route === 'features' && parsed.detail ? { featureId: parsed.detail } : {}) });
}
export function decodeRecentsPermit(value: unknown): RecentsPermit | null {
    return decodeHistoryValue(value, (candidate): candidate is RecentsPermit => exactHistoryFields(candidate, ['state', 'permit', 'epoch', 'sequence'])
        && candidate.state === 'ready' && (candidate.epoch === null || natural(candidate.epoch))
        && natural(candidate.sequence) && (candidate.permit === null ? candidate.sequence === 0 : recentsPermitId(candidate.permit) && candidate.epoch !== null));
}
export function observedVisit(value: unknown): boolean { return exactHistoryFields(value, ['state']) && value.state === 'observed'; }
