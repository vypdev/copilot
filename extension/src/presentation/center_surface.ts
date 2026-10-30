import type { PauseRouteProps } from '../domain/pause_ui.ts';
import type { Component } from 'svelte';
import type { CenterFrame } from '../domain/center_frame.ts';
import type { CenterRoute } from '../domain/center_routes.ts';
import type { CenterActions, CenterRouteProps, InventoryRouteProps, PrivacyRouteProps, SupportRouteProps } from '../domain/center_ui.ts';
import type { SupportRoute } from '../domain/support_context.ts';
import type { HistoryRouteProps } from '../domain/history_ui.ts';
export interface CenterSurface {
    readonly initial: CenterFrame;
    readonly actions: CenterActions;
    subscribe(listener: (frame: CenterFrame) => void): () => void;
    load(route: Exclude<CenterRoute, 'features' | 'privacy' | 'activity' | 'diagnostics' | SupportRoute>, detail?: string): Promise<Component<CenterRouteProps>>;
    loadInventory(detail?: string): Promise<Component<InventoryRouteProps>>;
    loadPrivacy(): Promise<Component<PrivacyRouteProps>>;
    loadSupport(): Promise<Component<SupportRouteProps>>;
    loadPauses(): Promise<Component<PauseRouteProps>>;
    loadHistory(): Promise<Component<HistoryRouteProps>>;
}
