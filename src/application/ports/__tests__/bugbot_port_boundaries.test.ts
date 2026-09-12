import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { BugbotFindingPublicationPorts } from "../bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../bugbot_finding_resolution_ports";
import type { BugbotPullRequestResolutionPort } from "../bugbot_pull_request_resolution_ports";
import type { BugbotPullRequestWritePort } from "../bugbot_pull_request_write_ports";
import type { BugbotContextPorts } from '../bugbot_context_ports';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type PublicationKeysAreExact = Assert<
  Equal<keyof BugbotFindingPublicationPorts, "issueComments" | "pullRequestComments">
>;
type ContextKeysAreExact = Assert<
  Equal<keyof BugbotContextPorts,
    | 'getPullRequest'
    | 'findOpenPullRequestsByExactHead'
    | 'listIssueComments'
    | 'listPullRequestReviewComments'
    | 'listPullRequestReviewThreadStates'
    | 'getReviewDiffSnapshot'
    | 'getPullRequestHeadSha'
    | 'getPullRequestReviewCommentBody'
    | 'loadRules'>
>;
type ResolutionKeysAreExact = Assert<
  Equal<keyof BugbotFindingResolutionPorts, "issueComments" | "pullRequestComments">
>;
type PullRequestWriteKeys =
  | "createReviewWithComments"
  | "updatePullRequestReviewComment"
  | "unresolvePullRequestReviewThread";
type PullRequestWriteKeysAreExact = Assert<
  Equal<keyof BugbotPullRequestWritePort, PullRequestWriteKeys>
>;
type PullRequestResolutionKeys =
  | "listPullRequestReviewComments"
  | "updatePullRequestReviewComment"
  | "resolvePullRequestReviewThread"
  | "unresolvePullRequestReviewThread";
type PullRequestResolutionKeysAreExact = Assert<
  Equal<keyof BugbotPullRequestResolutionPort, PullRequestResolutionKeys>
>;

