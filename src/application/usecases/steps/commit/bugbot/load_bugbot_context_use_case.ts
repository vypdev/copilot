import { ApplicationError } from "../../../../errors/application_error";
import type { BoundBugbotContextReadPorts } from "../../../../ports/bugbot_context_ports";
import type { PullRequestReviewComment } from "../../../../ports/pull_request_review_comment_ports";
import { runWithConcurrencyLimit } from "../../../../policies/bounded_concurrency_policy";
import {
  completeBugbotSourceCoverage,
  selectCanonicalBugbotPullRequest,
  summarizeBugbotCoverage,
  type BugbotCanonicalPullRequestSelection,
  type BugbotPullRequestIdentity,
  type BugbotSourceCoverage,
} from "../../../../../domain/bugbot/context";
import { logDebugInfo } from "../../../../ports/logging_ports";
import {
  collectPreviousBugbotFindings,
  parseBugbotFindingComments,
  type BugbotComment,
} from "./bugbot_finding_context";
import { buildPreviousFindingsContext } from "./bugbot_previous_findings_context";
import { buildReviewConversationContext, buildReviewDiffContext } from "./bugbot_review_context";
import { fileMatchesIgnorePatterns } from "./file_ignore";
import { buildBugbotReviewRuleSet } from "./bugbot_review_rules";
import type { BugbotContextRequest } from "./bugbot_context_request";
import type { BugbotContext, BugbotPrContext } from "./types";

type LoadedSource =
  | { readonly kind: "issue"; readonly value: BugbotComment[]; readonly coverage: BugbotSourceCoverage }
  | { readonly kind: "comments"; readonly value: PullRequestReviewComment[]; readonly coverage: BugbotSourceCoverage }
  | { readonly kind: "threads"; readonly value: Readonly<Record<string, import("../../../../ports/pull_request_review_comment_ports").PullRequestReviewThreadState>>; readonly coverage: BugbotSourceCoverage }
  | { readonly kind: "diff"; readonly value: import("../../../../ports/bugbot_pull_request_read_ports").PullRequestReviewDiffSnapshot; readonly coverage: BugbotSourceCoverage };

