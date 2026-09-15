import type {
  DeploymentOperationSnapshot,
  DeploymentPhase,
  ReconciliationTargetState,
} from '../../domain/deployment_operation';
import { requiredDeploymentFailure } from '../../domain/deployment_operation';
import { buildManagedPullRequestMarker } from '../../domain/managed_pull_request';
import {
  deploymentCopy,
  resolveStaticDeploymentCatalog,
  type DeploymentCopy,
  type DeploymentMessageCatalog,
} from './deployment_message_catalog';
import { buildPublicationMarker, createSemanticDigest } from './publication_identity_policy';

export const DEPLOYMENT_DASHBOARD_MARKER = 'copilot-deployment-dashboard';

export interface DeploymentPresentationContext {
  readonly owner: string;
  readonly repository: string;
  readonly issue: number;
  readonly repositoryLocale: string;
  readonly issueLocale: string;
  readonly pullRequestLocale: string;
  readonly workflowRunUrl?: string;
  readonly packageName?: string;
}

export type DeploymentMilestone =
  | { readonly kind: 'promotion-merged'; readonly pullRequest: number; readonly productionSha: string }
  | { readonly kind: 'publication-complete'; readonly tag: string; readonly productionSha: string }
  | { readonly kind: 'reconciliation-blocked'; readonly reason: string }
  | { readonly kind: 'orchestration-complete'; readonly tag: string };

export function deploymentDashboardMarker(operationId: string, issue: number): string {
  return `<!-- ${DEPLOYMENT_DASHBOARD_MARKER} operation-id="${safeMarkerValue(operationId)}" issue="${issue}" -->`;
}

export function renderDeploymentDashboard(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
  catalog: DeploymentMessageCatalog = resolveStaticDeploymentCatalog(context.issueLocale),
): string {
  const messages = deploymentCopy(catalog);
  const title = operation.kind === 'release' ? messages.release : messages.hotfix;
  const action = deploymentAction(operation, messages);
  const lines = [
    buildPublicationMarker({
      identity: {
        topic: 'release',
        target: { kind: 'issue', number: context.issue },
        key: `operation:${createSemanticDigest(operation.operationId)}`,
      },
      sourceVersion: `revision:${operation.revision}`,
      digest: createSemanticDigest({
        requestedLocale: catalog.requestedLocale,
        resolvedLocale: catalog.locale,
        operation,
      }),
    }),
    deploymentDashboardMarker(operation.operationId, context.issue), '',
    `## ${operation.phase === 'blocked' ? '❌' : operation.phase === 'completed' ? '✅' : '🚀'} ${title} ${inline(operation.version)}`, '',
    `> **${messages.currentStatus}: ${messages.phase[operation.phase]}.**`,
  ];
  if (action.required) lines.push('', `### ${messages.actionRequired}`, '', action.message);
  else lines.push(`> ${action.message}`);
  lines.push('');

  if (operation.phase === 'blocked') {
    lines.push(...factTable(operation, messages), '', `### ${messages.protectedFacts}`, '', protectedFact(operation, messages), '');
  }
  if (operation.presentationMode !== 'quiet') {
    lines.push(`### ${messages.progress}`, '', ...progressLines(operation, messages), '');
  }
  if (operation.presentationMode === 'guided' && operation.diagrams) {
    lines.push(...deploymentDiagram(messages), '');
  }
  if (operation.presentationMode !== 'quiet') {
    lines.push(`### ${messages.currentTransition}`, '', ...transitionTable(operation, messages), '');
    if (operation.phase !== 'blocked') {
      lines.push(`### ${messages.whatNext}`, '', nextDescription(operation, messages, catalog), '');
    }
    lines.push(`### ${messages.links}`, '', deploymentLinks(operation, context, messages, catalog).join(' · '), '');
  }
  lines.push(
    '<details>', `<summary>${messages.technical}</summary>`, '',
    `- ${messages.operation}: ${inline(operation.operationId)}`,
    `- ${messages.strategy}: ${inline(operation.strategy)}`,
    `- ${messages.pullRequestMode}: ${inline(operation.selectedPrMode ?? operation.prMode)}`,
    `- ${messages.sourceSha}: ${inline(operation.sourceSha)}`,
    `- ${messages.productionSha}: ${inline(operation.productionSha ?? messages.pending)}`,
    '</details>',
  );
  return lines.join('\n');
}

