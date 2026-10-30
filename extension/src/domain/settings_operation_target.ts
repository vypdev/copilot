import type { Settings } from './settings.ts';
import type { SettingsAction } from './settings_change.ts';
import type { CurrentTarget } from './current_operation.ts';
import type { CenterRoute } from './center_routes.ts';
import { numericIdentity } from './center_profiles.ts';
import { deepFreeze, record } from './value.ts';

const ROUTES: Readonly<Record<SettingsAction, CenterRoute>> = {
    'profile-create': 'profiles', 'profile-edit': 'profiles', 'profile-select': 'profiles', 'profile-deselect': 'profiles', 'profile-remove': 'profiles',
    preferences: 'overview', appearance: 'appearance', shortcuts: 'shortcuts', 'center-preferences': 'overview', 'repository-preferences': 'repositories',
    import: 'data', rollback: 'data', 'reset-global': 'overview', 'reset-profiles': 'profiles', 'reset-appearance': 'appearance', 'reset-repository': 'repositories', 'reset-all': 'data',
};
/** Called only after planning admitted this exact detached intent; no target is reconstructed on later reads. */
export function settingsOperationTarget(action: SettingsAction, input: unknown, before: Settings, after: Settings): CurrentTarget {
    const location = { route: ROUTES[action] }; const fallback = { location, label: null };
    if (!record(input)) return deepFreeze(fallback);
    if (action.startsWith('profile-') && record(input.change)) {
        const id = record(input.change.profile) ? input.change.profile.id : input.change.id;
        const profile = after.center.profiles.find(value => value.id === id) ?? before.center.profiles.find(value => value.id === id);
        if (profile) return deepFreeze({ location: { route: 'profiles', detail: profile.id }, label: profile.name });
    }
    return deepFreeze({ location, label: numericIdentity(input.repositoryId) ? input.repositoryId : null });
}
