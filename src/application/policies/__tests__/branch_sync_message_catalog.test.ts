import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  BRANCH_SYNC_MESSAGE_IDS,
  ENGLISH_BRANCH_SYNC_DEFINITION,
  resolveBranchSyncCatalog,
  resolveStaticBranchSyncCatalog,
  SPANISH_BRANCH_SYNC_DEFINITION,
} from '../branch_sync_message_catalog';

const configuration = { provider: 'codex' as const, model: 'language-model' };

describe('branch sync message catalog', () => {
  it.each([
    ['en-US', 'en-US', 'Action required: synchronize the branch'],
    ['en-GB', 'en-US', 'Action required: synchronize the branch'],
    ['es-ES', 'es-ES', 'Acción necesaria: sincroniza la rama'],
    ['es-MX', 'es-ES', 'Acción necesaria: sincroniza la rama'],
  ])('selects bundled catalogs for %s', (requested, resolved, heading) => {
    const catalog = resolveStaticBranchSyncCatalog(requested);
    expect(catalog.locale).toBe(resolved);
    expect(catalog.message('branchSync.stale.heading')).toBe(heading);
  });

  it('keeps bundled definitions complete and structurally identical', () => {
    expect(Object.keys(ENGLISH_BRANCH_SYNC_DEFINITION.messages).sort()).toEqual([...BRANCH_SYNC_MESSAGE_IDS].sort());
    expect(Object.keys(SPANISH_BRANCH_SYNC_DEFINITION.messages).sort()).toEqual([...BRANCH_SYNC_MESSAGE_IDS].sort());
    expect(Object.isFrozen(ENGLISH_BRANCH_SYNC_DEFINITION.messages)).toBe(true);
    expect(Object.isFrozen(SPANISH_BRANCH_SYNC_DEFINITION.messages)).toBe(true);
  });

  it('uses English for an empty default and for a static unsupported locale', async () => {
    expect(resolveStaticBranchSyncCatalog('')).toMatchObject({
      requestedLocale: 'en-US', locale: 'en-US', resolutionSource: 'exact',
    });
    expect(resolveStaticBranchSyncCatalog('ar-SA')).toMatchObject({
      requestedLocale: 'ar-SA', locale: 'en-US', resolutionSource: 'fallback',
      fallbackReason: 'dynamic-provider-unavailable',
    });
    await expect(resolveBranchSyncCatalog('', configuration, undefined)).resolves.toMatchObject({
      requestedLocale: 'en-US', locale: 'en-US', resolutionSource: 'exact',
    });
  });

  it('resolves an arbitrary BCP-47 locale through one schema-constrained request', async () => {
    const translated = {
      'branchSync.stale.heading': 'Synchronisation de branche requise',
      'branchSync.stale.behind': {
        one: '{workingBranch} a {count} commit de retard sur {parentBranch}.',
        other: '{workingBranch} a {count} commits de retard sur {parentBranch}.',
      },
      'branchSync.stale.ahead': {
        one: 'Elle contient aussi {count} commit absent de la branche parente.',
        other: 'Elle contient aussi {count} commits absents de la branche parente.',
      },
      'branchSync.stale.instructions': 'Exécutez {command} dans cette conversation pour intégrer les changements en sécurité.',
      'branchSync.stale.compare': 'Comparer les branches',
      'branchSync.aligned.heading': 'Branche synchronisée',
      'branchSync.aligned.status': '{workingBranch} contient maintenant l’historique actuel de {parentBranch}.',
      'branchSync.aligned.resolved': 'La recommandation précédente est résolue.',
    } as const;
    const query = jest.fn().mockResolvedValue({ targetLocale: 'fr-FR', messages: translated });

    const catalog = await resolveBranchSyncCatalog(
      'fr-FR',
      configuration,
      new ResolveMessageCatalogUseCase({ query }),
    );

    expect(catalog).toMatchObject({ requestedLocale: 'fr-FR', locale: 'fr-FR', resolutionSource: 'dynamic' });
    expect(catalog.message('branchSync.stale.heading')).toBe('Synchronisation de branche requise');
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('falls back atomically to English when dynamic output is incomplete', async () => {
    const query = jest.fn().mockResolvedValue({
      targetLocale: 'ja-JP',
      messages: { 'branchSync.stale.heading': 'ブランチの同期が必要です' },
    });

    const catalog = await resolveBranchSyncCatalog(
      'ja-JP',
      configuration,
      new ResolveMessageCatalogUseCase({ query }),
    );

    expect(catalog).toMatchObject({ locale: 'en-US', resolutionSource: 'fallback', fallbackReason: 'dynamic-response-invalid' });
    expect(catalog.message('branchSync.aligned.heading')).toBe('Branch synchronized');
  });
});
