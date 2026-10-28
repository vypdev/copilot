import type { CenterClientView } from './center_client_view.ts';
import type { CenterLocation } from './center_routes.ts';
import type { CenterReview, ReviewChange } from './center_review.ts';
import type { CenterCopy } from './center_copy_types.ts';
import { centerCopy } from './center_copy.ts';
import { deepFreeze, record } from './value.ts';

export interface CenterFrame {
    readonly client: CenterClientView; readonly location: CenterLocation; readonly pendingLocation: CenterLocation | null;
    readonly copy: CenterCopy; readonly review: CenterReview | null; readonly draftEpoch: number; readonly hasDraft: boolean;
}
/** Complete local preference delta, including removals. Input is validated credential-free Settings. */
export function settingsReviewChanges(before: unknown, after: unknown, copy: CenterCopy): readonly ReviewChange[] {
    const changes: ReviewChange[] = [];
    const fields: Readonly<Record<string, string>> = { ...copy.routes, ...copy.messages };
    const label = (path: readonly string[]) => path.map(key => Object.hasOwn(fields, key) ? fields[key] : key).join(' › ');
    const localized = new Set(['theme', 'density', 'text', 'motion', 'contrast', 'locale']);
    const text = (value: unknown, path: readonly string[]): string => value === undefined ? copy.messages.unset
        : typeof value === 'boolean' ? copy.messages[value ? 'yes' : 'no']
            : typeof value === 'string' && localized.has(path[path.length - 1]) && Object.hasOwn(fields, value) ? fields[value]
                : typeof value === 'object' && value !== null ? copy.messages.inherit : String(value);
    function walk(old: unknown, next: unknown, path: readonly string[]): void {
        if (old === next) return;
        if (record(old) || record(next) || Array.isArray(old) || Array.isArray(next)) {
            const left = old !== null && typeof old === 'object' ? old as Record<string, unknown> : {};
            const right = next !== null && typeof next === 'object' ? next as Record<string, unknown> : {};
            const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
            if (keys.length === 0 && (old === undefined || next === undefined)) changes.push({ id: path.join('/'), label: label(path), before: text(old, path), after: text(next, path) });
            for (const key of keys) walk(left[key], right[key], [...path, key]);
            return;
        }
        changes.push({ id: path.join('/'), label: label(path), before: text(old, path), after: text(next, path) });
    }
    walk(before, after, []); return deepFreeze(changes);
}
export function centerFrame(client: CenterClientView, location: CenterLocation, pendingLocation: CenterLocation | null, nativeLanguage: string, draftEpoch = 0, hasDraft = false): CenterFrame {
    const copy = centerCopy(client.data?.settings?.locale ?? 'auto', nativeLanguage);
    const plan = client.review;
    const review: CenterReview | null = plan ? { state: plan.state, title: copy.messages.reviewTitle,
        summary: copy.messages.reviewSummary, revision: plan.revision,
        editable: client.data?.role === 'editor' && client.issue === null,
        changes: settingsReviewChanges(plan.before, plan.after, copy) } : null;
    return deepFreeze({ client, location, pendingLocation, copy, review, draftEpoch, hasDraft });
}
