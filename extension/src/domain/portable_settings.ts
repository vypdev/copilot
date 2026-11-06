import { validSettings, type Settings } from './settings.ts';
import { deepFreeze } from './value.ts';
/** Connection grants are native facts, never portable preferences. */
export function portableSettings(value: unknown): Settings | null {
    if (!validSettings(value)) return null;
    const repositories = Object.fromEntries(Object.entries(value.repositories).map(([id, preferences]) => {
        const { connected: _grant, ...portable } = preferences; return [id, portable];
    }));
    return deepFreeze(JSON.parse(JSON.stringify({ ...value, repositories })) as Settings);
}