export function renderPromotionPullRequest(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
  catalog: DeploymentMessageCatalog = resolveStaticDeploymentCatalog(context.pullRequestLocale),
): { title: string; body: string } {
  const messages = deploymentCopy(catalog);
  const kind = operation.kind;
  const title = catalog.message('deployment.template.promotionTitle', {
    kind,
    version: safeText(operation.version),
    branch: safeText(operation.productionBranch),
  }).slice(0, 240);
  const body = [
    `## 🚀 ${messages.promotionOverview}`, '',
    `> **${messages.purpose}:** ${messages.purposePromotion}.`, '',
    `| ${messages.origin} | ${messages.preparedSource} | ${messages.destination} | ${messages.publication} |`,
    '|---|---|---|---|',
    `| ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)} | ${inline(`${operation.sourceBranch}@${shortSha(operation.sourceSha)}`)} | ${inline(operation.productionBranch)} | ${messages.notPublished} |`, '',
    `### ${messages.readyBeforeReview}`, '',
    `- ✅ ${messages.buildValidation}`, `- ✅ ${messages.packageSmoke}`, `- ⏳ ${messages.protectedChecks}`, '',
    `### ${messages.afterMerge}`, '',
    `- ${messages.afterPromotion}`, `- ${messages.reconciliation}: ${inline(operation.developmentBranch)}.`, '',
    `[${messages.compare}](${compareUrl(context, operation.productionBranch, operation.sourceBranch)}) · [${messages.controlCenter}](${issueUrl(context)})`, '',
    '<details>', `<summary>${messages.technical}</summary>`, '',
    catalog.message('deployment.template.promotionTechnical', {
      operation: inline(operation.operationId),
      strategy: inline(operation.strategy),
      mergeMode: inline(operation.prMode),
    }),
    '</details>', '',
    buildManagedPullRequestMarker({ operationId: operation.operationId, phase: 'promotion', issue: context.issue }),
  ].join('\n');
  return { title, body };
}

export function renderReconciliationPullRequest(
  operation: DeploymentOperationSnapshot,
  target: ReconciliationTargetState,
  context: DeploymentPresentationContext,
  catalog: DeploymentMessageCatalog = resolveStaticDeploymentCatalog(context.pullRequestLocale),
): { title: string; body: string } {
  const messages = deploymentCopy(catalog);
  const kind = operation.kind;
  const title = catalog.message('deployment.template.reconciliationTitle', {
    kind,
    version: safeText(operation.version),
    source: safeText(target.sourceBranch),
    target: safeText(target.targetBranch),
  }).slice(0, 240);
  const body = [
    `## 🔄 ${messages.reconciliationOverview}`, '',
    `> **${messages.alreadyPublished}.** ${messages.noRepublish}`, '',
    `| ${messages.productionFact} | ${messages.developmentTarget} | ${messages.completionEffect} |`, '|---|---|---|',
    `| ${inline(`${operation.tag}@${shortSha(operation.productionSha ?? target.sourceSha)}`)} | ${inline(target.targetBranch)} | ${operation.issueCompletion === 'close' ? messages.closeIssue : messages.keepIssue} |`, '',
    ...(target.syncBranch ? [`${messages.syncReason} ${inline(target.syncBranch)}`, ''] : []),
    `[${messages.compare}](${compareUrl(context, target.targetBranch, target.syncBranch ?? target.sourceBranch)}) · [${messages.controlCenter}](${issueUrl(context)})`, '',
    '<details>', `<summary>${messages.technical}</summary>`, '',
    catalog.message('deployment.template.reconciliationTechnical', {
      operation: inline(operation.operationId),
      sourceSha: inline(target.sourceSha),
    }),
    '</details>', '',
    buildManagedPullRequestMarker({ operationId: operation.operationId, phase: 'reconciliation', issue: context.issue }),
  ].join('\n');
  return { title, body };
}

