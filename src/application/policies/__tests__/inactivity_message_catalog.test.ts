import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  ENGLISH_INACTIVITY_DEFINITION,
  INACTIVITY_MESSAGE_IDS,
  resolveInactivityCatalog,
  resolveStaticInactivityCatalog,
  SPANISH_INACTIVITY_DEFINITION,
} from '../inactivity_message_catalog';

const configuration = { provider: 'codex' as const, model: 'language-model' };

const germanMessages = Object.freeze({
  'inactivity.closure.heading': 'Issue wegen Inaktivität geschlossen',
  'inactivity.closure.reason': Object.freeze({
    one: 'Mindestens {count} Stunde lang wurde keine Aktivität festgestellt, während dieses Issue auf eine Antwort wartete.',
    other: 'Mindestens {count} Stunden lang wurde keine Aktivität festgestellt, während dieses Issue auf eine Antwort wartete.',
  }),
  'inactivity.closure.reopen': 'Wenn es noch bearbeitet werden muss, öffnen Sie es erneut und ergänzen Sie den aktuellen Kontext.',
  'inactivity.summary.scanned': Object.freeze({
    one: '{count} offenes Issue wurde geprüft.',
    other: '{count} offene Issues wurden geprüft.',
  }),
  'inactivity.summary.closed': Object.freeze({
    one: '{count} Issue wurde nach dem Inaktivitätslimit geschlossen.',
    other: '{count} Issues wurden nach dem Inaktivitätslimit geschlossen.',
  }),
  'inactivity.summary.skipped': Object.freeze({
    one: '{count} Kandidat wurde übersprungen, weil er nicht mehr berechtigt war.',
    other: '{count} Kandidaten wurden übersprungen, weil sie nicht mehr berechtigt waren.',
  }),
  'inactivity.summary.none': 'Kein Issue wurde wegen Inaktivität geschlossen.',
  'inactivity.error.scan': 'Issues konnten nicht auf Inaktivität geprüft werden.',
  'inactivity.error.revalidate': 'Issue #{issueNumber} konnte vor dem Schließen nicht erneut geprüft werden.',
  'inactivity.error.close': 'Issue #{issueNumber} konnte nicht wegen Inaktivität geschlossen werden.',
  'inactivity.error.comment': 'Issue #{issueNumber} wurde geschlossen, aber die Erklärung konnte nicht veröffentlicht werden.',
  'inactivity.error.commentImpact': 'Issue #{issueNumber} wurde ohne abschließende Erklärung geschlossen.',
  'inactivity.error.commentAction': 'Prüfen Sie Issue #{issueNumber} und ergänzen Sie die Erklärung bei Bedarf manuell.',
  'inactivity.error.commentRetainedState': 'Issue #{issueNumber} bleibt geschlossen; der Abschluss wird nicht wiederholt.',
});

describe('inactivity message catalog', () => {
  it.each([
    ['en-US', 'en-US', 'Issue closed after inactivity'],
    ['en-GB', 'en-US', 'Issue closed after inactivity'],
    ['es-ES', 'es-ES', 'Issue cerrada por inactividad'],
    ['es-MX', 'es-ES', 'Issue cerrada por inactividad'],
  ])('selects the reviewed catalog for %s', (requested, resolved, heading) => {
    const catalog = resolveStaticInactivityCatalog(requested);
    expect(catalog).toMatchObject({ requestedLocale: requested, locale: resolved });
    expect(catalog.message('inactivity.closure.heading')).toBe(heading);
  });

  it('keeps both bundled catalogs complete, frozen, and structurally identical', () => {
    expect(Object.keys(ENGLISH_INACTIVITY_DEFINITION.messages).sort()).toEqual([...INACTIVITY_MESSAGE_IDS].sort());
    expect(Object.keys(SPANISH_INACTIVITY_DEFINITION.messages).sort()).toEqual([...INACTIVITY_MESSAGE_IDS].sort());
    expect(Object.isFrozen(ENGLISH_INACTIVITY_DEFINITION.messages)).toBe(true);
    expect(Object.isFrozen(SPANISH_INACTIVITY_DEFINITION.messages)).toBe(true);
  });

  it('defaults empty input and unsupported static locales atomically to English', async () => {
    expect(resolveStaticInactivityCatalog('')).toMatchObject({
      requestedLocale: 'en-US', locale: 'en-US', resolutionSource: 'exact',
    });
    expect(resolveStaticInactivityCatalog('ja-JP')).toMatchObject({
      requestedLocale: 'ja-JP', locale: 'en-US', resolutionSource: 'fallback',
      fallbackReason: 'dynamic-provider-unavailable',
    });
    await expect(resolveInactivityCatalog('', configuration, undefined)).resolves.toMatchObject({
      requestedLocale: 'en-US', locale: 'en-US', resolutionSource: 'exact',
    });
  });

  it('resolves an arbitrary valid locale with one bounded catalog request', async () => {
    const query = jest.fn().mockResolvedValue({ targetLocale: 'de-DE', messages: germanMessages });
    const catalog = await resolveInactivityCatalog(
      'de-DE',
      configuration,
      new ResolveMessageCatalogUseCase({ query }),
    );

    expect(catalog).toMatchObject({
      requestedLocale: 'de-DE', locale: 'de-DE', resolutionSource: 'dynamic',
    });
    expect(catalog.message('inactivity.summary.closed', { count: 2 }, 2)).toBe(
      '2 Issues wurden nach dem Inaktivitätslimit geschlossen.',
    );
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back as one English slice when dynamic output is incomplete', async () => {
    const query = jest.fn().mockResolvedValue({
      targetLocale: 'de-DE',
      messages: { 'inactivity.closure.heading': 'Geschlossen' },
    });
    const catalog = await resolveInactivityCatalog(
      'de-DE',
      configuration,
      new ResolveMessageCatalogUseCase({ query }),
    );

    expect(catalog).toMatchObject({
      locale: 'en-US', resolutionSource: 'fallback', fallbackReason: 'dynamic-response-invalid',
    });
    expect(catalog.message('inactivity.error.scan')).toBe('Unable to scan issues for inactivity closure.');
  });
});
