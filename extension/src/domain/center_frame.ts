import type { ConnectionOutcome } from './named_sessions.ts';
import { workspaceReviewChanges } from './workspace_review.ts';
import type { CenterClientView } from './center_client_view.ts';
import type { CenterLocation } from './center_routes.ts';
import type { CenterReview, ReviewChange } from './center_review.ts';
import type { CenterCopy } from './center_copy_types.ts';
import { centerCopy } from './center_copy.ts';
import { deepFreeze, record } from './value.ts';
import { EMPTY_INVENTORY_NAVIGATION, type InventoryNavigationState } from './inventory_filters.ts';
import { EMPTY_PERMISSION_INSPECTION, type PermissionInspection } from './permission_inspection.ts';
import { CENTER_COMMANDS, centerCommandRoute, type CenterBinding } from './shortcuts.ts';
import { UNKNOWN_PACKAGE_IDENTITY, type PackageIdentity } from './package_identity.ts';
import { welcomeCopy } from './welcome_copy.ts';
import { EMPTY_HISTORY_VIEW, type HistoryClientView } from './history_client_view.ts';
import { EMPTY_VISIT_DELIVERY, type VisitDeliveryView } from './center_visits.ts';
import { EMPTY_CURRENT_OPERATION, type CurrentOperationView } from './current_operation.ts';
import { EMPTY_HELPER_SAMPLE, type HelperSampleView } from './helper_sample_view.ts';

export interface CenterFrame {
    readonly client: CenterClientView; readonly location: CenterLocation; readonly pendingLocation: CenterLocation | null;
    readonly copy: CenterCopy; readonly review: CenterReview | null; readonly draftEpoch: number; readonly hasDraft: boolean;
    readonly inventory: InventoryNavigationState;
    readonly inspection: PermissionInspection;
    readonly packageIdentity: PackageIdentity;
    readonly history: HistoryClientView;
    readonly visits: VisitDeliveryView;
    readonly operation: CurrentOperationView;
    readonly helperSample: HelperSampleView;
}
/** Complete local preference delta, including removals. Input is validated credential-free Settings. */
export function settingsReviewChanges(before: unknown, after: unknown, copy: CenterCopy, connections?: ConnectionOutcome | null): readonly ReviewChange[] {
    const changes: ReviewChange[] = [];
    const workspace = workspaceReviewChanges(before, after, copy.locale, connections);
    const welcome = welcomeCopy(copy.locale);
    const fields: Readonly<Record<string, string>> = { ...copy.routes, ...copy.messages, onboarding: welcome.progress };
    const label = (path: readonly string[]) => path.map(key => Object.hasOwn(fields, key) ? fields[key] : key).join(' › ');
    const localized = new Set(['theme', 'density', 'text', 'motion', 'contrast', 'locale']);
    const text = (value: unknown, path: readonly string[]): string => value === undefined ? copy.messages.unset
        : typeof value === 'boolean' ? copy.messages[value ? 'yes' : 'no']
        : typeof value === 'string' && path.join('/') === 'center/onboarding' && Object.hasOwn(welcome.steps, value) ? welcome.steps[value as keyof typeof welcome.steps]
            : typeof value === 'string' && localized.has(path[path.length - 1]) && Object.hasOwn(fields, value) ? fields[value]
                : typeof value === 'object' && value !== null ? copy.messages.inherit : String(value);
    function walk(old: unknown, next: unknown, path: readonly string[]): void {
        if (workspace && path.join('/') === 'center/workspaces') { changes.push(...workspace); return; }
        if (workspace && path.join('/') === 'center/selectedWorkspace') return;
        if (old === next) return;
        if (path.join('/') === 'center/bindings') {
            const before = old as readonly CenterBinding[]; const after = next as readonly CenterBinding[];
            for (const command of CENTER_COMMANDS) {
                const left = before.find(binding => binding.command === command)?.binding;
                const right = after.find(binding => binding.command === command)?.binding;
                if (left !== right) changes.push({ id: `center/bindings/${command}`, label: `${copy.routes.shortcuts} › ${copy.routes[centerCommandRoute(command)]}`,
                    before: left ?? copy.messages.unset, after: right ?? copy.messages.unset });
            }
            return;
        }
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
export function centerFrame(client: CenterClientView, location: CenterLocation, pendingLocation: CenterLocation | null, nativeLanguage: string, draftEpoch = 0, hasDraft = false, inventory = EMPTY_INVENTORY_NAVIGATION, inspection = EMPTY_PERMISSION_INSPECTION, packageIdentity = UNKNOWN_PACKAGE_IDENTITY, history = EMPTY_HISTORY_VIEW, visits = EMPTY_VISIT_DELIVERY, operation = EMPTY_CURRENT_OPERATION, helperSample = EMPTY_HELPER_SAMPLE): CenterFrame {
    const copy = centerCopy(client.data?.settings?.locale ?? 'auto', nativeLanguage);
    const plan = client.review;
    const review: CenterReview | null = plan ? { state: plan.state, title: copy.messages.reviewTitle,
        summary: copy.messages.reviewSummary, revision: plan.revision,
        editable: client.data?.role === 'editor' && client.issue === null,
        changes: settingsReviewChanges(plan.before, plan.after, copy, client.connections) } : null;
    return deepFreeze({ client, location, pendingLocation, copy, review, draftEpoch, hasDraft, inventory, inspection, packageIdentity, history, visits, operation, helperSample });
}
