import {
  ENGLISH_PUBLICATION_CATALOG,
  SPANISH_PUBLICATION_CATALOG,
  resolveStaticPublicationCatalog,
} from '../publication_message_catalog';

describe('publication message catalog', () => {
  it.each([
    ['en-US', 'en-US', false],
    ['en-GB', 'en-US', false],
    ['es-ES', 'es-ES', false],
    ['es-MX', 'es-ES', false],
    ['fr-FR', 'en-US', true],
  ] as const)('resolves %s through deterministic catalogs', (locale, catalogLocale, fallback) => {
    const resolved = resolveStaticPublicationCatalog(locale);
    expect(resolved.catalog.locale).toBe(catalogLocale);
    expect(resolved.fallback).toBe(fallback);
  });

  it('keeps English and Spanish catalogs structurally identical and immutable', () => {
    expect(Object.keys(ENGLISH_PUBLICATION_CATALOG)).toEqual(Object.keys(SPANISH_PUBLICATION_CATALOG));
    expect(Object.keys(ENGLISH_PUBLICATION_CATALOG.progressState)).toEqual(Object.keys(SPANISH_PUBLICATION_CATALOG.progressState));
    expect(Object.isFrozen(ENGLISH_PUBLICATION_CATALOG)).toBe(true);
    expect(Object.isFrozen(SPANISH_PUBLICATION_CATALOG.progressState)).toBe(true);
  });
});
