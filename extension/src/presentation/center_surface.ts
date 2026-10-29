import type { Component } from 'svelte';
import type { CenterFrame } from '../domain/center_frame.ts';
import type { CenterRoute } from '../domain/center_routes.ts';
import type { CenterActions, CenterRouteProps, InventoryRouteProps } from '../domain/center_ui.ts';
export interface CenterSurface {
    readonly initial: CenterFrame;
    readonly actions: CenterActions;
    subscribe(listener: (frame: CenterFrame) => void): () => void;
    load(route: Exclude<CenterRoute, 'features'>, detail?: string): Promise<Component<CenterRouteProps>>;
    loadInventory(detail?: string): Promise<Component<InventoryRouteProps>>;
}
