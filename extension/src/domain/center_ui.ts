import type { Settings } from './settings.ts';
import type { CenterCopy } from './center_copy_types.ts';
import type { CenterLocation } from './center_routes.ts';
import type { ReviewActions } from './center_review.ts';
import type { ConnectionActions } from './connection_ui.ts';
import type { ConnectionOutcome } from './named_sessions.ts';
import type { InventoryNavigationState } from './inventory_filters.ts';
import type { PermissionInspection } from './permission_inspection.ts';
import type { PrivacyConnection } from './privacy_context.ts';

export interface CenterActions extends ReviewActions {
    readonly connections: ConnectionActions;
    preview(intent: unknown, revision: number): void;
    dirty(value: boolean): void;
    takeControl(): void;
    stay(): void;
    leave(): void;
    exportSettings(): Promise<boolean>;
    importSettings(revision: number): Promise<boolean>;
    focusContent(): void;
    browseInventory(value: InventoryNavigationState): void;
    inspectPermissions(): void;
    inspectConnection(): void;
}
export interface CenterRouteContext {
    readonly connections?: ConnectionOutcome | null;
    readonly settings: Settings; readonly copy: CenterCopy; readonly editable: boolean;
    readonly location: CenterLocation; readonly rollbackAvailable: boolean;
    readonly inventory: InventoryNavigationState; readonly hasDraft: boolean;
}
export interface CenterRouteProps { context: CenterRouteContext; actions: CenterActions }
/** Static discovery stays available without an editable or invented settings document. */
export type InventoryRouteContext = Omit<CenterRouteContext, 'settings'> & { readonly settings: Settings | null };
export interface InventoryRouteProps { context: InventoryRouteContext; actions: CenterActions }
export interface PrivacyRouteProps {
    context: { readonly copy: CenterCopy; readonly inspection: PermissionInspection; readonly connection: PrivacyConnection; readonly canInspectConnection: boolean };
    actions: Pick<CenterActions, 'inspectPermissions' | 'inspectConnection'>;
}
