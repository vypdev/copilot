import type { AgentConfiguration, AgentTask } from '../../../../../domain/agent';
import type { BugbotReviewConfiguration } from '../../../../../domain/bugbot/review_configuration';
import { parsePositiveSafeInteger } from '../../../../../domain/positive_integer_policy';

export interface BugbotContextSelectionContext {
  readonly repository: {
    readonly owner: string;
    readonly name: string;
    readonly id?: number;
  };
  readonly target: {
    readonly issueNumber: number;
    readonly isPullRequest: boolean;
    readonly pullRequestNumber: number;
    readonly headBranch: string;
    readonly commitBranch: string;
    readonly baseBranch: string;
    readonly pullRequestAction: string;
    readonly draft: boolean;
  };
  readonly trigger: {
    readonly kind: string;
    readonly before?: string;
    readonly after?: string;
    readonly expectedHeadSha?: string;
    readonly headOwner: string;
  };
  readonly trustedAuthorLogin?: string;
  readonly ignorePatterns: readonly string[];
  readonly organizationRules: readonly string[];
}

export interface BugbotReviewOperationContext extends BugbotContextSelectionContext {
  readonly locale: {
    readonly pullRequest: string;
  };
  readonly analysis: {
    readonly agentConfiguration: Readonly<AgentConfiguration>;
    readonly minimumSeverity: string;
    readonly commentLimit: number;
    readonly reviewConfiguration: Readonly<Omit<BugbotReviewConfiguration, 'organizationRules'>>;
  };
}

export interface BugbotContextSelectionSource {
  readonly owner: string;
  readonly repo: string;
  readonly issueNumber: number;
  readonly isPullRequest: boolean;
  readonly eventName: string;
  readonly tokenUser?: string;
  readonly pullRequest: {
    readonly number: number;
    readonly head: string;
    readonly action: string;
  };
  readonly commit: { readonly branch?: string };
  readonly currentConfiguration: { readonly parentBranch?: string };
  readonly branches: { readonly development?: string };
  readonly inputs?: {
    readonly before?: string;
    readonly after?: string;
    readonly repository?: { readonly id?: number };
    readonly pull_request?: {
      readonly draft?: boolean;
      readonly head?: {
        readonly sha?: string;
        readonly repo?: { readonly owner?: { readonly login?: string } };
      };
    };
    readonly workflow_run?: { readonly head_sha?: string };
    readonly check_suite?: { readonly head_sha?: string };
  };
  readonly ai: {
    getAiIgnoreFiles(): string[];
    getBugbotReviewConfiguration(): BugbotReviewConfiguration;
  };
}

export interface BugbotReviewOperationSource extends BugbotContextSelectionSource {
  readonly locale?: { readonly pullRequest?: string };
  readonly ai: BugbotContextSelectionSource['ai'] & {
    getAgentConfiguration(task: AgentTask): AgentConfiguration;
    getBugbotMinSeverity(): string;
    getBugbotCommentLimit(): number;
  };
}

/** Copies only the non-secret facts required to select canonical Bugbot context. */
export function projectBugbotContextSelectionContext(
  source: BugbotContextSelectionSource,
): BugbotContextSelectionContext {
  const reviewConfiguration = source.ai.getBugbotReviewConfiguration();
  return projectSelectionFacts(source, reviewConfiguration.organizationRules);
}

/** Copies only non-secret review facts out of the mutable route aggregate. */
export function projectBugbotReviewOperationContext(
  source: BugbotReviewOperationSource,
): BugbotReviewOperationContext {
  const reviewConfiguration = source.ai.getBugbotReviewConfiguration();
  const { organizationRules, ...analysisReviewConfiguration } = reviewConfiguration;
  const selection = projectSelectionFacts(source, organizationRules);
  const agentConfiguration = source.ai.getAgentConfiguration(
    source.isPullRequest ? 'reviewer' : 'findings',
  );

  return Object.freeze({
    ...selection,
    locale: Object.freeze({
      pullRequest: source.locale?.pullRequest ?? 'en-US',
    }),
    analysis: Object.freeze({
      agentConfiguration: Object.freeze({ ...agentConfiguration }),
      minimumSeverity: source.ai.getBugbotMinSeverity(),
      commentLimit: source.ai.getBugbotCommentLimit(),
      reviewConfiguration: Object.freeze({ ...analysisReviewConfiguration }),
    }),
  });
}

function projectSelectionFacts(
  source: BugbotContextSelectionSource,
  organizationRules: readonly string[],
): BugbotContextSelectionContext {
  const repositoryId = parsePositiveSafeInteger(source.inputs?.repository?.id);
  const trustedAuthorLogin = source.tokenUser?.trim();
  const commitBranch = source.commit?.branch?.trim() ?? '';
  const headBranch = source.isPullRequest
    ? source.pullRequest?.head?.trim() ?? ''
    : commitBranch;
  const expectedHeadSha = normalizeExpectedHeadSha(source.eventName, source.inputs);
  const headOwner = source.inputs?.pull_request?.head?.repo?.owner?.login?.trim();

  return Object.freeze({
    repository: Object.freeze({
      owner: source.owner,
      name: source.repo,
      ...(repositoryId ? { id: repositoryId } : {}),
    }),
    target: Object.freeze({
      issueNumber: source.issueNumber,
      isPullRequest: source.isPullRequest,
      pullRequestNumber: source.pullRequest?.number ?? -1,
      headBranch,
      commitBranch,
      baseBranch: source.currentConfiguration?.parentBranch
        ?? source.branches?.development
        ?? 'develop',
      pullRequestAction: source.pullRequest?.action ?? '',
      draft: source.inputs?.pull_request?.draft === true,
    }),
    trigger: Object.freeze({
      kind: source.eventName || 'unknown',
      ...(typeof source.inputs?.before === 'string' ? { before: source.inputs.before } : {}),
      ...(typeof source.inputs?.after === 'string' ? { after: source.inputs.after } : {}),
      ...(expectedHeadSha ? { expectedHeadSha } : {}),
      headOwner: headOwner || source.owner,
    }),
    ...(trustedAuthorLogin ? { trustedAuthorLogin } : {}),
    ignorePatterns: Object.freeze([...source.ai.getAiIgnoreFiles()]),
    organizationRules: Object.freeze([...organizationRules]),
  });
}

function normalizeExpectedHeadSha(
  eventName: string,
  inputs: BugbotContextSelectionSource['inputs'],
): string | undefined {
  // Comment-triggered reviews intentionally target the latest remote head.
  const candidate = eventName === 'pull_request'
    ? inputs?.pull_request?.head?.sha
    : eventName === 'workflow_run'
      ? inputs?.workflow_run?.head_sha
      : eventName === 'check_suite'
        ? inputs?.check_suite?.head_sha
        : undefined;
  return typeof candidate === 'string' && /^[0-9a-f]{7,64}$/iu.test(candidate.trim())
    ? candidate.trim().toLowerCase()
    : undefined;
}
