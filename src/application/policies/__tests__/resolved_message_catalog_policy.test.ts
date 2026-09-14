import type { ResolvedMessageCatalog } from '../../../domain/message_catalog';
import { toResolvedMessageCatalogView } from '../resolved_message_catalog_policy';

type Id = 'items';

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
});
