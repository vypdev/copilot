import type { Settings } from './settings.ts';
import type { CenterCopy } from './center_copy_types.ts';
import type { CenterLocation } from './center_routes.ts';
import type { ReviewActions } from './center_review.ts';
import type { ConnectionActions } from './connection_ui.ts';
import type { ConnectionOutcome } from './named_sessions.ts';

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
}
export interface CenterRouteContext {
    readonly connections?: ConnectionOutcome | null;
    readonly settings: Settings; readonly copy: CenterCopy; readonly editable: boolean;
    readonly location: CenterLocation; readonly rollbackAvailable: boolean;
}
export interface CenterRouteProps { context: CenterRouteContext; actions: CenterActions }
