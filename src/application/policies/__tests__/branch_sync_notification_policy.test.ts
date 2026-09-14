import {
  BRANCH_SYNC_ALIGNED_MARKER,
  BRANCH_SYNC_STALE_MARKER,
  buildAlignedBranchSyncComment,
  buildStaleBranchSyncComment,
  findLatestBranchSyncComment,
  isStaleBranchSyncComment,
  selectBranchDependenciesForPush,
} from "../branch_sync_notification_policy";
import { ResolveMessageCatalogUseCase } from '../../usecases/localization/resolve_message_catalog_use_case';
import {
  BRANCH_SYNC_MESSAGE_IDS,
  ENGLISH_BRANCH_SYNC_DEFINITION,
  resolveBranchSyncCatalog,
  resolveStaticBranchSyncCatalog,
  SPANISH_BRANCH_SYNC_DEFINITION,
} from '../branch_sync_message_catalog';

const english = resolveStaticBranchSyncCatalog('en-US');
const spanish = resolveStaticBranchSyncCatalog('es-MX');

const dependency = {
  issueNumber: 42,
  parentBranch: "release/2.0",
  workingBranch: "feature/42-sync",
};

describe("branch sync notification policy", () => {
  it("selects dependencies affected through either side and de-duplicates them", () => {
    expect(selectBranchDependenciesForPush([dependency, dependency], "release/2.0")).toEqual([dependency]);
    expect(selectBranchDependenciesForPush([dependency], "feature/42-sync")).toEqual([dependency]);
    expect(selectBranchDependenciesForPush([dependency], "unrelated")).toEqual([]);
    const second = { ...dependency, workingBranch: "feature/43" };
    expect(selectBranchDependenciesForPush([dependency, second], "release/2.0")).toEqual([dependency, second]);
  });

  it("only selects the latest marker comment authored by the authenticated bot", () => {
    const comments = [
      { id: 1, body: BRANCH_SYNC_STALE_MARKER, user: { login: "vypbot" } },
      { id: 2, body: BRANCH_SYNC_STALE_MARKER, user: { login: "mallory" } },
      { id: 3, body: BRANCH_SYNC_ALIGNED_MARKER, user: { login: "VYPBOT" } },
    ];
    expect(findLatestBranchSyncComment(comments, "vypbot")).toEqual(comments[2]);
    expect(findLatestBranchSyncComment(comments, "other")).toBeUndefined();
    expect(findLatestBranchSyncComment(comments)).toBeUndefined();
  });

  it("keeps notification state independent for multiple branches on one issue", () => {
    const firstBody = buildAlignedBranchSyncComment(dependency, english);
    const second = { ...dependency, workingBranch: "feature/43" };
    const secondBody = buildStaleBranchSyncComment({
      owner: "org", repository: "repo", dependency: second, comparison: { aheadBy: 0, behindBy: 1 },
      messages: english,
    });
    const comments = [
      { id: 1, body: firstBody, user: { login: "vypbot" } },
      { id: 2, body: secondBody, user: { login: "vypbot" } },
    ];
    expect(findLatestBranchSyncComment(comments, "vypbot", dependency)?.id).toBe(1);
    expect(findLatestBranchSyncComment(comments, "vypbot", second)?.id).toBe(2);
  });

  it("renders actionable stale and resolved messages", () => {
    const stale = buildStaleBranchSyncComment({
      owner: "org",
      repository: "repo",
      dependency,
      comparison: { aheadBy: 2, behindBy: 3 },
      messages: english,
    });
    expect(stale).toContain(BRANCH_SYNC_STALE_MARKER);
    expect(stale).toContain('topic="branch-sync" target="issue:42"');
    expect(stale).toContain("3 commits behind");
    expect(stale).toContain("2 commits not present");
    expect(stale).toContain("/copilot sync-branch");
    expect(stale).toContain("release%2F2.0...feature%2F42-sync");
    expect(isStaleBranchSyncComment(stale)).toBe(true);

    const aligned = buildAlignedBranchSyncComment(dependency, english);
    expect(aligned).toContain(BRANCH_SYNC_ALIGNED_MARKER);
    expect(aligned).toContain("now contains");
    expect(isStaleBranchSyncComment(aligned)).toBe(false);
  });

  it('uses locale-aware singular forms and neutralizes unsafe ref presentation', () => {
    const unsafe = { ...dependency, workingBranch: 'feature/`@team' };
    const stale = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency: unsafe,
      comparison: { aheadBy: 1, behindBy: 1 }, messages: english,
    });
    expect(stale).toContain('is 1 commit behind');
    expect(stale).toContain('contains 1 commit not present');
    expect(stale).not.toContain('`@team');
    expect(stale).toContain('@\u200bteam');
  });

  it('renders the same semantic branch states in Spanish', () => {
    const stale = buildStaleBranchSyncComment({
      owner: 'org', repository: 'repo', dependency,
      comparison: { aheadBy: 1, behindBy: 2 }, messages: spanish,
    });
    expect(stale).toContain('## Acción necesaria: sincroniza la rama');
    expect(stale).toContain('Ejecuta `/copilot sync-branch`');
    expect(buildAlignedBranchSyncComment(dependency, spanish)).toContain('## Rama sincronizada');
  });
});

describe('branch sync message catalog', () => {
  const configuration = { provider: 'codex' as const, model: 'language-model' };

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
    const resolve = jest.fn().mockResolvedValue({
      requestedLocale: 'en-US',
      resolvedLocale: 'en-US',
      source: 'exact',
      messages: ENGLISH_BRANCH_SYNC_DEFINITION.messages,
    });
    await expect(resolveBranchSyncCatalog('', configuration, { resolve })).resolves.toMatchObject({
      requestedLocale: 'en-US', locale: 'en-US', resolutionSource: 'exact',
    });
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ targetLocale: 'en-US' }));
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
