import type { Component } from 'svelte';
import type { CenterRoute } from '../domain/center_routes.ts';
import type { CenterRouteProps, InventoryRouteProps } from '../domain/center_ui.ts';
/** Every operand is a packaged literal; no location, imported setting or message supplies an import URL. */
export async function loadCenterPage(route: Exclude<CenterRoute, 'features'>): Promise<Component<CenterRouteProps>> {
    switch (route) {
        case 'overview': return (await import('../presentation/OverviewPage.svelte')).default;
        case 'appearance': return (await import('../presentation/AppearancePage.svelte')).default;
        case 'language': return (await import('../presentation/LanguagePage.svelte')).default;
        case 'profiles': return (await import('../presentation/ProfilesPage.svelte')).default;
        case 'data': return (await import('../presentation/DataPage.svelte')).default;
        default: return (await import('../presentation/InformationPage.svelte')).default;
    }
}
export async function loadInventoryPage(detail?: string): Promise<Component<InventoryRouteProps>> {
    return detail ? (await import('../presentation/FeatureDetailPage.svelte')).default : (await import('../presentation/FeatureInventoryPage.svelte')).default;
}
