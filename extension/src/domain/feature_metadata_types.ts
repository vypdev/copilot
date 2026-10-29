export const FEATURE_FAMILIES = ['NAV', 'CODE', 'REVIEW', 'ISSUE', 'SEARCH', 'NOTIFY', 'CI', 'RELEASE', 'WORK', 'COPILOT', 'CENTER', 'SETUP'] as const;
export type FeatureFamily = typeof FEATURE_FAMILIES[number];
export const FEATURE_MILESTONES: Readonly<Record<FeatureFamily, number>> = Object.freeze({ NAV: 4, CODE: 4, REVIEW: 5, ISSUE: 5, SEARCH: 6, NOTIFY: 6,
    CI: 7, RELEASE: 7, WORK: 6, COPILOT: 9, CENTER: 3, SETUP: 11 });
export type FeatureMode = 'local' | 'read' | 'settings' | 'draft' | 'write' | 'monitor' | 'setup';
export type FeatureSurface = 'repository' | 'code' | 'review' | 'issue' | 'search' | 'attention' | 'delivery' | 'workspace' | 'center' | 'setup';
export type FeaturePermission = 'page-local' | 'selected-repository-read' | 'personal-settings' | 'native-human-submission'
    | 'explicit-user-write' | 'explicit-bounded-alert-monitor' | 'cli-owned-setup';
export type FeatureDataSource = 'page' | 'personal' | 'api' | 'draft' | 'write' | 'monitor' | 'setup' | 'checks' | 'annotations' | 'runs';
export interface FeatureMetadata {
    readonly id: string; readonly family: FeatureFamily; readonly mode: FeatureMode; readonly permission: FeaturePermission;
    readonly title: string; readonly description: string; readonly surfaces: readonly FeatureSurface[];
    readonly optionalPermissions: readonly ('contextMenus' | 'notifications' | 'alarms')[];
    readonly nativeTarget: 'none' | 'human-composer' | 'control-handoff';
    readonly dataSource: FeatureDataSource;
}
export type FeatureText = readonly [title: string, description: string];
