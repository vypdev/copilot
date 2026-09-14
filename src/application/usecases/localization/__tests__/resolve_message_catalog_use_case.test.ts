import { ResolveMessageCatalogUseCase, buildCatalogResponseSchema } from '../resolve_message_catalog_use_case';
import { MESSAGE_CATALOG_VERSION, type MessageCatalogDefinition } from '../../../../domain/message_catalog';

type Id = 'heading' | 'count';
const source: MessageCatalogDefinition<Id> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: Object.freeze({
    heading: 'Current status',
    count: Object.freeze({ one: '{count} finding', other: '{count} findings' }),
  }),
});
const spanish: MessageCatalogDefinition<Id> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: Object.freeze({
    heading: 'Estado actual',
    count: Object.freeze({ one: '{count} hallazgo', other: '{count} hallazgos' }),
  }),
});
const configuration = { provider: 'codex' as const, model: 'model' };

describe('ResolveMessageCatalogUseCase', () => {
  it.each([
    ['en-US', 'exact', 'en-US'],
    ['en-GB', 'base', 'en-US'],
    ['es-ES', 'exact', 'es-ES'],
    ['es-MX', 'base', 'es-ES'],
  ] as const)('uses a bundled catalog for %s without querying an agent', async (locale, resolution, resolvedLocale) => {
    const query = jest.fn();
    const result = await new ResolveMessageCatalogUseCase({ query }).resolve({
      targetLocale: locale,
      ids: ['heading', 'count'],
      sourceCatalog: source,
      bundledCatalogs: [source, spanish],
      configuration,
    });
    expect(result).toMatchObject({ source: resolution, resolvedLocale });
    expect(query).not.toHaveBeenCalled();
  });

  it('resolves and caches one exact dynamic catalog per locale and ID digest', async () => {
    const query = jest.fn().mockResolvedValue({
      targetLocale: 'fr-FR',
      messages: { heading: 'État actuel', count: { one: '{count} résultat', other: '{count} résultats' } },
    });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const request = {
      targetLocale: 'fr-FR', ids: ['heading', 'count'] as const,
      sourceCatalog: source, bundledCatalogs: [source, spanish], configuration,
    };
    const first = await resolver.resolve(request);
    const second = await resolver.resolve(request);

    expect(first).toMatchObject({ source: 'dynamic', requestedLocale: 'fr-FR', resolvedLocale: 'fr-FR' });
    expect(second).toBe(first);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toMatchObject({ agentId: 'build', options: { schemaName: 'localized_message_catalog' } });
    expect(resolver.observations()).toEqual([{
      requestedLocale: 'fr-FR', resolvedLocale: 'fr-FR', source: 'dynamic', descriptorCount: 2,
    }]);
    expect(Object.isFrozen(resolver.observations())).toBe(true);
  });

  it.each([
    [undefined, 'dynamic-response-invalid'],
    [{ targetLocale: 'fr-FR', messages: { heading: 'État' } }, 'dynamic-response-invalid'],
    [{ targetLocale: '@@', messages: { heading: 'État', count: { one: '{count} résultat', other: '{count} résultats' } } }, 'dynamic-response-invalid'],
    [{ targetLocale: 42, messages: { heading: 'État', count: { one: '{count} résultat', other: '{count} résultats' } } }, 'dynamic-response-invalid'],
    [{ targetLocale: 'de-DE', messages: { heading: 'État', count: { one: '{count} résultat', other: '{count} résultats' } } }, 'dynamic-response-invalid'],
    [{ targetLocale: 'fr-FR', messages: { heading: '@team', count: { one: '{count} résultat', other: '{count} résultats' } } }, 'dynamic-response-invalid'],
  ] as const)('falls back atomically for an unavailable or invalid response %#', async (response, reason) => {
    const query = jest.fn().mockResolvedValue(response);
    const result = await new ResolveMessageCatalogUseCase({ query }).resolve({
      targetLocale: 'fr-FR', ids: ['heading', 'count'], sourceCatalog: source,
      bundledCatalogs: [source, spanish], configuration,
    });
    expect(result).toMatchObject({ source: 'fallback', resolvedLocale: 'en-US', fallbackReason: reason });
    expect(result.messages).toBe(source.messages);
  });

  it('falls back without a provider call when the language configuration is unavailable', async () => {
    const query = jest.fn();
    const result = await new ResolveMessageCatalogUseCase({ query }).resolve({
      targetLocale: 'ar', ids: ['heading', 'count'], sourceCatalog: source,
      bundledCatalogs: [source, spanish], configuration: undefined,
    });
    expect(result).toMatchObject({ source: 'fallback', fallbackReason: 'dynamic-provider-unavailable' });
    expect(query).not.toHaveBeenCalled();
  });

  it('maps provider exceptions to a content-free fallback reason', async () => {
    const query = jest.fn().mockRejectedValue(new Error('secret provider body'));
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const result = await resolver.resolve({
      targetLocale: 'zh-Hant-TW', ids: ['heading', 'count'], sourceCatalog: source,
      bundledCatalogs: [source, spanish], configuration,
    });
    expect(result).toMatchObject({ source: 'fallback', fallbackReason: 'dynamic-request-failed' });
    expect(JSON.stringify(result)).not.toContain('secret provider body');
    expect(resolver.observations()).toEqual([expect.objectContaining({
      requestedLocale: 'zh-Hant-TW', source: 'fallback', fallbackReason: 'dynamic-request-failed', descriptorCount: 2,
    })]);
    expect(JSON.stringify(resolver.observations())).not.toContain('secret provider body');
  });

  it('fails closed when a bundled catalog is incomplete instead of mixing copy', async () => {
    const resolver = new ResolveMessageCatalogUseCase({ query: jest.fn() });
    await expect(resolver.resolve({
      targetLocale: 'fr-FR', ids: ['heading', 'count'], sourceCatalog: source,
      bundledCatalogs: [{ ...spanish, messages: { heading: 'Estado' } as never }], configuration,
    })).rejects.toThrow('Invalid bundled message catalog');
  });

  it('builds a strict schema with exact scalar and plural descriptor shapes', () => {
    expect(buildCatalogResponseSchema(source.messages, ['heading', 'count'])).toMatchObject({
      additionalProperties: false,
      properties: {
        messages: {
          additionalProperties: false,
          required: ['heading', 'count'],
          properties: {
            heading: { type: 'string' },
            count: { type: 'object', additionalProperties: false, required: ['one', 'other'] },
          },
        },
      },
    });
  });
});
