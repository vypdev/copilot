import type {
  BranchDependency,
  BranchSyncComparison,
} from '../ports/branch_sync_ports';
import type { IssueCommentPublicationTarget } from '../ports/issue_lifecycle_ports';
import { githubUsersMatch } from '../../domain/github_user_policy';
import type { PublicationIdentity, TransitionPublicationIntent } from '../../domain/github_publication';
import { canonicalGitObjectId } from '../../domain/git_object_id';
import {
  buildPublicationMarker,
  createSemanticDigest,
  createTransitionFingerprint,
} from './publication_identity_policy';
import type { BranchSyncMessageCatalog } from './branch_sync_message_catalog';
import { sanitizeAgentMarkdown } from './github_comment_publication_policy';

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
  comments: readonly IssueCommentPublicationTarget[],
  botLogin?: string,
  dependency?: BranchDependency,
): IssueCommentPublicationTarget | undefined {
  return [...comments]
    .reverse()
    .find((comment) => isBranchSyncComment(comment.body)
      && matchesDependency(comment.body, dependency)
      && Boolean(botLogin && comment.user?.login && githubUsersMatch(botLogin, comment.user.login)));
}

export function branchSyncPublicationIdentity(dependency: BranchDependency): Readonly<PublicationIdentity> {
  return Object.freeze({
    topic: 'branch-sync',
    target: Object.freeze({ kind: 'issue', number: dependency.issueNumber }),
    key: `dependency:${createSemanticDigest({ parent: dependency.parentBranch, working: dependency.workingBranch })}`,
  });
}

export function buildBranchSyncTransitionIntent(
  dependency: BranchDependency,
  sourceHeadSha: string,
  locale: string,
): Readonly<TransitionPublicationIntent> {
  const canonicalHead = canonicalGitObjectId(sourceHeadSha);
  if (!canonicalHead) throw new Error('Branch synchronization transition requires a canonical source head.');
  const identity = branchSyncPublicationIdentity(dependency);
  return Object.freeze({
    kind: 'transition',
    identity,
    fingerprint: createTransitionFingerprint(identity, 'branch-sync-required', `head:${canonicalHead}`),
    messageKey: 'branchSync.transition.required',
    locale,
    values: Object.freeze({
      parentBranch: dependency.parentBranch,
      workingBranch: dependency.workingBranch,
    }),
  });
}

export function buildBranchSyncTransitionNotification(
  dependency: BranchDependency,
  messages: BranchSyncMessageCatalog,
  statusUrl: string,
): string {
  return `${safeSentence(messages.message('branchSync.transition.required', {
    workingBranch: inlineRef(dependency.workingBranch),
    parentBranch: inlineRef(dependency.parentBranch),
  }))} [${safeLinkLabel(messages.message('branchSync.transition.openStatus'))}](${statusUrl}).`;
}

export function buildBranchSyncDuplicatePointer(
  messages: BranchSyncMessageCatalog,
  canonicalUrl: string,
): string {
  return `${safeSentence(messages.message('branchSync.transition.duplicate'))} [${safeLinkLabel(messages.message('branchSync.transition.viewOriginal'))}](${canonicalUrl}).`;
}

export function buildBranchSyncStatusCommentUrl(
  owner: string,
  repository: string,
  issueNumber: number,
  commentId: number,
): string {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1
    || !Number.isSafeInteger(commentId) || commentId < 1) {
    throw new Error('Branch synchronization status link requires positive safe integer identifiers.');
  }
  return `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/issues/${issueNumber}#issuecomment-${commentId}`;
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
    identity: branchSyncPublicationIdentity(dependency),
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

function safeSentence(value: string): string {
  return sanitizeAgentMarkdown(value, 120).replace(/[\r\n]+/gu, ' ').trim();
}

function safeLinkLabel(value: string): string {
  return sanitizeAgentMarkdown(value, 40)
    .replace(/\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/https?:\/\/\S+/giu, '')
    .replace(/[\r\n()[\]<>]/gu, '')
    .trim() || 'Open notification';
}
