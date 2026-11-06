export interface MetadataReadView<T> { readonly phase: 'idle' | 'reading' | 'ready' | 'unavailable' | 'stale'; readonly current: boolean; readonly data: T | null }
export const EMPTY_METADATA_READ: MetadataReadView<never> = Object.freeze({ phase: 'idle', current: false, data: null });
