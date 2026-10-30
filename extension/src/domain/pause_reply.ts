import { decodeHistoryValue, exactHistoryFields as fields } from './history_decode.ts';
import { copyTemporaryPauses, planTemporaryPauseChange } from './temporary_pauses.ts';
import type { PauseControlView, PauseTabChoice, PauseTabList } from './temporary_pause_controls.ts';
import type { PauseReviewOutcome, PauseReviewPlan, PauseReviewPreview, PauseReviewTarget } from './temporary_pause_review.ts';
import { settingsOperationId } from './settings_operation.ts';
import { natural } from './value.ts';

const label = (value: unknown): value is string | null => value === null || typeof value === 'string' && value.trim().length > 0 && value.length <= 240 && !/[\p{Cc}\p{Cf}]/u.test(value);
export function samePauseSnapshot(left: unknown, right: unknown): boolean {
    const before = copyTemporaryPauses(left); const after = copyTemporaryPauses(right);
    return before !== null && after !== null && JSON.stringify(before) === JSON.stringify(after);
}
function tabChoice(value: unknown): value is PauseTabChoice { return fields(value, ['tabId', 'label']) && natural(value.tabId) && label(value.label); }
function tabList(value: unknown): value is PauseTabList {
    return fields(value, ['state', 'tabs', 'limited']) && value.state === 'ready' && typeof value.limited === 'boolean'
        && Array.isArray(value.tabs) && value.tabs.length <= 128 && value.tabs.every(tabChoice)
        && new Set(value.tabs.map(tab => tab.tabId)).size === value.tabs.length
        || fields(value, ['state']) && (value.state === 'unavailable' || value.state === 'stale');
}
export function decodePauseControl(value: unknown): PauseControlView | null {
    return decodeHistoryValue(value, (v): v is PauseControlView => fields(v, ['state', 'loaded', 'precaution', 'pending', 'targets'])
        && v.state === 'ready' && typeof v.precaution === 'boolean' && typeof v.pending === 'boolean' && tabList(v.targets)
        && (fields(v.loaded, ['state', 'value']) && v.loaded.state === 'ready' && copyTemporaryPauses(v.loaded.value) !== null
            || fields(v.loaded, ['state']) && ['future', 'corrupt', 'unavailable'].includes(v.loaded.state as string)));
}
function target(value: unknown): value is PauseReviewTarget {
    return fields(value, ['kind']) && (value.kind === 'emergency' || value.kind === 'precaution')
        || fields(value, ['kind', 'tabId', 'label']) && value.kind === 'tab' && natural(value.tabId) && label(value.label);
}
function plan(value: unknown): value is PauseReviewPlan {
    if (!fields(value, ['state', 'operationId', 'revision', 'expiresAt', 'action', 'before', 'after', 'precautionBefore', 'precautionAfter', 'target'])
        || value.state !== 'preview' || !settingsOperationId(value.operationId) || !natural(value.revision) || !natural(value.expiresAt)
        || typeof value.precautionBefore !== 'boolean' || typeof value.precautionAfter !== 'boolean' || !target(value.target)) return false;
    const before = copyTemporaryPauses(value.before); const after = copyTemporaryPauses(value.after);
    if (!before || !after || before.revision !== value.revision) return false;
    if (value.action === 'adopt-observed') return value.target.kind === 'precaution' && value.precautionBefore && !value.precautionAfter && samePauseSnapshot(before, after);
    if (value.action !== 'change' || value.target.kind === 'precaution' || value.precautionBefore !== value.precautionAfter) return false;
    const intent = value.target.kind === 'tab' ? { type: 'tab' as const, tabId: value.target.tabId, paused: after.tabs.includes(value.target.tabId) }
        : { type: 'emergency' as const, paused: after.emergency };
    if (!intent.paused && value.precautionBefore) return false;
    const change = planTemporaryPauseChange(before, intent, value.revision);
    return change.state === 'ready' && samePauseSnapshot(change.after, after);
}
export function decodePausePreview(value: unknown): PauseReviewPreview | null {
    return decodeHistoryValue(value, (v): v is PauseReviewPreview => plan(v)
        || fields(v, ['state', 'reason']) && v.state === 'invalid' && ['invalid-input', 'capacity', 'overflow'].includes(v.reason as string)
        || fields(v, ['state']) && ['denied', 'stale', 'conflict', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'expired', 'precaution'].includes(v.state as string));
}
export function decodePauseOutcome(value: unknown): PauseReviewOutcome | null {
    return decodeHistoryValue(value, (v): v is PauseReviewOutcome =>
        fields(v, ['state', 'revision', 'acknowledgement', 'current']) && v.state === 'committed' && natural(v.revision)
            && ['accepted', 'unknown'].includes(v.acknowledgement as string) && typeof v.current === 'boolean'
        || fields(v, ['state', 'revision', 'current']) && v.state === 'reconciled' && natural(v.revision) && typeof v.current === 'boolean'
        || fields(v, ['state', 'acknowledgement', 'observation', 'observedRevision', 'current']) && v.state === 'unknown'
            && ['accepted', 'unknown'].includes(v.acknowledgement as string) && ['different', 'unavailable'].includes(v.observation as string)
            && (v.observedRevision === null || natural(v.observedRevision)) && typeof v.current === 'boolean'
        || fields(v, ['state']) && ['invalid', 'conflict', 'stale', 'unavailable', 'future', 'corrupt', 'busy', 'unchanged', 'denied', 'expired', 'cancelled', 'pending', 'not-submitted'].includes(v.state as string));
}
export function pauseOutcomeMatches(plan: PauseReviewPlan, value: PauseReviewOutcome): boolean {
    return value.state === 'committed' ? plan.action === 'change' && value.revision === plan.after.revision
        : value.state === 'reconciled' ? plan.action === 'adopt-observed' && value.revision === plan.before.revision
            : value.state !== 'unknown' || plan.action === 'change';
}
