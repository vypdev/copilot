declare const __COPILOT_SOURCE_TREE__: string;

/** Vite binds this to the complete deterministic build-input digest. */
export function buildSourceIdentity(): string {
    return typeof __COPILOT_SOURCE_TREE__ === 'string' ? __COPILOT_SOURCE_TREE__ : 'unbundled';
}
