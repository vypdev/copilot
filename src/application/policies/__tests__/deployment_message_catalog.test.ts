import type { CatalogMessage } from '../../../domain/message_catalog';
import { catalogPlaceholders, validateCatalogDefinition } from '../../../domain/message_catalog';
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  DEPLOYMENT_CATALOG_DEFINITIONS,
  DEPLOYMENT_MESSAGE_IDS,
  ENGLISH_DEPLOYMENT_DEFINITION,
  SPANISH_DEPLOYMENT_DEFINITION,
  deploymentCopy,
  resolveDeploymentCatalog,
  resolveStaticDeploymentCatalog,
} from '../deployment_message_catalog';

const configuration = { provider: 'codex' as const, model: 'model' };

function translatedMessages(): Record<string, CatalogMessage> {
  return Object.fromEntries(Object.entries(ENGLISH_DEPLOYMENT_DEFINITION.messages).map(([id, message]) => [
    id,
    `FR ${message as string}`,
  ]));
}

describe('deployment message catalog', () => {
  it('ships complete, unique, immutable English and Spanish definitions', () => {
    expect(new Set(DEPLOYMENT_MESSAGE_IDS).size).toBe(DEPLOYMENT_MESSAGE_IDS.length);
    for (const definition of DEPLOYMENT_CATALOG_DEFINITIONS) {
      expect(validateCatalogDefinition(definition, DEPLOYMENT_MESSAGE_IDS)).toEqual([]);
      expect(Object.isFrozen(definition)).toBe(true);
      expect(Object.isFrozen(definition.messages)).toBe(true);
    }
    for (const id of DEPLOYMENT_MESSAGE_IDS) {
      expect(catalogPlaceholders(SPANISH_DEPLOYMENT_DEFINITION.messages[id]))
        .toEqual(catalogPlaceholders(ENGLISH_DEPLOYMENT_DEFINITION.messages[id]));
    }
  });

  it.each([
    ['en-US', 'en-US', 'exact'],
    ['en-GB', 'en-US', 'base'],
    ['es-ES', 'es-ES', 'exact'],
    ['es-MX', 'es-ES', 'base'],
    ['fr-FR', 'en-US', 'fallback'],
  ] as const)('resolves %s deterministically as %s', (requested, resolved, source) => {
    const catalog = resolveStaticDeploymentCatalog(requested);
    expect(catalog).toMatchObject({ requestedLocale: requested, locale: resolved, resolutionSource: source });
  });

  it('projects a deeply immutable typed copy', () => {
    const copy = deploymentCopy(resolveStaticDeploymentCatalog('es-ES'));
    expect(copy.currentStatus).toBe('Estado actual');
    expect(copy.phase.publishing).toBe('publicando artefactos');
    expect(copy.diagram.complete).toBe('Completada');
    expect(Object.isFrozen(copy)).toBe(true);
    expect(Object.isFrozen(copy.phase)).toBe(true);
    expect(Object.isFrozen(copy.diagram)).toBe(true);
  });

  it('renders one complete cached dynamic catalog for an arbitrary BCP-47 locale', async () => {
    const query = jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages: translatedMessages() });
    const resolver = new ResolveMessageCatalogUseCase({ query });
    const catalog = await resolveDeploymentCatalog('fr-FR', configuration, resolver);
    const replay = await resolveDeploymentCatalog('fr-FR', configuration, resolver);

    expect(catalog).toMatchObject({ requestedLocale: 'fr-FR', locale: 'fr-FR', resolutionSource: 'dynamic' });
    expect(catalog.message('deployment.template.promotionTitle', {
      kind: 'Release', version: '3.4.0', branch: 'master',
    })).toBe('FR Release(3.4.0): promote to master');
    expect(replay.message('deployment.currentStatus')).toBe('FR Current status');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back atomically to English when one dynamic descriptor is missing', async () => {
    const messages = translatedMessages();
    delete messages['deployment.currentStatus'];
    const resolver = new ResolveMessageCatalogUseCase({
      query: jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages }),
    });
    const catalog = await resolveDeploymentCatalog('fr-FR', configuration, resolver);

    expect(catalog).toMatchObject({
      requestedLocale: 'fr-FR',
      locale: 'en-US',
      resolutionSource: 'fallback',
      fallbackReason: 'dynamic-response-invalid',
    });
    expect(catalog.message('deployment.currentStatus')).toBe('Current status');
    expect(catalog.message('deployment.progress')).not.toContain('FR ');
  });
});
