import type { CenterRoute } from './center_routes.ts';
import type { CenterClientView } from './center_client_view.ts';

export type CenterLocale = 'en' | 'es' | 'fr' | 'pt';
export interface CenterCopy {
    readonly locale: CenterLocale;
    readonly routes: Readonly<Record<CenterRoute, string>>;
    readonly issues: Readonly<Record<NonNullable<CenterClientView['issue']>, string>>;
    readonly messages: Readonly<Record<'title' | 'local' | 'skip' | 'navigation' | 'loading' | 'editor' | 'observer'
        | 'takeControl' | 'refresh' | 'preview' | 'revision' | 'reviewTitle' | 'reviewSummary' | 'unset' | 'yes' | 'no'
        | 'draftChanged' | 'draftPending' | 'unsaved' | 'stay' | 'discard' | 'unavailable' | 'future' | 'corrupt' | 'migration'
        | 'theme' | 'github' | 'light' | 'dark' | 'density' | 'comfortable' | 'compact' | 'text' | 'standard' | 'large'
        | 'motion' | 'system' | 'reduced' | 'contrast' | 'high' | 'language' | 'auto' | 'paused' | 'shortcuts'
        | 'profiles' | 'newProfile' | 'name' | 'identifier' | 'identifierHint' | 'scope' | 'global' | 'host' | 'account' | 'organization'
        | 'repository' | 'accountId' | 'organizationId' | 'repositoryId' | 'select' | 'deselect' | 'remove'
        | 'selected' | 'inactive' | 'inherit' | 'profileLimit' | 'precedence' | 'export' | 'import' | 'importLabel'
        | 'importHint' | 'invalidFile' | 'reset' | 'resetGlobal' | 'resetProfiles' | 'resetAppearance' | 'resetAll'
        | 'rollback' | 'noRollback' | 'dataPrivacy' | 'welcome' | 'start' | 'finish' | 'help' | 'documentation'
        | 'pending' | 'pendingExplanation' | 'technical' | 'downloadFailed' | 'removeHint' | 'nothingSelected', string>>;
}
