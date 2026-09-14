import type { CatalogMessage } from '../../../domain/message_catalog';
import { catalogPlaceholders, validateCatalogDefinition } from '../../../domain/message_catalog';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  ACTION_SUMMARY_CATALOG_DEFINITIONS,
  ACTION_SUMMARY_MESSAGE_IDS,
  ENGLISH_ACTION_SUMMARY_DEFINITION,
  SPANISH_ACTION_SUMMARY_DEFINITION,
  resolveActionSummaryCatalog,
  resolveStaticActionSummaryCatalog,
} from '../action_summary_message_catalog';

const configuration = { provider: 'codex' as const, model: 'model' };

function translatedMessages(): Record<string, CatalogMessage> {
  return Object.fromEntries(Object.entries(ENGLISH_ACTION_SUMMARY_DEFINITION.messages).map(([id, message]) => [
    id,
    `FR ${message as string}`,
  ]));
}

describe('action summary message catalog', () => {
  it('ships complete, unique, immutable English and Spanish definitions', () => {
    expect(new Set(ACTION_SUMMARY_MESSAGE_IDS).size).toBe(ACTION_SUMMARY_MESSAGE_IDS.length);
    for (const definition of ACTION_SUMMARY_CATALOG_DEFINITIONS) {
      expect(validateCatalogDefinition(definition, ACTION_SUMMARY_MESSAGE_IDS)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.messages)).toBe(true);
    }
    for (const id of ACTION_SUMMARY_MESSAGE_IDS) {
      expect(catalogPlaceholders(SPANISH_ACTION_SUMMARY_DEFINITION.messages[id]))
        .toEqual(catalogPlaceholders(ENGLISH_ACTION_SUMMARY_DEFINITION.messages[id]));
    }
  });

  it.each([
    ['en-US', 'en-US', 'exact'],
    ['en-AU', 'en-US', 'base'],
    ['es-ES', 'es-ES', 'exact'],
    ['es-AR', 'es-ES', 'base'],
    ['fr-FR', 'en-US', 'fallback'],
  ] as const)('resolves %s as %s from %s', (requested, resolved, source) => {
    expect(resolveStaticActionSummaryCatalog(requested)).toMatchObject({
      requestedLocale: requested,
      locale: resolved,
      resolutionSource: source,
    });
  });

  it('resolves and caches one complete catalog for an arbitrary locale', async () => {
    const query = jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages: translatedMessages() });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const first = await resolveActionSummaryCatalog('fr-FR', configuration, resolver);
    const replay = await resolveActionSummaryCatalog('fr-FR', configuration, resolver);

    expect(first).toMatchObject({ requestedLocale: 'fr-FR', locale: 'fr-FR', resolutionSource: 'dynamic' });
    expect(first.message('summary.target.issue', { number: 12 })).toBe('FR Issue #12');
    expect(replay.message('summary.heading')).toBe('FR Copilot execution');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back atomically to English when a dynamic descriptor is missing', async () => {
    const messages = translatedMessages();
    delete messages['summary.status'];
    const resolver = new ResolveMessageCatalogUseCase({
      query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    });

    const catalog = await resolveActionSummaryCatalog('fr-FR', configuration, resolver);

    expect(catalog).toMatchObject({
      requestedLocale: 'fr-FR',
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-response-invalid',
    });
    expect(catalog.message('summary.status')).toBe('Status');
    expect(catalog.message('summary.heading')).not.toContain('FR ');
  });
});
