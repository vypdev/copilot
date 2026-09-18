import type {
  CatalogMessage,
  CatalogPluralCategory,
  CatalogPluralMessage,
} from '../../../domain/message_catalog';
import { catalogPluralCategories, validateCatalogDefinition } from '../../../domain/message_catalog';
import { buildBugbotReviewProjection } from '../../../domain/bugbot/review_projection';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  BUGBOT_CATALOG_DEFINITIONS,
  BUGBOT_MESSAGE_IDS,
  ENGLISH_BUGBOT_DEFINITION,
  renderBugbotDiagnostic,
  resolveBugbotCatalog,
  resolveStaticBugbotCatalog,
} from '../bugbot_message_catalog';
import {
  renderBugbotReviewSnapshot,
  renderBugbotStatusCard,
} from '../bugbot_review_presentation_policy';

const configuration = { provider: 'codex' as const, model: 'model' };
const head = 'a'.repeat(40);
const links = {
  pullRequestUrl: 'https://example.test/org/repo/pull/1',
  commitUrl: `https://example.test/org/repo/commit/${head}`,
};

function translatedMessages(locale = 'fr-FR'): Record<string, CatalogMessage> {
  return Object.fromEntries(Object.entries(ENGLISH_BUGBOT_DEFINITION.messages).map(([id, message]) => [
    id,
    typeof message === 'string'
      ? `FR ${message}`
      : translatedPluralMessage(message, locale),
  ])) as Record<string, CatalogMessage>;
}

function translatedPluralMessage(message: CatalogPluralMessage, locale: string): CatalogPluralMessage {
  const values = Object.fromEntries(catalogPluralCategories(locale).map(category => [
    category,
    `FR ${message[category] ?? message.other}`,
  ])) as Partial<Record<CatalogPluralCategory, string>>;
  return { ...values, other: values.other ?? `FR ${message.other}` };
}

function actionableProjection() {
  return buildBugbotReviewProjection({
    pullRequestNumber: 1,
    analyzedHeadSha: head,
    findings: [{ id: 'finding', title: 'Finding', state: 'open' }],
    coverage: { status: 'complete', sources: [] },
  });
}

describe('Bugbot message catalog', () => {
  it('ships complete, unique, valid English and Spanish definitions', () => {
    expect(new Set(BUGBOT_MESSAGE_IDS).size).toBe(BUGBOT_MESSAGE_IDS.length);
    for (const definition of BUGBOT_CATALOG_DEFINITIONS) {
      expect(validateCatalogDefinition(definition, BUGBOT_MESSAGE_IDS)).toEqual([]);
    }
  });

  it('uses exact and base catalogs with real singular and plural forms', () => {
    const english = resolveStaticBugbotCatalog('en-US');
    const spanish = resolveStaticBugbotCatalog('es-MX');

    expect(english.message('bugbot.status.heading.attention', { count: 1 }, 1))
      .toBe('Bugbot: 1 finding needs attention');
    expect(english.message('bugbot.status.heading.attention', { count: 2 }, 2))
      .toBe('Bugbot: 2 findings need attention');
    expect(spanish).toMatchObject({ resolutionSource: 'base', locale: 'es-ES', requestedLocale: 'es-MX' });
    expect(spanish.message('bugbot.status.heading.attention', { count: 1 }, 1))
      .toBe('Bugbot: 1 hallazgo requiere atención');
    expect(spanish.message('bugbot.status.heading.attention', { count: 2 }, 2))
      .toBe('Bugbot: 2 hallazgos requieren atención');
    expect(renderBugbotDiagnostic({ code: 'provider-omitted-findings', count: 1 }, spanish))
      .toContain('omitió 1 hallazgo');
    expect(renderBugbotDiagnostic({ code: 'provider-omitted-findings', count: 2 }, spanish))
      .toContain('omitió 2 hallazgos');
  });

  it('renders one complete dynamic catalog for an arbitrary BCP-47 locale', async () => {
    const query = jest.fn().mockResolvedValue({
      targetLocale: 'fr-FR',
      messages: translatedMessages(),
    });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const catalog = await resolveBugbotCatalog('fr-FR', configuration, resolver);
    const replay = await resolveBugbotCatalog('fr-FR', configuration, resolver);
    const body = renderBugbotStatusCard(actionableProjection(), catalog, links);

    expect(catalog).toMatchObject({ resolutionSource: 'dynamic', locale: 'fr-FR' });
    expect(replay.message('bugbot.status.currentStatus')).toBe('FR Current status');
    expect(query).toHaveBeenCalledTimes(1);
    expect(body).toContain('## FR Bugbot: 1 finding needs attention');
    expect(body).toContain('> **FR Current status:**');
    expect(body).not.toContain('Estado actual');
    const snapshot = renderBugbotReviewSnapshot('## 🤖 Revue Bugbot\n\nHistorique.', {
      reviewIdentity: '9', analyzedHeadSha: head, currentHeadSha: head,
      projectionDigest: '12345678', coverageStatus: 'complete', findings: [],
      catalog, statusUrl: links.pullRequestUrl,
    });
    expect(snapshot.match(/## 🤖 Revue Bugbot/gu)).toHaveLength(1);
    expect(snapshot).toContain('FR All findings originating in this review are resolved.');
  });

  it('falls back atomically to English when one dynamic descriptor is missing', async () => {
    const messages = translatedMessages();
    delete messages['bugbot.status.currentStatus'];
    const resolver = new ResolveMessageCatalogUseCase({
      query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    });
    const catalog = await resolveBugbotCatalog('fr-FR', configuration, resolver);
    const body = renderBugbotStatusCard(actionableProjection(), catalog, links);

    expect(catalog).toMatchObject({
      resolutionSource: 'fallback',
      locale: 'en-US',
      fallbackReason: 'dynamic-response-invalid',
    });
    expect(body).toContain('## Bugbot: 1 finding needs attention');
    expect(body).not.toContain('FR ');
  });
});
