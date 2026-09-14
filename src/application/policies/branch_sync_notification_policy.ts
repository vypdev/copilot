import type {
  BranchDependency,
  BranchSyncComparison,
  BranchSyncNotificationComment,
} from '../ports/branch_sync_ports';
import { githubUsersMatch } from '../../domain/github_user_policy';
import { buildPublicationMarker, createSemanticDigest } from './publication_identity_policy';
import type { BranchSyncMessageCatalog } from './branch_sync_message_catalog';

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
  messages: BranchSyncMessageCatalog;
}): string {
  const { dependency, comparison } = input;
  const compareUrl = buildCompareUrl(
    input.owner,
    input.repository,
    dependency.parentBranch,
    dependency.workingBranch,
  );
  const divergence = comparison.aheadBy > 0
    ? ` ${input.messages.message('branchSync.stale.ahead', { count: comparison.aheadBy }, comparison.aheadBy)}`
    : '';
  return `${buildSharedBranchSyncMarker(dependency, `comparison:${createSemanticDigest(comparison)}`, createSemanticDigest({ state: 'stale', comparison }))}
${BRANCH_SYNC_STALE_MARKER}
${buildDependencyMarker(dependency)}

## ${input.messages.message('branchSync.stale.heading')}

${input.messages.message('branchSync.stale.behind', {
    workingBranch: inlineRef(dependency.workingBranch),
    parentBranch: inlineRef(dependency.parentBranch),
    count: comparison.behindBy,
  }, comparison.behindBy)}${divergence}

${input.messages.message('branchSync.stale.instructions', { command: '`/copilot sync-branch`' })}

[${input.messages.message('branchSync.stale.compare')}](${compareUrl})`;
}

export function buildAlignedBranchSyncComment(
  dependency: BranchDependency,
  messages: BranchSyncMessageCatalog,
): string {
  return `${buildSharedBranchSyncMarker(dependency, `aligned:${createSemanticDigest(dependency)}`, createSemanticDigest({ state: 'aligned', dependency }))}
${BRANCH_SYNC_ALIGNED_MARKER}
${buildDependencyMarker(dependency)}

## ${messages.message('branchSync.aligned.heading')}

${messages.message('branchSync.aligned.status', {
    workingBranch: inlineRef(dependency.workingBranch),
    parentBranch: inlineRef(dependency.parentBranch),
  })}

${messages.message('branchSync.aligned.resolved')}`;
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

function inlineRef(value: string): string {
  return `\`${value.replace(/[\r\n`<>]/gu, '').replace(/@/gu, '@\u200b').slice(0, 255)}\``;
}