export async function loadBugbotContext(
  request: BugbotContextRequest,
  ports: BoundBugbotContextReadPorts,
): Promise<BugbotContext> {
  const selection = await selectCanonicalPullRequest(request, ports);
  const canonicalPullRequest = requireUsableSelection(request, selection);
  const selectionCoverage = completeBugbotSourceCoverage(
    "selection",
    selection.kind === "canonical" ? 1 : selection.kind === "ambiguous" ? 2 : 0,
    request.target.headRef || request.target.eventPullRequestNumber ? 1 : 0,
  );
  const tasks: Array<() => Promise<LoadedSource>> = [];
  if (request.target.issueNumber !== undefined) {
    tasks.push(async () => {
      const result = await ports.listIssueComments(request.target.issueNumber as number);
      return { kind: "issue", value: [...result.value], coverage: result.coverage };
    });
  }
  if (canonicalPullRequest) {
    tasks.push(
      async () => {
        const result = await ports.listPullRequestReviewComments(canonicalPullRequest.number);
        return { kind: "comments", value: [...result.value], coverage: result.coverage };
      },
      async () => {
        const result = await ports.listPullRequestReviewThreadStates(canonicalPullRequest.number);
        return { kind: "threads", value: result.value, coverage: result.coverage };
      },
      async () => {
        const result = await ports.getReviewDiffSnapshot(canonicalPullRequest.number);
        return { kind: "diff", value: result.value, coverage: result.coverage };
      },
    );
  }
  const loaded = await runWithConcurrencyLimit(tasks, 2);
  const issueComments = sourceValue(loaded, "issue", [] as BugbotComment[]);
  const pullRequestComments = sourceValue(loaded, "comments", [] as PullRequestReviewComment[]);
  const reviewThreadStates = sourceValue(loaded, "threads", {});
  const diff = sourceValue(loaded, "diff", undefined);
  const pullRequestCommentsByNumber = canonicalPullRequest
    ? new Map([[canonicalPullRequest.number, pullRequestComments]])
    : new Map<number, PullRequestReviewComment[]>();
  const reviewThreadStatesByPullRequest = canonicalPullRequest
    ? new Map([[canonicalPullRequest.number, reviewThreadStates]])
    : new Map();
  const parsedComments = parseBugbotFindingComments(
    issueComments,
    pullRequestCommentsByNumber,
    request.trustedAuthorLogin,
    reviewThreadStatesByPullRequest,
  );
  const previousFindings = collectPreviousBugbotFindings(
    parsedComments.issueComments,
    parsedComments.existingByFindingId,
    parsedComments.prFindingIdToBody,
  );
  const previousContext = buildPreviousFindingsContext(previousFindings);
  const prContext = canonicalPullRequest && diff ? toPrContext(canonicalPullRequest, diff) : null;
  const diffContext = buildReviewDiffContext(prContext, request.ignorePatterns);
  const conversationContext = buildReviewConversationContext(
    issueComments,
    pullRequestCommentsByNumber,
    request.trustedAuthorLogin,
  );
  const repositoryRules = await ports.loadRules(
    prContext?.prFiles
      .map((file) => file.filename)
      .filter((file) => !fileMatchesIgnorePatterns(file, request.ignorePatterns)) ?? [],
  );
  const ruleSet = buildBugbotReviewRuleSet(request.organizationRules, repositoryRules);
  const coverage = summarizeBugbotCoverage([
    selectionCoverage,
    ...loaded.map((source) => source.kind === "diff"
      ? {
          ...source.coverage,
          status: source.coverage.status === "partial" || diffContext.omitted > 0 || diffContext.truncated > 0
            ? "partial" as const
            : "complete" as const,
          itemsRetained: diffContext.retained,
          omittedItems: source.coverage.omittedItems + diffContext.omitted,
          truncatedItems: source.coverage.truncatedItems + diffContext.truncated,
          limitReached: source.coverage.limitReached || diffContext.omitted > 0 || diffContext.truncated > 0,
        }
      : source.coverage),
    {
      ...completeBugbotSourceCoverage("previous-findings", previousContext.selected.length),
      status: previousContext.omitted > 0 ? "partial" : "complete",
      omittedItems: previousContext.omitted,
      limitReached: previousContext.omitted > 0,
    },
    {
      ...completeBugbotSourceCoverage("human-conversation", conversationContext.retained),
      status: conversationContext.omitted > 0 || conversationContext.truncated > 0 ? "partial" : "complete",
      itemsFetched: conversationContext.retained + conversationContext.omitted,
      omittedItems: conversationContext.omitted,
      truncatedItems: conversationContext.truncated,
      limitReached: conversationContext.omitted > 0 || conversationContext.truncated > 0,
    },
    {
      ...completeBugbotSourceCoverage("rules", ruleSet.rules.length, ruleSet.rules.length > 0 ? 1 : 0),
      status: ruleSet.omitted > 0 ? "partial" : "complete",
      omittedItems: ruleSet.omitted,
      limitReached: ruleSet.omitted > 0,
    },
  ]);
  logDebugInfo(
    `LoadBugbotContext: selection=${selection.kind}, coverage=${coverage.status}, existing findings=${Object.keys(parsedComments.existingByFindingId).length}, retained previous findings=${previousContext.selected.length}, diff files=${prContext?.changes?.length ?? 0}.`,
  );
  return {
    existingByFindingId: parsedComments.existingByFindingId,
    issueComments: parsedComments.issueComments,
    canonicalPullRequest,
    selectionReason: selection.kind === "canonical" ? selection.reason : "none",
    coverage,
    eligibleResolutionIds: new Set(previousContext.selected.map((finding) => finding.id)),
    previousFindingsBlock: previousContext.block,
    reviewDiffBlock: diffContext.block,
    reviewConversationBlock: conversationContext.block,
    prContext,
    unresolvedFindingsWithBody: previousContext.selected.map((finding) => ({
      id: finding.id,
      fullBody: finding.fullBody,
    })),
    reviewRulesBlock: ruleSet.promptBlock,
    reviewRuleSources: [...ruleSet.sources],
    omittedReviewRules: ruleSet.omitted,
  };
}

