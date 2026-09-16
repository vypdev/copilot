import {
  catalogPlaceholders,
  validateCatalogDefinition,
  type CatalogMessage,
} from '../../../domain/message_catalog';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  ENGLISH_SETUP_DOCTOR_DEFINITION,
  SETUP_DOCTOR_CATALOG_DEFINITIONS,
  SETUP_DOCTOR_MESSAGE_IDS,
  SPANISH_SETUP_DOCTOR_DEFINITION,
  resolveSetupDoctorCatalog,
  resolveStaticSetupDoctorCatalog,
} from '../setup_doctor_message_catalog';

const configuration = { provider: 'codex' as const, model: 'model' };

function translatedMessages(): Record<string, CatalogMessage> {
  return Object.fromEntries(Object.entries(ENGLISH_SETUP_DOCTOR_DEFINITION.messages).map(([id, message]) => [
    id,
    `FR ${message as string}`,
  ]));
}

describe('setup doctor message catalog', () => {
  it('ships complete, unique, immutable English and Spanish definitions', () => {
    expect(new Set(SETUP_DOCTOR_MESSAGE_IDS).size).toBe(SETUP_DOCTOR_MESSAGE_IDS.length);
    for (const definition of SETUP_DOCTOR_CATALOG_DEFINITIONS) {
      expect(validateCatalogDefinition(definition, SETUP_DOCTOR_MESSAGE_IDS)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.messages)).toBe(true);
    }
    for (const id of SETUP_DOCTOR_MESSAGE_IDS) {
      expect(catalogPlaceholders(SPANISH_SETUP_DOCTOR_DEFINITION.messages[id]))
        .toEqual(catalogPlaceholders(ENGLISH_SETUP_DOCTOR_DEFINITION.messages[id]));
    }
  });

  it.each([
    ['en-US', 'en-US', 'exact'],
    ['en-GB', 'en-US', 'base'],
    ['es-ES', 'es-ES', 'exact'],
    ['es-MX', 'es-ES', 'base'],
    ['fr-FR', 'en-US', 'fallback'],
  ] as const)('resolves %s deterministically as %s', (requested, resolved, source) => {
    expect(resolveStaticSetupDoctorCatalog(requested)).toMatchObject({
      requestedLocale: requested,
      locale: resolved,
      resolutionSource: source,
    });
  });

  it('renders the complete Spanish presenter and diagnostic vocabulary', () => {
    const catalog = resolveStaticSetupDoctorCatalog('es-MX');
    expect(catalog.message('doctor.title.partial')).toContain('diagnóstico parcial');
    expect(catalog.message('doctor.repositoryRoot.action')).toContain('raíz del repositorio');
    expect(catalog.message('doctor.mergeQueue.ready', { verified: 2, attested: 1 }))
      .toContain('1 cubiertos por atestación exacta');
  });

  it('resolves and caches one complete dynamic catalog for an arbitrary locale', async () => {
    const query = jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages: translatedMessages() });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const first = await resolveSetupDoctorCatalog('fr-FR', configuration, resolver);
    const replay = await resolveSetupDoctorCatalog('fr-FR', configuration, resolver);

    expect(first).toMatchObject({ requestedLocale: 'fr-FR', locale: 'fr-FR', resolutionSource: 'dynamic' });
    expect(first.message('doctor.configuration.invalid', { count: 2 }))
      .toBe('FR Setup configuration has 2 validation error(s).');
    expect(replay.message('doctor.title')).toBe('FR Copilot Doctor');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back atomically to English when one dynamic descriptor is missing', async () => {
    const messages = translatedMessages();
    delete messages['doctor.title'];
    const catalog = await resolveSetupDoctorCatalog('fr-FR', configuration, new ResolveMessageCatalogUseCase({
      query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    }));

    expect(catalog).toMatchObject({
      requestedLocale: 'fr-FR',
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-response-invalid',
    });
    expect(catalog.message('doctor.title')).toBe('Copilot Doctor');
    expect(catalog.message('doctor.noMutation')).not.toContain('FR ');
  });
});
