import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { BugbotFindingPublicationPorts } from "../bugbot_finding_publication_ports";
import type { BugbotFindingResolutionPorts } from "../bugbot_finding_resolution_ports";
import type { BugbotPullRequestResolutionPort } from "../bugbot_pull_request_resolution_ports";
import type { BugbotPullRequestWritePort } from "../bugbot_pull_request_write_ports";
import type { PullRequestReviewCommentCommandPort } from "../pull_request_review_comment_ports";

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type PublicationKeysAreExact = Assert<
  Equal<keyof BugbotFindingPublicationPorts, "issueComments" | "pullRequestComments">
>;
type ResolutionKeysAreExact = Assert<
  Equal<keyof BugbotFindingResolutionPorts, "issueComments" | "pullRequestComments">
>;
type PullRequestWriteKeysAreExact = Assert<
  Equal<keyof BugbotPullRequestWritePort, keyof PullRequestReviewCommentCommandPort>
>;
type PullRequestResolutionKeys =
  | "listPullRequestReviewComments"
  | "updatePullRequestReviewComment"
  | "resolvePullRequestReviewThread";
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
    expect(workflowSource).toContain("BugbotFindingResolutionPorts");
  });
});
