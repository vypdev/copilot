import {
  MESSAGE_CATALOG_VERSION,
  catalogPluralCategories,
  catalogPlaceholders,
  renderCatalogMessage,
  selectBundledMessageCatalog,
  validateCatalogDefinition,
  validateDynamicCatalogMessages,
  type MessageCatalogDefinition,
} from '../message_catalog';

type Id = 'greeting' | 'items';

const english: MessageCatalogDefinition<Id> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'en-US',
  compatibleBaseLanguage: 'en',
  messages: Object.freeze({
    greeting: 'Hello {name}',
    items: Object.freeze({ one: '{count} item', other: '{count} items' }),
  }),
});
const spanish: MessageCatalogDefinition<Id> = Object.freeze({
  version: MESSAGE_CATALOG_VERSION,
  locale: 'es-ES',
  compatibleBaseLanguage: 'es',
  messages: Object.freeze({
    greeting: 'Hola {name}',
    items: Object.freeze({
      one: '{count} elemento',
      many: '{count} elementos',
      other: '{count} elementos',
    }),
  }),
});

describe('message catalog domain policy', () => {
  it.each([
    ['', 'exact', 'en-US'],
    ['en-US', 'exact', 'en-US'],
    ['en-GB', 'base', 'en-US'],
    ['es-ES', 'exact', 'es-ES'],
    ['es-MX', 'base', 'es-ES'],
  ] as const)('selects %s through the %s bundled path', (locale, source, resolvedLocale) => {
    expect(selectBundledMessageCatalog(locale, [english, spanish])).toMatchObject({
      requestedLocale: locale || 'en-US',
      resolvedLocale,
      source,
    });
  });

  it.each(['fr-FR', 'ar', 'zh-Hant-TW'])('leaves %s for dynamic resolution', locale => {
    expect(selectBundledMessageCatalog(locale, [english, spanish])).toBeUndefined();
  });

  it('validates complete, versioned, language-compatible catalog definitions', () => {
    expect(validateCatalogDefinition(english, ['greeting', 'items'])).toEqual([]);
    expect(catalogPluralCategories('es-ES')).toEqual(['one', 'many', 'other']);
    expect(validateCatalogDefinition(spanish, ['greeting', 'items'])).toEqual([]);
    expect(validateCatalogDefinition({ ...english, version: 'old' }, ['greeting', 'items']))
      .toContain('catalog-version-mismatch');
    expect(validateCatalogDefinition({ ...english, locale: 'not a locale' }, ['greeting', 'items']))
      .toContain('catalog-locale-invalid');
    expect(validateCatalogDefinition({ ...english, compatibleBaseLanguage: 'fr' }, ['greeting', 'items']))
      .toContain('catalog-language-mismatch');
  });

  it('rejects missing, unknown, empty, and oversized bundled entries', () => {
    expect(validateCatalogDefinition({ ...english, messages: { greeting: 'Hello {name}' } as never }, ['greeting', 'items']))
      .toContain('catalog-id-missing');
    expect(validateCatalogDefinition({ ...english, messages: { ...english.messages, extra: 'x' } as never }, ['greeting', 'items']))
      .toContain('catalog-id-unknown');
    expect(validateCatalogDefinition({ ...english, messages: { ...english.messages, greeting: '' } }, ['greeting', 'items']))
      .toContain('catalog-message-invalid:greeting');
    expect(validateCatalogDefinition({ ...english, messages: { ...english.messages, greeting: 'x'.repeat(2_001) } }, ['greeting', 'items']))
      .toContain('catalog-message-invalid:greeting');
    expect(validateCatalogDefinition({
      ...english,
      messages: { ...english.messages, items: { one: '{count} item', other: '{total} items' } },
    }, ['greeting', 'items'])).toContain('catalog-message-invalid:items');
    expect(validateCatalogDefinition({
      ...english,
      messages: { ...english.messages, items: { other: '{count} items' } },
    }, ['greeting', 'items'])).toContain('catalog-message-invalid:items');
    expect(validateCatalogDefinition({
      ...english,
      messages: { ...english.messages, items: { one: '{count} item', other: '{count} items', invalid: 'x' } as never },
    }, ['greeting', 'items'])).toContain('catalog-message-invalid:items');
  });

  it('renders typed placeholders, locale-aware numbers, and plurals', () => {
    expect(renderCatalogMessage(english.messages.greeting, { name: 'Ada' })).toBe('Hello Ada');
    expect(renderCatalogMessage(english.messages.items, { count: 1 }, 'en-US', 1)).toBe('1 item');
    expect(renderCatalogMessage(english.messages.items, { count: 2 }, 'en-US', 2)).toBe('2 items');
    expect(renderCatalogMessage(spanish.messages.items, { count: 1_000_000 }, 'es-ES', 1_000_000))
      .toMatch(/1.*000.*000 elementos/u);
    expect(renderCatalogMessage({ other: '{count} items' }, { count: 1 }, 'en-US', 1))
      .toBe('1 items');
    expect(renderCatalogMessage(english.messages.items, { count: 1 })).toBe('1 item');
    expect(() => renderCatalogMessage(english.messages.items)).toThrow('Missing catalog variable: count.');
    expect(renderCatalogMessage('{count} éléments', { count: 1234 }, 'fr-FR')).toMatch(/1[^0-9]234 éléments/u);
    expect(() => renderCatalogMessage('Hello {name}')).toThrow('Missing catalog variable: name.');
  });

  it('extracts placeholder multisets across every plural variant', () => {
    expect(catalogPlaceholders('Hello {name} {name}')).toEqual(['name', 'name']);
    expect(catalogPlaceholders({ one: '{count} {thing}', other: '{count} {thing}' }))
      .toEqual(['count', 'count', 'thing', 'thing']);
  });

  it('accepts an exact, safe dynamic slice with placeholder parity', () => {
    expect(validateDynamicCatalogMessages({
      greeting: 'Bonjour {name}',
      items: { one: '{count} élément', other: '{count} éléments' },
    }, english.messages, ['greeting', 'items'])).toBe(true);
  });

  it('requires and renders every cardinal plural category for the target locale', () => {
    const polish = {
      greeting: 'Cześć {name}',
      items: {
        one: '{count} element',
        few: '{count} elementy',
        many: '{count} elementów',
        other: '{count} elementu',
      },
    };

    expect(catalogPluralCategories('pl-PL')).toEqual(['one', 'few', 'many', 'other']);
    expect(validateDynamicCatalogMessages(polish, english.messages, ['greeting', 'items'], 'pl-PL'))
      .toBe(true);
    expect(validateDynamicCatalogMessages({
      ...polish,
      items: { one: '{count} element', few: '{count} elementy', other: '{count} elementu' },
    }, english.messages, ['greeting', 'items'], 'pl-PL')).toBe(false);
    expect(renderCatalogMessage(polish.items, { count: 1 }, 'pl-PL', 1)).toBe('1 element');
    expect(renderCatalogMessage(polish.items, { count: 2 }, 'pl-PL', 2)).toBe('2 elementy');
    expect(renderCatalogMessage(polish.items, { count: 5 }, 'pl-PL', 5)).toBe('5 elementów');
    expect(renderCatalogMessage(polish.items, { count: 1.5 }, 'pl-PL', 1.5)).toBe('1,5 elementu');
  });

  it('accepts an other-only dynamic plural for locales without cardinal variants', () => {
    expect(validateDynamicCatalogMessages({
      greeting: 'こんにちは {name}',
      items: { other: '{count} 件' },
    }, english.messages, ['greeting', 'items'], 'ja-JP')).toBe(true);
  });

  it.each([
    [null, 'null response'],
    [[], 'array response'],
    [{ greeting: 'Bonjour', items: { one: '{count} élément', other: '{count} éléments' } }, 'missing placeholder'],
    [{ greeting: 'Bonjour {name}', items: { one: '{count} élément', other: '{total} éléments' } }, 'changed placeholder'],
    [{ greeting: 'Bonjour {name}', items: '{count} éléments' }, 'changed plural shape'],
    [{ greeting: 'Bonjour {name}', items: { one: '{count} élément', other: '{count} éléments' }, extra: 'x' }, 'unknown id'],
    [{ greeting: 'Bonjour @team {name}', items: { one: '{count} élément', other: '{count} éléments' } }, 'mention'],
    [{ greeting: 'Voir https://example.com/{name}', items: { one: '{count} élément', other: '{count} éléments' } }, 'URL'],
    [{ greeting: '<!-- forged --> {name}', items: { one: '{count} élément', other: '{count} éléments' } }, 'marker'],
    [{ greeting: '\u202EBonjour {name}', items: { one: '{count} élément', other: '{count} éléments' } }, 'bidi control'],
    [{ greeting: 'Bonjour {name}', items: { one: '{count} élément', other: '' } }, 'empty plural variant'],
  ])('rejects unsafe dynamic catalog output: %s', (value, _reason) => {
    expect(validateDynamicCatalogMessages(value, english.messages, ['greeting', 'items'])).toBe(false);
  });
});
