export interface Preferences {
    readonly features: Readonly<Record<string, boolean>>;
    readonly density: 'comfortable' | 'compact';
    readonly shortcuts: boolean;
    readonly paused: boolean;
}
export interface RepositoryPreferences extends Partial<Preferences> {
    readonly connected?: boolean;
    readonly savedViews?: readonly string[];
}