export function renderDeploymentJobSummary(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
  previousPhase?: DeploymentPhase,
  catalog: DeploymentMessageCatalog = resolveStaticDeploymentCatalog(context.repositoryLocale),
): string {
  const messages = deploymentCopy(catalog);
  const failure = operation.phase === 'blocked' ? requiredDeploymentFailure(operation) : undefined;
  const externallyPending = operation.phase === 'promotion_pr_pending' || operation.phase === 'reconciliation_pending';
  const result = operation.phase === 'blocked'
    ? messages.workflowFailure
    : externallyPending ? messages.externalWait : messages.phase[operation.phase];
  const lines = [
    `# ${operation.phase === 'blocked' ? '❌' : externallyPending ? '⏳' : '✅'} ${messages.jobSummary}`, '',
    `> **${messages.result}: ${result}.**`, '',
    `| ${messages.previousPhase} | ${messages.resultingPhase} | ${messages.retryable} |`, '|---|---|---|',
    `| ${inline(previousPhase ?? operation.phase)} | ${inline(operation.phase)} | ${failure?.retryable ? messages.yes : messages.no} |`, '',
    `- ${messages.operation}: ${inline(operation.operationId)}`,
    `- ${catalog.message('deployment.template.jobState', { version: operation.stateVersion, revision: operation.revision })}`,
    `- ${catalog.message('deployment.template.admissionScope', { issue: context.issue })}`,
    `- ${messages.origin}: ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)}`,
    `- ${messages.preparedSource}: ${inline(`${operation.sourceBranch}@${shortSha(operation.sourceSha)}`)}`,
    `- ${messages.productionFact}: ${inline(operation.productionSha ? `${operation.productionBranch}@${shortSha(operation.productionSha)}` : messages.pending)}`,
    `- ${operation.publicationVerified ? messages.alreadyPublished : messages.notPublished}`,
    `- ${messages.publicationReceipt}: ${operation.publicationReceipt
      ? inline(`${operation.publicationReceipt.tag}@${shortSha(operation.publicationReceipt.productionSha)}`)
      : messages.absent}`, '',
  ];
  if (operation.phase === 'blocked') {
    lines.push(
      `## ${messages.actionRequired}`, '',
      `${safeText(failure!.message)}. ${failure!.retryable ? messages.retryAfterCorrection : messages.manualIntervention}.`, '',
    );
  }
  lines.push(deploymentLinks(operation, context, messages, catalog).join(' · '));
  return lines.join('\n');
}

export function renderDeploymentMilestone(
  milestone: DeploymentMilestone,
  catalog: DeploymentMessageCatalog,
): string {
  switch (milestone.kind) {
    case 'promotion-merged':
      return catalog.message('deployment.milestone.promotionMerged', {
        number: milestone.pullRequest,
        productionSha: inline(milestone.productionSha),
      });
    case 'publication-complete':
      return catalog.message('deployment.milestone.publicationComplete', {
        tag: inline(milestone.tag),
        productionSha: inline(milestone.productionSha),
      });
    case 'reconciliation-blocked':
      return catalog.message('deployment.milestone.reconciliationBlocked', { reason: safeText(milestone.reason) });
    case 'orchestration-complete':
      return catalog.message('deployment.milestone.complete', { tag: inline(milestone.tag) });
  }
}

function progressLines(operation: DeploymentOperationSnapshot, messages: DeploymentCopy): string[] {
  const phase = operation.phase === 'blocked' ? requiredDeploymentFailure(operation).previousPhase : operation.phase;
  const reached = (expected: DeploymentPhase): boolean => phaseRank(phase) >= phaseRank(expected);
  return [
    `- [x] ${messages.cut}: ${inline(`${operation.originBranch}@${shortSha(operation.originSha)}`)}`,
    `- [x] ${messages.buildValidation} + ${messages.packageSmoke}`,
    `- [${operation.productionSha || reached('promoted') ? 'x' : ' '}] ${messages.promotion}: ${inline(operation.productionBranch)}`,
    `- [${operation.publicationVerified ? 'x' : ' '}] ${operation.publicationVerified ? messages.alreadyPublished : messages.notPublished}`,
    `- [${reconciliationCompleted(operation) ? 'x' : ' '}] ${messages.reconciliation}: ${inline(operation.developmentBranch)}`,
    `- [${operation.phase === 'completed' ? 'x' : ' '}] ${messages.cleanup}`,
  ];
}

