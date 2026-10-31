export type ApiCacheRequest = { readonly method: 'center.cache.preview' }
    | { readonly method: 'center.cache.confirm' | 'center.cache.cancel' | 'center.cache.result'; readonly operationId: string };
