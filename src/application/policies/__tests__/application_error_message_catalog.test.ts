import { catalogPlaceholders, validateCatalogDefinition, type CatalogMessage } from '../../../domain/message_catalog';
import { APPLICATION_ERROR_METADATA } from '../../../data/model/application_error';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  APPLICATION_ERROR_CATALOG_DEFINITIONS,
  APPLICATION_ERROR_CODES,
  APPLICATION_ERROR_MESSAGE_IDS,
  ENGLISH_APPLICATION_ERROR_DEFINITION,
  SPANISH_APPLICATION_ERROR_DEFINITION,
  resolveApplicationErrorCatalog,
  resolveStaticApplicationErrorCatalog,
} from '../application_error_message_catalog';

const configuration = { provider: 'codex' as const, model: 'model' };

function translatedMessages(): Record<string, CatalogMessage> {
  return Object.fromEntries(Object.entries(ENGLISH_APPLICATION_ERROR_DEFINITION.messages).map(([id, message]) => [
    id,
    `FR ${message as string}`,
  ]));
}

describe('application error message catalog', () => {
  it('ships complete, unique, immutable English and Spanish definitions', () => {
    expect(new Set(APPLICATION_ERROR_MESSAGE_IDS).size).toBe(APPLICATION_ERROR_MESSAGE_IDS.length);
    expect(APPLICATION_ERROR_CODES).toEqual(Object.keys(APPLICATION_ERROR_METADATA));
    for (const definition of APPLICATION_ERROR_CATALOG_DEFINITIONS) {
      expect(validateCatalogDefinition(definition, APPLICATION_ERROR_MESSAGE_IDS)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.messages)).toBe(true);
    }
    for (const id of APPLICATION_ERROR_MESSAGE_IDS) {
      expect(catalogPlaceholders(SPANISH_APPLICATION_ERROR_DEFINITION.messages[id]))
        .toEqual(catalogPlaceholders(ENGLISH_APPLICATION_ERROR_DEFINITION.messages[id]));
    }
  });

  it.each(APPLICATION_ERROR_CODES)('derives exact English semantic content for %s', (code) => {
    expect(ENGLISH_APPLICATION_ERROR_DEFINITION.messages[`error.${code}.impact`])
      .toBe(APPLICATION_ERROR_METADATA[code].impact);
    expect(ENGLISH_APPLICATION_ERROR_DEFINITION.messages[`error.${code}.action`])
      .toBe(APPLICATION_ERROR_METADATA[code].action);
    expect(ENGLISH_APPLICATION_ERROR_DEFINITION.messages[`error.${code}.retainedState`])
      .toBe(APPLICATION_ERROR_METADATA[code].retainedState);
  });

  it.each([
    ['en-US', 'en-US', 'exact'],
    ['en-AU', 'en-US', 'base'],
    ['es-ES', 'es-ES', 'exact'],
    ['es-MX', 'es-ES', 'base'],
    ['fr-FR', 'en-US', 'fallback'],
  ] as const)('resolves %s as %s from %s', (requested, resolved, source) => {
    expect(resolveStaticApplicationErrorCatalog(requested)).toMatchObject({
      requestedLocale: requested,
      locale: resolved,
      resolutionSource: source,
    });
  });

  it('resolves and caches a complete arbitrary-language catalog atomically', async () => {
    const query = jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages: translatedMessages() });
    const resolver = new ResolveMessageCatalogUseCase({ query });

    const first = await resolveApplicationErrorCatalog('fr-FR', configuration, resolver);
    const replay = await resolveApplicationErrorCatalog('fr-FR', configuration, resolver);

    expect(first.message('error.provider.rate-limited.action'))
      .toBe('FR Retry after the provider limit resets.');
    expect(replay).toMatchObject({ locale: 'fr-FR', resolutionSource: 'dynamic' });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back atomically when any translated descriptor is missing', async () => {
    const messages = translatedMessages();
    delete messages['error.label.action'];
    const resolver = new ResolveMessageCatalogUseCase({
      query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    });

    const catalog = await resolveApplicationErrorCatalog('fr-FR', configuration, resolver);

    expect(catalog).toMatchObject({
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-response-invalid',
    });
    expect(catalog.message('error.label.action')).toBe('Action');
    expect(catalog.message('error.provider.unavailable.impact')).not.toContain('FR ');
  });
});