function deploymentDiagram(messages: DeploymentCopy): string[] {
  const { source, prepared, production, accepted, publication, reconciliation, complete } = messages.diagram;
  return [
    '```mermaid', 'flowchart LR', `    D[${source}] --> R[${prepared}]`, `    R --> P[${production}]`,
    `    P --> A[${accepted}]`, `    A --> N[${publication}]`, `    N --> B[${reconciliation}]`,
    `    B --> C[${complete}]`, '```', '', messages.fallback,
  ];
}

function transitionTable(operation: DeploymentOperationSnapshot, messages: DeploymentCopy): string[] {
  const activeTarget = operation.reconciliationTargets.find(target => target.status !== 'completed');
  const from = activeTarget?.syncBranch ?? activeTarget?.sourceBranch ?? operation.sourceBranch;
  const to = activeTarget?.targetBranch ?? operation.productionBranch;
  return [
    `| ${messages.from} | ${messages.to} | ${messages.state} |`, '|---|---|---|',
    `| ${inline(from)} | ${inline(to)} | ${safeText(messages.phase[operation.phase])} |`,
  ];
}

function factTable(operation: DeploymentOperationSnapshot, messages: DeploymentCopy): string[] {
  return [
    `| ${messages.productionUpdated} | ${messages.publication} | ${messages.developmentSynchronized} |`, '|---|---|---|',
    `| ${operation.productionSha ? messages.yes : messages.no} | ${operation.publicationVerified ? messages.yes : messages.no} | ${reconciliationCompleted(operation) ? messages.yes : messages.no} |`,
  ];
}

function protectedFact(operation: DeploymentOperationSnapshot, messages: DeploymentCopy): string {
  if (operation.publicationVerified) return `${messages.alreadyPublished}; ${messages.noRepublish}`;
  if (operation.productionSha) return `${messages.productionUpdated}: ${messages.yes}. ${messages.notPublished}.`;
  return `${messages.productionUpdated}: ${messages.no}. ${messages.notPublished}.`;
}

function nextDescription(
  operation: DeploymentOperationSnapshot,
  messages: DeploymentCopy,
  catalog: DeploymentMessageCatalog,
): string {
  if (operation.phase === 'promotion_pr_pending' || operation.phase === 'publishing' || operation.phase === 'promoted') {
    return messages.afterPromotion;
  }
  if (operation.phase === 'reconciliation_pending' || operation.phase === 'published') return messages.noRepublish;
  if (operation.phase === 'completed') {
    return `${messages.productionUpdated}: ${messages.yes}. ${messages.developmentSynchronized}: ${messages.yes}.`;
  }
  return catalog.message('deployment.template.nextPromotion', {
    source: inline(operation.sourceBranch),
    production: inline(operation.productionBranch),
  });
}

function deploymentAction(operation: DeploymentOperationSnapshot, messages: DeploymentCopy): { required: boolean; message: string } {
  const manual = (operation.selectedPrMode ?? operation.prMode) === 'create-only'
    && (operation.phase === 'promotion_pr_pending' || operation.phase === 'reconciliation_pending');
  if (manual) return { required: true, message: `${messages.protectedChecks}: ${messages.reviewManagedPr}.` };
  if (operation.phase !== 'blocked') return { required: false, message: messages.noAction };
  const failure = requiredDeploymentFailure(operation);
  return {
    required: true,
    message: failure.retryable
      ? `${safeText(failure.message)}. ${messages.retryAfterCorrection}.`
      : `${safeText(failure.message)}. ${messages.manualIntervention}.`,
  };
}

