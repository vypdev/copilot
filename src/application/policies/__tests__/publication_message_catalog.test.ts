import {
  ENGLISH_PUBLICATION_CATALOG,
  ENGLISH_PUBLICATION_DEFINITION,
  PUBLICATION_MESSAGE_IDS,
  SPANISH_PUBLICATION_DEFINITION,
  SPANISH_PUBLICATION_CATALOG,
  publicationLocaleNeedsDynamicCatalog,
  resolvePublicationCatalog,
  resolveStaticPublicationCatalog,
} from '../publication_message_catalog';
import { catalogPlaceholders, validateCatalogDefinition } from '../../../domain/message_catalog';

describe('publication message catalog', () => {
  it.each([
    ['en-US', 'en-US', false],
    ['en-GB', 'en-US', false],
    ['es-ES', 'es-ES', false],
    ['es-MX', 'es-ES', false],
    ['fr-FR', 'en-US', true],
    ['', 'en-US', false],
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
    expect(Object.isFrozen(SPANISH_PUBLICATION_CATALOG.translation)).toBe(true);
    expect(Object.isFrozen(SPANISH_PUBLICATION_CATALOG.cli)).toBe(true);
  });

  it('keeps both manifests complete and every translated placeholder identical', () => {
    expect(validateCatalogDefinition(ENGLISH_PUBLICATION_DEFINITION, PUBLICATION_MESSAGE_IDS)).toEqual([]);
    expect(validateCatalogDefinition(SPANISH_PUBLICATION_DEFINITION, PUBLICATION_MESSAGE_IDS)).toEqual([]);
    for (const id of PUBLICATION_MESSAGE_IDS) {
      expect(catalogPlaceholders(SPANISH_PUBLICATION_DEFINITION.messages[id]))
        .toEqual(catalogPlaceholders(ENGLISH_PUBLICATION_DEFINITION.messages[id]));
    }
  });

  it('distinguishes bundled locales from locales that require dynamic resolution', () => {
    expect(publicationLocaleNeedsDynamicCatalog('')).toBe(false);
    expect(publicationLocaleNeedsDynamicCatalog('es-MX')).toBe(false);
    expect(publicationLocaleNeedsDynamicCatalog('fr-FR')).toBe(true);
  });

  it('resolves through the static fallback when no resolver is bound', async () => {
    await expect(resolvePublicationCatalog('fr-FR', undefined, undefined)).resolves.toMatchObject({
      requestedLocale: 'fr-FR',
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-provider-unavailable',
    });
  });

  it('projects a dynamically resolved slice into the typed publication view', async () => {
    const messages = { ...ENGLISH_PUBLICATION_DEFINITION.messages };
    messages['publication.currentStatus'] = 'État actuel';
    messages['interaction.translation.summary'] = 'Demande interprétée depuis {sourceLanguage}';
    messages['interaction.translation.interpretedRequest'] = 'Demande interprétée';
    messages['interaction.translation.originalRequest'] = 'Demande originale';
    messages['cli.answer'] = 'Réponse';
    const resolve = jest.fn().mockResolvedValue({
      requestedLocale: 'fr-FR',
      resolvedLocale: 'fr-FR',
      source: 'dynamic',
      messages,
    });

    const catalog = await resolvePublicationCatalog('fr-FR', { provider: 'codex', model: 'model' }, { resolve });

    expect(catalog.currentStatus).toBe('État actuel');
    expect(catalog.translation.summary('anglais')).toBe('Demande interprétée depuis anglais');
    expect(catalog.translation.interpretedRequest).toBe('Demande interprétée');
    expect(catalog.translation.originalRequest).toBe('Demande originale');
    expect(catalog.cli.answer).toBe('Réponse');
    expect(catalog.render('interaction.status.repository')).toBe('Repository');
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({
      targetLocale: 'fr-FR',
      ids: PUBLICATION_MESSAGE_IDS,
    }));

    await resolvePublicationCatalog('', undefined, { resolve });
    expect(resolve).toHaveBeenLastCalledWith(expect.objectContaining({ targetLocale: 'en-US' }));
  });
});
