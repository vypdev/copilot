import type { MessageCatalogDefinition, ResolvedMessageCatalog } from '../../../domain/message_catalog';
import type { MessageCatalogResolutionPort } from '../../ports/message_catalog_ports';
import { resolveMessageCatalogView, toResolvedMessageCatalogView } from '../resolved_message_catalog_policy';

type Id = 'items';
const sourceCatalog: MessageCatalogDefinition<Id> = {
  version: '3',
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: { items: '{count} items' },
};

function resolverReturning(value: unknown): MessageCatalogResolutionPort {
  return { resolve: jest.fn().mockResolvedValue(value) } as MessageCatalogResolutionPort;
}

describe('resolved message catalog policy', () => {
  it('uses the resolved locale for atomic English fallback plurals and numbers', () => {
    const resolved: ResolvedMessageCatalog<Id> = {
      requestedLocale: 'ar-SA',
      resolvedLocale: 'en-US',
      source: 'fallback',
      fallbackReason: 'dynamic-provider-unavailable',
      messages: {
        items: { one: '{count} item', other: '{count} items' },
      },
    };

    const catalog = toResolvedMessageCatalogView(resolved);

    expect(catalog).toMatchObject({
      requestedLocale: 'ar-SA',
      locale: 'en-US',
      resolutionSource: 'fallback',
    });
    expect(catalog.message('items', { count: 2 }, 2)).toBe('2 items');
    expect(catalog.message('items', { count: 1234 }, 1234)).toBe('1,234 items');
  });

  it('uses a dynamically resolved locale for its plural rules', () => {
    const resolved: ResolvedMessageCatalog<Id> = {
      requestedLocale: 'pl-PL',
      resolvedLocale: 'pl-PL',
      source: 'dynamic',
      messages: {
        items: {
          one: '{count} element',
          few: '{count} elementy',
          many: '{count} elementów',
          other: '{count} elementu',
        },
      },
    };

    expect(toResolvedMessageCatalogView(resolved).message('items', { count: 2 }, 2))
      .toBe('2 elementy');
  });

  it('falls back to the complete English catalog when resolution rejects', async () => {
    const resolver = { resolve: jest.fn().mockRejectedValue(new Error('provider failure')) } as MessageCatalogResolutionPort;

    const view = await resolveMessageCatalogView('pl-PL', ['items'], sourceCatalog, [], undefined, resolver);

    expect(view).toMatchObject({
      requestedLocale: 'pl-PL',
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-request-failed',
    });
    expect(view.message('items', { count: 2 })).toBe('2 items');
  });

  it.each([
    { source: 'dynamic', messages: {} },
    { source: 'dynamic', messages: { items: '{missing} elementy' } },
    { source: 'fallback', messages: {} },
  ])('falls back atomically for an incomplete or invalid $source result', async partial => {
    const resolver = resolverReturning({
      requestedLocale: 'pl-PL',
      resolvedLocale: partial.source === 'fallback' ? 'en-US' : 'pl-PL',
      source: partial.source,
      messages: partial.messages,
      ...(partial.source === 'fallback' ? { fallbackReason: 'dynamic-response-invalid' } : {}),
    });

    const view = await resolveMessageCatalogView('pl-PL', ['items'], sourceCatalog, [], undefined, resolver);

    expect(view.message('items', { count: 2 })).toBe('2 items');
    expect(view.locale).toBe('en-US');
    expect(view.resolutionSource).toBe('fallback');
  });

  it('uses a trusted bundled catalog if the resolver rejects', async () => {
    const bundledCatalog: MessageCatalogDefinition<Id> = {
      version: '3',
      locale: 'es-ES',
      compatibleBaseLanguage: 'es',
      messages: { items: '{count} elementos' },
    };
    const resolver = { resolve: jest.fn().mockRejectedValue(new Error('provider failure')) } as MessageCatalogResolutionPort;

    const view = await resolveMessageCatalogView('es-ES', ['items'], sourceCatalog, [bundledCatalog], undefined, resolver);

    expect(view.resolutionSource).toBe('exact');
    expect(view.message('items', { count: 2 })).toBe('2 elementos');
  });

  it('preserves a complete and valid dynamic result', async () => {
    const resolver = resolverReturning({
      requestedLocale: 'es-ES',
      resolvedLocale: 'es-ES',
      source: 'dynamic',
      messages: { items: '{count} elementos' },
    });

    const view = await resolveMessageCatalogView('es-ES', ['items'], sourceCatalog, [], undefined, resolver);

    expect(view.resolutionSource).toBe('dynamic');
    expect(view.message('items', { count: 2 })).toBe('2 elementos');
  });
});
