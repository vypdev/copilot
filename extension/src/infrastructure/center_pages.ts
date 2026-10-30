import type { Component } from 'svelte';
import type { CenterRoute } from '../domain/center_routes.ts';
import type { CenterRouteProps, InventoryRouteProps, PrivacyRouteProps, SupportRouteProps } from '../domain/center_ui.ts';
import type { SupportRoute } from '../domain/support_context.ts';
import type { HistoryRouteProps } from '../domain/history_ui.ts';
/** Every operand is a packaged literal; no location, imported setting or message supplies an import URL. */
export async function loadCenterPage(route: Exclude<CenterRoute, 'features' | 'privacy' | 'activity' | 'diagnostics' | SupportRoute>, detail?: string): Promise<Component<CenterRouteProps>> {
    switch (route) {
        case 'overview': return (await import('../presentation/OverviewPage.svelte')).default;
        case 'welcome': return (await import('../presentation/WelcomePage.svelte')).default;
        case 'appearance': return (await import('../presentation/AppearancePage.svelte')).default;
        case 'language': return (await import('../presentation/LanguagePage.svelte')).default;
        case 'shortcuts': return (await import('../presentation/ShortcutsPage.svelte')).default;
        case 'repositories': return detail === 'workspaces' ? (await import('../presentation/WorkspacesPage.svelte')).default
            : (await import('../presentation/InformationPage.svelte')).default;
        case 'profiles': return (await import('../presentation/ProfilesPage.svelte')).default;
        case 'data': return (await import('../presentation/DataPage.svelte')).default;
        default: return (await import('../presentation/InformationPage.svelte')).default;
    }
}
export async function loadInventoryPage(detail?: string): Promise<Component<InventoryRouteProps>> {
    return detail ? (await import('../presentation/FeatureDetailPage.svelte')).default : (await import('../presentation/FeatureInventoryPage.svelte')).default;
}
export async function loadPrivacyPage(): Promise<Component<PrivacyRouteProps>> { return (await import('../presentation/PrivacyPage.svelte')).default; }
export async function loadSupportPage(): Promise<Component<SupportRouteProps>> { return (await import('../presentation/SupportPage.svelte')).default; }
export async function loadHistoryPage(): Promise<Component<HistoryRouteProps>> { return (await import('../presentation/HistoryPage.svelte')).default; }
