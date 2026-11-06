import type { ConnectionOutcome, ConnectionSummary } from './named_sessions.ts';
import { deepFreeze } from './value.ts';

export interface RelocationTarget {
    readonly entry: ConnectionSummary;
    readonly revision: number;
}
export function captureRelocation(entry: ConnectionSummary, revision: number): RelocationTarget {
    return deepFreeze({ entry: { ...entry }, revision });
}
/** A draft names one saved purpose/identity, never a different private target after a refresh. */
export function relocationTarget(view: ConnectionOutcome | null, id: string): RelocationTarget | null {
    if (view?.state !== 'ready') return null;
    const entry = view.entries.find(value => value.id === id);
    return entry ? captureRelocation(entry, view.revision) : null;
}
export function relocationSource(view: ConnectionOutcome | null, target: RelocationTarget): RelocationTarget | null {
    const source = relocationTarget(view, target.entry.id);
    return source && source.entry.host === target.entry.host && source.entry.role === target.entry.role
        && source.entry.viewerId === target.entry.viewerId && source.entry.repositoryId === target.entry.repositoryId ? source : null;
}
