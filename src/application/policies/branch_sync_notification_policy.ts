import type {
  BranchDependency,
  BranchSyncComparison,
  BranchSyncNotificationComment,
} from '../ports/branch_sync_ports';
import { githubUsersMatch } from '../../domain/github_user_policy';
import { baseLanguage } from '../../domain/locale';
import { buildPublicationMarker, createSemanticDigest } from './publication_identity_policy';

export const BRANCH_SYNC_STALE_MARKER = '<!-- copilot-branch-sync:stale -->';
export const BRANCH_SYNC_ALIGNED_MARKER = '<!-- copilot-branch-sync:aligned -->';
const BRANCH_SYNC_KEY_MARKER = '<!-- copilot-branch-sync-key:';

export function selectBranchDependenciesForPush(
  dependencies: readonly BranchDependency[],
  pushedBranch: string,
): BranchDependency[] {
  const selected = dependencies.filter(
    (dependency) =>
      dependency.parentBranch === pushedBranch
      || dependency.workingBranch === pushedBranch,
  );
  const unique = new Map<string, BranchDependency>();
  for (const dependency of selected) {
    unique.set(
      `${dependency.issueNumber}:${dependency.parentBranch}:${dependency.workingBranch}`,
      dependency,
    );
  }
  return [...unique.values()];
}

export function findLatestBranchSyncComment(
  comments: readonly BranchSyncNotificationComment[],
  botLogin?: string,
  dependency?: BranchDependency,
): BranchSyncNotificationComment | undefined {
  return [...comments]
    .reverse()
    .find((comment) => isBranchSyncComment(comment.body)
      && matchesDependency(comment.body, dependency)
      && Boolean(botLogin && comment.user?.login && githubUsersMatch(botLogin, comment.user.login)));
}

export function isStaleBranchSyncComment(body: string | null | undefined): boolean {
  return body?.includes(BRANCH_SYNC_STALE_MARKER) === true;
}

export function buildStaleBranchSyncComment(input: {
  owner: string;
  repository: string;
  dependency: BranchDependency;
  comparison: BranchSyncComparison;
  locale?: string;
}): string {
  const { dependency, comparison } = input;
  const spanish = baseLanguage(input.locale ?? 'en-US') === 'es';
  const compareUrl = buildCompareUrl(
    input.owner,
    input.repository,
    dependency.parentBranch,
    dependency.workingBranch,
  );
  const divergence = comparison.aheadBy > 0
    ? spanish
      ? ` También contiene ${comparison.aheadBy} commit(s) que no están en la rama padre.`
      : ` It also contains ${comparison.aheadBy} commit(s) not present in the parent branch.`
    : '';
  return `${buildSharedBranchSyncMarker(dependency, `comparison:${createSemanticDigest(comparison)}`, createSemanticDigest({ state: 'stale', comparison }))}
${BRANCH_SYNC_STALE_MARKER}
${buildDependencyMarker(dependency)}

## ${spanish ? 'Acción necesaria: sincroniza la rama' : 'Action required: synchronize the branch'}

\`${dependency.workingBranch}\` ${spanish ? `está ${comparison.behindBy} commit(s) por detrás de su rama padre` : `is ${comparison.behindBy} commit(s) behind its parent branch`} \`${dependency.parentBranch}\`.${divergence}

${spanish ? 'Ejecuta' : 'Run'} \`/copilot sync-branch\` ${spanish ? 'en esta conversación para integrar de forma segura los cambios de la rama padre. Si Git detecta conflictos, el agente corrector configurado puede resolver los archivos permitidos antes de ejecutar las verificaciones.' : 'in this conversation to merge the parent changes safely. If Git reports conflicts, the configured fixer agent can resolve eligible files before the verification commands run.'}

[${spanish ? 'Comparar la rama padre y la rama de trabajo' : 'Compare parent and working branch'}](${compareUrl})`;
}

export function buildAlignedBranchSyncComment(
  dependency: BranchDependency,
  locale = 'en-US',
): string {
  const spanish = baseLanguage(locale) === 'es';
  return `${buildSharedBranchSyncMarker(dependency, `aligned:${createSemanticDigest(dependency)}`, createSemanticDigest({ state: 'aligned', dependency }))}
${BRANCH_SYNC_ALIGNED_MARKER}
${buildDependencyMarker(dependency)}

## ${spanish ? 'Rama sincronizada' : 'Branch synchronized'}

\`${dependency.workingBranch}\` ${spanish ? 'ya contiene el historial actual de su rama padre' : 'now contains the current history of its parent branch'} \`${dependency.parentBranch}\`.

${spanish ? 'La recomendación de sincronización anterior está resuelta.' : 'The previous synchronization recommendation has been resolved.'}`;
}

function buildSharedBranchSyncMarker(
  dependency: BranchDependency,
  sourceVersion: string,
  digest: string,
): string {
  return buildPublicationMarker({
    identity: {
      topic: 'branch-sync',
      target: { kind: 'issue', number: dependency.issueNumber },
      key: `dependency:${createSemanticDigest({ parent: dependency.parentBranch, working: dependency.workingBranch })}`,
    },
    sourceVersion,
    digest,
  });
}

function isBranchSyncComment(body: string | null): boolean {
  return body?.includes(BRANCH_SYNC_STALE_MARKER) === true
    || body?.includes(BRANCH_SYNC_ALIGNED_MARKER) === true;
}

function buildDependencyMarker(dependency: BranchDependency): string {
  return `${BRANCH_SYNC_KEY_MARKER}${encodeURIComponent(dependency.parentBranch)}:${encodeURIComponent(dependency.workingBranch)} -->`;
}

function matchesDependency(
  body: string | null,
  dependency: BranchDependency | undefined,
): boolean {
  if (!dependency || !body?.includes(BRANCH_SYNC_KEY_MARKER)) return true;
  return body.includes(buildDependencyMarker(dependency));
}

function buildCompareUrl(
  owner: string,
  repository: string,
  parentBranch: string,
  workingBranch: string,
): string {
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/compare/${encodeURIComponent(parentBranch)}...${encodeURIComponent(workingBranch)}`;
}
