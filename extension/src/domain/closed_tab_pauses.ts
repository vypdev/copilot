import { copyTemporaryPauses, type TemporaryPausePlan } from './temporary_pauses.ts';
import { deepFreeze, natural } from './value.ts';

/** Native tab closure expires only those tab scopes, never emergency, live tabs or an extra precaution. */
export function planClosedTabPauses(value: unknown, closedIds: unknown): TemporaryPausePlan {
    const before = copyTemporaryPauses(value);
    if (!before || !Array.isArray(closedIds) || closedIds.length > 128 || Object.keys(closedIds).length !== closedIds.length
        || !closedIds.every(natural) || new Set(closedIds).size !== closedIds.length) return { state: 'invalid', reason: 'invalid-input' };
    const closed = new Set(closedIds); const tabs = before.tabs.filter(id => !closed.has(id));
    if (tabs.length === before.tabs.length) return { state: 'unchanged' };
    if (before.revision === Number.MAX_SAFE_INTEGER) return { state: 'invalid', reason: 'overflow' };
    return deepFreeze({ state: 'ready', before, after: { ...before, revision: before.revision + 1, tabs } });
}