describe("Bugbot port boundaries", () => {
  const portsDirectory = join(__dirname, "..");

  it("does not retain the universal Bugbot ports module", () => {
    expect(existsSync(join(portsDirectory, "bugbot_ports.ts"))).toBe(false);
  });

  it("keeps Bugbot context and write capabilities separate", () => {
    for (const file of [
      "bugbot_issue_read_ports.ts",
      "bugbot_pull_request_read_ports.ts",
      "bugbot_issue_write_ports.ts",
      "bugbot_pull_request_write_ports.ts",
      "bugbot_pull_request_resolution_ports.ts",
      "bugbot_finding_resolution_ports.ts",
      "bugbot_context_ports.ts",
      "bugbot_review_navigation_ports.ts",
      "bugbot_write_ports.ts",
    ]) {
      expect(existsSync(join(portsDirectory, file))).toBe(true);
    }
  });

  it("keeps review-comment queries out of the pull request write port and narrows resolution", () => {
    const writePortSource = readFileSync(
      join(portsDirectory, "bugbot_pull_request_write_ports.ts"),
      "utf8",
    );
    const resolutionPortSource = readFileSync(
      join(portsDirectory, "bugbot_pull_request_resolution_ports.ts"),
      "utf8",
    );
    const markResolvedSource = readFileSync(
      join(
        portsDirectory,
        "../usecases/steps/commit/bugbot/mark_findings_resolved_use_case.ts",
      ),
      "utf8",
    );

    expect(writePortSource).not.toContain("listPullRequestReviewComments");
    expect(resolutionPortSource).not.toContain("BugbotPullRequestWritePort");
    expect(resolutionPortSource).toContain(
      "PullRequestReviewCommentUpdatePort",
    );
    expect(resolutionPortSource).toContain(
      "PullRequestReviewThreadCommandPort",
    );
    expect(resolutionPortSource).toContain(
      "PullRequestReviewCommentListQueryPort",
    );
    expect(markResolvedSource).not.toContain("BugbotWritePorts");
    expect(markResolvedSource).toContain("BugbotFindingResolutionPorts");
  });

  it("keeps finding resolution free of comment creation capabilities", () => {
    const issuePortSource = readFileSync(
      join(portsDirectory, "bugbot_issue_write_ports.ts"),
      "utf8",
    );
    const resolutionPortSource = readFileSync(
      join(portsDirectory, "bugbot_finding_resolution_ports.ts"),
      "utf8",
    );
    const markResolvedSource = readFileSync(
      join(
        portsDirectory,
        "../usecases/steps/commit/bugbot/mark_findings_resolved_use_case.ts",
      ),
      "utf8",
    );
    const workflowSource = readFileSync(
      join(
        portsDirectory,
        "../usecases/steps/commit/bugbot/commit_autofix_and_resolve_workflow.ts",
      ),
      "utf8",
    );

    expect(issuePortSource).toContain("BugbotIssueCommentCreatePort");
    expect(issuePortSource).toContain("BugbotIssueCommentUpdatePort");
    expect(resolutionPortSource).toContain("BoundBugbotIssueCommentUpdatePort");
    expect(resolutionPortSource).toContain("BoundBugbotPullRequestResolutionPort");
    expect(markResolvedSource).not.toContain("BugbotIssueCommentWritePort");
    expect(markResolvedSource).toContain("BugbotFindingResolutionPorts");
    expect(workflowSource).not.toContain("BugbotWritePorts");
    expect(workflowSource).not.toContain("BugbotFindingResolutionPorts");
  });

  it("allows publication to reopen an existing resolved thread without granting resolution writes", () => {
    const writePortSource = readFileSync(
      join(portsDirectory, "bugbot_pull_request_write_ports.ts"),
      "utf8",
    );
    expect(writePortSource).toContain("unresolvePullRequestReviewThread");
    expect(writePortSource).not.toMatch(/^\s*resolvePullRequestReviewThread\(/mu);
  });

  it('segregates review-summary presentation from inline finding publication', () => {
    const writePortSource = readFileSync(
      join(portsDirectory, 'bugbot_pull_request_write_ports.ts'),
      'utf8',
    );
    const publicationPortSource = readFileSync(
      join(portsDirectory, 'bugbot_finding_publication_ports.ts'),
      'utf8',
    );
    expect(writePortSource).not.toContain('PullRequestReviewSummaryUpdatePort');
    expect(publicationPortSource).not.toContain('reviewState');
  });

  it('requires provider-owned navigation instead of constructing provider URLs in use cases', () => {
    const reconciliationPortSource = readFileSync(
      join(portsDirectory, 'bugbot_reconciliation_ports.ts'),
      'utf8',
    );
    const snapshotLoaderSource = readFileSync(
      join(
        portsDirectory,
        '../usecases/steps/commit/bugbot/load_bugbot_reconciliation_snapshot_use_case.ts',
      ),
      'utf8',
    );
    expect(reconciliationPortSource).toContain('navigationForPullRequest(');
    expect(snapshotLoaderSource).toContain('ports.navigationForPullRequest');
    expect(snapshotLoaderSource).not.toContain('https://github.com');
  });

  it('keeps credentials and provider fan-out outside the bounded context loader', () => {
    const loaderSource = readFileSync(
      join(
        portsDirectory,
        '../usecases/steps/commit/bugbot/load_bugbot_context_use_case.ts',
      ),
      'utf8',
    );
    const requestSource = readFileSync(
      join(
        portsDirectory,
        '../usecases/steps/commit/bugbot/bugbot_context_request.ts',
      ),
      'utf8',
    );
    const operationContextSource = readFileSync(
      join(
        portsDirectory,
        '../usecases/steps/commit/bugbot/bugbot_review_operation_context.ts',
      ),
      'utf8',
    );
    const selectionOnlySources = [
      'bugbot_autofix_preflight.ts',
      'detect_bugbot_fix_intent_workflow.ts',
      'dismiss_bugbot_findings_use_case.ts',
    ].map((file) => readFileSync(
      join(portsDirectory, `../usecases/steps/commit/bugbot/${file}`),
      'utf8',
    ));
    const pullRequestReadPortSource = readFileSync(
      join(portsDirectory, 'bugbot_pull_request_read_ports.ts'),
      'utf8',
    );

    expect(loaderSource).not.toMatch(/\bExecution\b/u);
    expect(loaderSource).not.toMatch(/\btoken\b/u);
    expect(loaderSource).not.toContain('openPrNumbers');
    expect(loaderSource).not.toContain('getOpenPullRequestNumbersByHeadBranch');
    expect(loaderSource).not.toContain('Promise.all');
    expect(requestSource).not.toMatch(/\bExecution\b/u);
    expect(requestSource).toContain('BugbotContextSelectionContext');
    expect(operationContextSource).not.toContain('data/model/execution');
    expect(operationContextSource).not.toMatch(/readonly\s+tokens?\s*:/u);
    for (const source of selectionOnlySources) expect(source).not.toMatch(/\bExecution\b/u);
    expect(pullRequestReadPortSource).not.toContain('getOpenPullRequestNumbersByHeadBranch');
  });

  it('keeps every production Bugbot leaf free of the runtime aggregate and bound port credentials', () => {
    const bugbotDirectory = join(portsDirectory, '../usecases/steps/commit/bugbot');
    const leafFiles = readdirSync(bugbotDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => join(bugbotDirectory, entry.name));
    leafFiles.push(
      join(portsDirectory, '../usecases/steps/commit/detect_potential_problems_use_case.ts'),
      join(portsDirectory, '../usecases/steps/commit/detect_potential_problems_workflow.ts'),
    );

    for (const file of leafFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toContain('data/model/execution');
      expect(source).not.toMatch(/\bExecution\b/u);
    }

    for (const file of [
      'bugbot_context_ports.ts',
      'bugbot_finding_publication_ports.ts',
      'bugbot_finding_resolution_ports.ts',
      'bugbot_git_ports.ts',
      'bugbot_reconciliation_ports.ts',
      'bugbot_scm_ports.ts',
    ]) {
      expect(readFileSync(join(portsDirectory, file), 'utf8')).not.toMatch(/\btoken\s*[?:]/u);
    }
  });
});
