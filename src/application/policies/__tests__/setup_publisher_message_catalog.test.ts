import { validateCatalogDefinition } from '../../../domain/message_catalog';
import * as catalogDomain from '../../../domain/message_catalog';
import { resolveStaticSetupPublisherCatalog, setupPublisherEnvironmentLocale, SETUP_PUBLISHER_CATALOG_DEFINITIONS,
  SETUP_PUBLISHER_MESSAGE_IDS } from '../setup_publisher_message_catalog';

it.each(SETUP_PUBLISHER_CATALOG_DEFINITIONS)('provides a complete immutable static $locale journey with matching placeholders', definition => {
  expect(validateCatalogDefinition(definition, SETUP_PUBLISHER_MESSAGE_IDS)).toEqual([]);
  const placeholders = (text: string) => [...text.matchAll(/\{([A-Za-z][A-Za-z0-9]*)\}/gu)].map(match => match[1]).sort();
  for (const id of SETUP_PUBLISHER_MESSAGE_IDS) expect(placeholders(String(definition.messages[id]))).toEqual(
    placeholders(String(SETUP_PUBLISHER_CATALOG_DEFINITIONS[0].messages[id])));
  expect(Object.isFrozen(definition)).toBe(true); expect(Object.isFrozen(definition.messages)).toBe(true);
  const catalog = resolveStaticSetupPublisherCatalog(definition.locale);
  expect(catalog.locale).toBe(definition.locale); expect(catalog.resolutionSource).toBe('exact');
  for (const id of SETUP_PUBLISHER_MESSAGE_IDS) {
    const message = catalog.message(id, { repository: 'owner/project', url: 'https://github.com/owner/project/pull/7',
      effects: 'effect-list', effect: 'one-effect', id: 'operation', commit: 'a'.repeat(40), branch: 'main', head: 'b'.repeat(40),
      digest: 'c'.repeat(64), path: '.copilot/setup-manifest.json', bytes: '100', hash: 'd'.repeat(64), sha: 'e'.repeat(40),
      count: 2, disposition: 'non-producer', approve: 'YES', decline: 'NO' });
    expect(message).not.toMatch(/\{[A-Za-z][A-Za-z0-9]*\}/u); expect(message.length).toBeGreaterThan(0);
  }
});
it.each([['es-MX', 'es-ES'], ['fr-CA', 'fr-FR'], ['pt-PT', 'pt-BR'], ['en-GB', 'en-US']])('selects the whole compatible static %s catalog', (requested, expected) => {
  const catalog = resolveStaticSetupPublisherCatalog(requested); expect(catalog.locale).toBe(expected); expect(catalog.resolutionSource).toBe('base');
});
it.each([undefined, '', null, {}, 'de-DE', 'C', 'POSIX', 'und', 'x-private', 'es_ES', 'es\u202e', 'es\n', ' es-ES'])('falls back atomically to English for unavailable or invalid locale', locale => {
  const catalog = resolveStaticSetupPublisherCatalog(locale);
  expect(catalog.locale).toBe('en-US');
  for (const id of ['inspecting', 'preview', 'dryRun', 'cancelled', 'recovery', 'prTitle'] as const) {
    expect(catalog.message(id)).toBe(SETUP_PUBLISHER_CATALOG_DEFINITIONS[0].messages[id]);
  }
});
it.each([
  [{ LC_ALL: 'es_ES.UTF-8', LC_MESSAGES: 'fr_FR.UTF-8', LANG: 'pt_BR.UTF-8' }, 'es-ES'],
  [{ LC_ALL: '', LC_MESSAGES: 'fr_CA.UTF-8', LANG: 'pt_BR.UTF-8' }, 'fr-CA'],
  [{ LANG: 'pt_BR.UTF-8' }, 'pt-BR'], [{ LANG: 'es' }, 'es'], [{ LANG: 'es-419.UTF-8' }, 'es-419'],
  [{ LANG: 'en_US.utf8' }, 'en-US'], [{ LANG: 'pt-PT' }, 'pt-PT'],
  [{ LC_ALL: 'invalid/locale', LC_MESSAGES: 'es_ES.UTF-8' }, 'en-US'],
  [{ LC_ALL: null, LANG: 'es_ES.UTF-8' }, 'en-US'],
  [{ LANG: 'und_US.UTF-8' }, 'en-US'], [{ LANG: 'C.UTF-8' }, 'en-US'],
  [{ LANG: 'fr_FR.UTF-8@unsupported' }, 'en-US'], [{ LANG: 'es_ES.UTF-8\n' }, 'en-US'],
  [{ LANG: 'x'.repeat(256) }, 'en-US'], [{}, 'en-US'],
] as const)('normalizes bounded POSIX locale precedence for display only', (environment, expected) => {
  expect(setupPublisherEnvironmentLocale(environment)).toBe(expected);
});

it.each(['fr-FR', 'fr-CA'])('an incomplete selected catalog falls back as a whole without mixing approval and recovery words', locale => {
  const french = SETUP_PUBLISHER_CATALOG_DEFINITIONS.find(definition => definition.locale === 'fr-FR')!;
  const { recovery: _missingRecovery, ...remaining } = french.messages;
  const incomplete = { ...french, messages: remaining } as typeof french;
  expect(validateCatalogDefinition(incomplete, SETUP_PUBLISHER_MESSAGE_IDS)).toContain('catalog-id-missing');
  const validate = catalogDomain.validateCatalogDefinition;
  const observed = jest.spyOn(catalogDomain, 'validateCatalogDefinition').mockImplementation((definition, ids) =>
    validate<string>(definition.locale === 'fr-FR' ? incomplete : definition, ids));
  try {
    const catalog = resolveStaticSetupPublisherCatalog(locale), english = resolveStaticSetupPublisherCatalog('en-US');
    expect(catalog.locale).toBe('en-US'); expect(catalog.resolutionSource).toBe('fallback');
    const values = { repository: 'owner/project', url: 'https://github.com/owner/project/pull/7', effects: 'effect-list', effect: 'one-effect',
      id: 'operation', commit: 'a'.repeat(40), branch: 'main', head: 'b'.repeat(40), digest: 'c'.repeat(64), path: 'fixed.yml',
      bytes: '100', hash: 'd'.repeat(64), sha: 'e'.repeat(40), count: 2, disposition: 'non-producer', approve: 'APPROVE', decline: 'DECLINE' };
    for (const id of SETUP_PUBLISHER_MESSAGE_IDS) expect(catalog.message(id, values)).toBe(english.message(id, values));
    expect(observed).toHaveBeenCalled();
  } finally { observed.mockRestore(); }
});
