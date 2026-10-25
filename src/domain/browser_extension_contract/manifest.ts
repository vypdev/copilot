/** Portable decoded-value contract. Raw JSON parsing/duplicate keys are a separate boundary. */
export interface BrowserConnectionManifestV1 {
    readonly schemaVersion: 1;
    readonly enabled: boolean;
    readonly repositoryId: number;
    readonly producerActorId: number;
    readonly workflowPaths: readonly string[];
    readonly capabilities: readonly string[];
    readonly statusSchemaMajor: 1;
    readonly publication: 'current-status-comment';
}

export type ManifestValidation =
    | { readonly ok: true; readonly value: BrowserConnectionManifestV1 }
    | { readonly ok: false; readonly reason: 'invalid-shape' | 'invalid-identity' | 'invalid-workflows' | 'invalid-capabilities' };

const KEYS = ['schemaVersion', 'enabled', 'repositoryId', 'producerActorId',
    'workflowPaths', 'capabilities', 'statusSchemaMajor', 'publication'];

function stringList(value: unknown, minimum: number, maximum: number, length: number, pattern: RegExp): readonly string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    const items: unknown[] = Array.from(value);
    if (items.length < minimum || items.length > maximum || new Set(items).size !== items.length
        || !items.every(item => typeof item === 'string' && item.length > 0 && item.length <= length && pattern.test(item))) return undefined;
    return Object.freeze(items as string[]);
}

function positiveId(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

export function validateConnectionManifest(value: unknown): ManifestValidation {
    try {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return { ok: false, reason: 'invalid-shape' };
        const descriptors = Object.getOwnPropertyDescriptors(value);
        const keys = Object.keys(descriptors);
        if (keys.some(key => !('value' in descriptors[key]))) return { ok: false, reason: 'invalid-shape' };
        const data: Record<string, unknown> = Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
        if (keys.length !== KEYS.length || !KEYS.every(key => keys.includes(key))
            || data.schemaVersion !== 1 || typeof data.enabled !== 'boolean'
            || data.statusSchemaMajor !== 1 || data.publication !== 'current-status-comment') {
            return { ok: false, reason: 'invalid-shape' };
        }
        if (!positiveId(data.repositoryId) || !positiveId(data.producerActorId)) return { ok: false, reason: 'invalid-identity' };
        const workflowPaths = stringList(data.workflowPaths, 1, 8, 160, /^\.github\/workflows\/[A-Za-z0-9_.-]+\.ya?ml$(?![\s\S])/u);
        if (!workflowPaths) {
            return { ok: false, reason: 'invalid-workflows' };
        }
        const capabilities = stringList(data.capabilities, 0, 16, 48, /^[a-z][a-z0-9-]{0,39}\.v[1-9][0-9]{0,2}$(?![\s\S])/u);
        if (!capabilities) {
            return { ok: false, reason: 'invalid-capabilities' };
        }
        return { ok: true, value: Object.freeze({
            schemaVersion: 1, enabled: data.enabled, repositoryId: data.repositoryId,
            producerActorId: data.producerActorId, workflowPaths,
            capabilities, statusSchemaMajor: 1, publication: 'current-status-comment',
        }) };
    } catch {
        return { ok: false, reason: 'invalid-shape' };
    }
}
