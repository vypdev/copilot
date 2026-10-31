import { expect, it } from 'vitest';
import { API_CACHE_FACT_STATES, API_CACHE_OUTCOMES, apiCacheFact, apiCacheFactTransition, decodeApiCacheReply, type ApiCacheFact } from '../../src/domain/api_cache.ts';

it('bexh3-cache-C01 accepts only closed detached cache replies without accepting cache bodies, witnesses, authority or provider exceptions', () => {
    expect(Object.isFrozen(API_CACHE_OUTCOMES)).toBe(true);
    for (const state of API_CACHE_OUTCOMES) expect(decodeApiCacheReply({ state })).toEqual({ state });
    const preview = { state: 'preview', operationId: 'a'.repeat(32), expiresAt: 1000 };
    const decoded = decodeApiCacheReply(preview); expect(decoded).toEqual(preview); expect(decoded).not.toBe(preview); expect(Object.isFrozen(decoded)).toBe(true);
    for (const value of [null, [], {}, { state: 'future' }, { state: 'cleared', body: 'private' }, { ...preview, witness: {} },
        { ...preview, operationId: 'invalid' }, { ...preview, expiresAt: -1 }, { ...preview, expiresAt: Number.MAX_SAFE_INTEGER + 1 },
        { state: 'cleared', role: 'editor' }, { state: 'cleared', secret: 'private' }, { state: 'cleared', data: 'x'.repeat(133 * 1024) },
        { toJSON() { throw new Error('private native error'); } }]) expect(decodeApiCacheReply(value)).toBeNull();
});
it('bexh3-cache-C02 records only closed progress and refuses fabricated completion, reopening or changes to terminal cache facts', () => {
    const fact = (state: ApiCacheFact['state']): ApiCacheFact => ({ kind: 'cache-operation', action: 'clear-api-cache', state });
    expect(Object.isFrozen(API_CACHE_FACT_STATES)).toBe(true);
    for (const state of API_CACHE_FACT_STATES) expect(apiCacheFact(fact(state))).toBe(true);
    for (const value of [null, [], {}, { ...fact('reviewed'), state: 'future' }, { ...fact('reviewed'), kind: 'other' },
        { ...fact('cleared'), body: 'private' }, { ...fact('reviewed'), witness: {} }]) expect(apiCacheFact(value)).toBe(false);
    for (const state of ['cancelled', 'blocked', 'submitted'] as const) expect(apiCacheFactTransition(fact('reviewed'), fact(state))).toBe(true);
    for (const state of ['cleared', 'not-applied', 'unknown'] as const) expect(apiCacheFactTransition(fact('submitted'), fact(state))).toBe(true);
    for (const [before, after] of [['reviewed', 'cleared'], ['reviewed', 'unknown'], ['submitted', 'cancelled'], ['cancelled', 'submitted'],
        ['cleared', 'unknown'], ['unknown', 'cleared'], ['not-applied', 'submitted'], ['blocked', 'reviewed']] as const) expect(apiCacheFactTransition(fact(before), fact(after))).toBe(false);
    expect(apiCacheFactTransition({ ...fact('reviewed'), kind: 'other' } as never, fact('submitted'))).toBe(false);
    expect(apiCacheFactTransition(fact('submitted'), { ...fact('cleared'), kind: 'other' } as never)).toBe(false);
});
