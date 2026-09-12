import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BugbotFindingPublicationPorts } from "../bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../bugbot_finding_resolution_ports";
import type { BugbotPullRequestResolutionPort } from "../bugbot_pull_request_resolution_ports";
import type { BugbotPullRequestWritePort } from "../bugbot_pull_request_write_ports";
import type { BugbotContextPorts } from '../bugbot_context_ports';

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type PublicationKeysAreExact = Assert<
  Equal<keyof BugbotFindingPublicationPorts, "issueComments" | "pullRequestComments" | "reviewState">
>;
type ContextKeysAreExact = Assert<
  Equal<keyof BugbotContextPorts, 'loader' | 'issue' | 'pullRequest' | 'reviewState' | 'navigation' | 'rules'>
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
    expect(resolutionPortSource).toContain("BugbotIssueCommentUpdatePort");
    expect(resolutionPortSource).toContain("BugbotPullRequestResolutionPort");
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
    expect(writePortSource).not.toContain("resolvePullRequestReviewThread(");
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
    expect(publicationPortSource).toContain('reviewState:');
    expect(publicationPortSource).not.toContain('reviewState?');
  });

  it('requires provider-owned navigation instead of constructing provider URLs in use cases', () => {
    const contextPortSource = readFileSync(
      join(portsDirectory, 'bugbot_context_ports.ts'),
      'utf8',
    );
    const snapshotLoaderSource = readFileSync(
      join(
        portsDirectory,
        '../usecases/steps/commit/bugbot/load_bugbot_reconciliation_snapshot_use_case.ts',
      ),
      'utf8',
    );
    expect(contextPortSource).toContain('navigation: BugbotReviewNavigationPort');
    expect(contextPortSource).not.toContain('navigation?:');
    expect(snapshotLoaderSource).toContain('ports.navigation.forPullRequest');
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
    const pullRequestReadPortSource = readFileSync(
      join(portsDirectory, 'bugbot_pull_request_read_ports.ts'),
      'utf8',
    );

    expect(loaderSource).not.toMatch(/\bExecution\b/u);
    expect(loaderSource).not.toMatch(/\btoken\b/u);
    expect(loaderSource).not.toContain('openPrNumbers');
    expect(loaderSource).not.toContain('getOpenPullRequestNumbersByHeadBranch');
    expect(loaderSource).not.toContain('Promise.all');
    expect(requestSource).toContain("import type { Execution }");
    expect(pullRequestReadPortSource).not.toContain('getOpenPullRequestNumbersByHeadBranch');
  });
});