async function selectCanonicalPullRequest(
  request: BugbotContextRequest,
  ports: BoundBugbotContextReadPorts,
): Promise<BugbotCanonicalPullRequestSelection> {
  const eventNumber = request.target.eventPullRequestNumber;
  if (eventNumber !== undefined) {
    const candidate = await ports.getPullRequest(eventNumber);
    return selectCanonicalBugbotPullRequest(request.target, [candidate], "event");
  }
  if (!request.target.headRef) return { kind: "none" };
  const candidates = await ports.findOpenPullRequestsByExactHead(
    request.target.headOwner,
    request.target.headRef,
  );
  return selectCanonicalBugbotPullRequest(request.target, candidates, "exact-head");
}

function requireUsableSelection(
  request: BugbotContextRequest,
  selection: BugbotCanonicalPullRequestSelection,
): BugbotPullRequestIdentity | null {
  if (selection.kind === "canonical") return selection.pullRequest;
  if (selection.kind === "ambiguous") {
    throw new ApplicationError(
      "provider.conflict",
      `Two open pull requests match ${request.target.headOwner}:${request.target.headRef}; review was not started.`,
    );
  }
  if (selection.kind === "stale") {
    throw new ApplicationError("workflow.stale", `${selection.reason} Review was not started.`);
  }
  if (request.target.pullRequestRequired) {
    throw new ApplicationError("workflow.stale", "No verified pull request matches the review target.");
  }
  return null;
}

function sourceValue(
  sources: readonly LoadedSource[],
  kind: "issue",
  fallback: BugbotComment[],
): BugbotComment[];
function sourceValue(
  sources: readonly LoadedSource[],
  kind: "comments",
  fallback: PullRequestReviewComment[],
): PullRequestReviewComment[];
function sourceValue(
  sources: readonly LoadedSource[],
  kind: "threads",
  fallback: Readonly<Record<string, import("../../../../ports/pull_request_review_comment_ports").PullRequestReviewThreadState>>,
): Readonly<Record<string, import("../../../../ports/pull_request_review_comment_ports").PullRequestReviewThreadState>>;
function sourceValue(
  sources: readonly LoadedSource[],
  kind: "diff",
  fallback: undefined,
): import("../../../../ports/bugbot_pull_request_read_ports").PullRequestReviewDiffSnapshot | undefined;
function sourceValue(
  sources: readonly LoadedSource[],
  kind: LoadedSource["kind"],
  fallback: unknown,
): unknown {
  return sources.find((source) => source.kind === kind)?.value ?? fallback;
}

function toPrContext(
  identity: BugbotPullRequestIdentity,
  snapshot: import("../../../../ports/bugbot_pull_request_read_ports").PullRequestReviewDiffSnapshot,
): BugbotPrContext {
  return {
    prHeadSha: identity.headSha,
    prFiles: snapshot.changes.map(({ filename, status }) => ({ filename, status })),
    pathToFirstDiffLine: Object.fromEntries(
      snapshot.filesWithFirstDiffLine.map(({ path, firstLine }) => [path, firstLine]),
    ),
    pathToDiffLocations: Object.fromEntries(
      snapshot.filesWithDiffLocations.map(({ path, locations }) => [path, locations]),
    ),
    changes: snapshot.changes,
  };
}

export type { BugbotContextRequest, LoadBugbotContextOptions } from "./bugbot_context_request";