function deploymentLinks(
  operation: DeploymentOperationSnapshot,
  context: DeploymentPresentationContext,
  messages: DeploymentCopy,
  catalog: DeploymentMessageCatalog,
): string[] {
  const links = [`[${messages.controlCenter}](${issueUrl(context)})`];
  links.push(markdownLink(catalog.message('deployment.template.sourceBranchLink', {
    branch: safeText(operation.sourceBranch),
  }), branchUrl(context, operation.sourceBranch)));
  links.push(markdownLink(catalog.message('deployment.template.originCommitLink', {
    commit: shortSha(operation.originSha),
  }), commitUrl(context, operation.originSha)));
  links.push(markdownLink(catalog.message('deployment.template.preparedCommitLink', {
    commit: shortSha(operation.sourceSha),
  }), commitUrl(context, operation.sourceSha)));
  const activeTarget = operation.reconciliationTargets.find(target => target.status !== 'completed');
  links.push(`[${messages.compare}](${compareUrl(
    context,
    activeTarget?.targetBranch ?? operation.productionBranch,
    activeTarget?.syncBranch ?? activeTarget?.sourceBranch ?? operation.sourceBranch,
  )})`);
  if (operation.promotionPullRequest) {
    links.push(markdownLink(catalog.message('deployment.template.promotionPullRequestLink', {
      number: operation.promotionPullRequest,
    }), pullRequestUrl(context, operation.promotionPullRequest)));
  }
  for (const target of operation.reconciliationTargets) {
    if (target.pullRequest) {
      links.push(markdownLink(catalog.message('deployment.template.reconciliationPullRequestLink', {
        number: target.pullRequest,
      }), pullRequestUrl(context, target.pullRequest)));
    }
  }
  if (operation.productionSha) {
    links.push(markdownLink(catalog.message('deployment.template.productionCommitLink', {
      commit: shortSha(operation.productionSha),
    }), commitUrl(context, operation.productionSha)));
  }
  if (operation.publicationVerified) {
    links.push(markdownLink(catalog.message('deployment.template.releaseLink', {
      tag: safeText(operation.tag),
    }), `${repositoryUrl(context)}/releases/tag/${encodeURIComponent(operation.tag)}`));
    const actionTag = `v${operation.version.split('.')[0]}`;
    links.push(markdownLink(catalog.message('deployment.template.actionTagLink', {
      tag: actionTag,
    }), branchUrl(context, actionTag)));
    if (context.packageName) {
      links.push(markdownLink(catalog.message('deployment.template.npmLink', {
        package: safeText(context.packageName),
        version: safeText(operation.version),
      }), npmVersionUrl(context.packageName, operation.version)));
    }
  }
  if (context.workflowRunUrl) {
    links.push(markdownLink(
      catalog.message('deployment.template.workflowRunLink'),
      safeUrl(context.workflowRunUrl),
    ));
  }
  return links;
}

function reconciliationCompleted(operation: DeploymentOperationSnapshot): boolean {
  return operation.phase === 'completed'
    || (operation.reconciliationTargets.length > 0
      && operation.reconciliationTargets.every(target => target.status === 'completed'));
}

function phaseRank(phase: DeploymentPhase): number {
  return ['preparing', 'promotion_pr_pending', 'promoted', 'publishing', 'published', 'reconciliation_pending', 'completed'].indexOf(phase);
}

function repositoryUrl(context: DeploymentPresentationContext): string {
  return `https://github.com/${encodeURIComponent(context.owner)}/${encodeURIComponent(context.repository)}`;
}

function issueUrl(context: DeploymentPresentationContext): string {
  return `${repositoryUrl(context)}/issues/${context.issue}`;
}

function pullRequestUrl(context: DeploymentPresentationContext, number: number): string {
  return `${repositoryUrl(context)}/pull/${number}`;
}

function branchUrl(context: DeploymentPresentationContext, branch: string): string {
  return `${repositoryUrl(context)}/tree/${encodeURIComponent(branch)}`;
}

function commitUrl(context: DeploymentPresentationContext, sha: string): string {
  return `${repositoryUrl(context)}/commit/${encodeURIComponent(sha)}`;
}

function npmVersionUrl(packageName: string, version: string): string {
  return `https://www.npmjs.com/package/${encodeURIComponent(packageName)}/v/${encodeURIComponent(version)}`;
}

function compareUrl(context: DeploymentPresentationContext, base: string, head: string): string {
  return `${repositoryUrl(context)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`;
}

function markdownLink(label: string, url: string): string {
  return `[${safeLinkLabel(label)}](${url})`;
}

function inline(value: string): string {
  return `\`${safeText(value)}\``;
}

function safeText(value: string): string {
  return value.replace(/[\r\n`<>|]/gu, '').replace(/@/gu, '@\u200b').replace(/::/gu, '﹕﹕').slice(0, 240);
}

function safeLinkLabel(value: string): string {
  return safeText(value).replace(/[[\]()]/gu, '');
}

function safeMarkerValue(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]/gu, '').slice(0, 128);
}

function safeUrl(value: string): string {
  return /^https:\/\/github\.com\//u.test(value) ? value : 'https://github.com';
}

function shortSha(value: string): string {
  return safeText(value).slice(0, 7);
}
