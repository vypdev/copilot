import type { BugbotPullRequestWritePort } from "../../../../ports/bugbot_pull_request_write_ports";
import type { PullRequestReviewCommentDraft } from "../../../../ports/pull_request_review_comment_ports";
import type { Execution } from "../../../../../data/model/execution";
import type {
  BugbotFinding,
  BugbotPrContext,
  ExistingFindingInfo,
} from "./types";
import { buildCommentBody } from "./marker";
import { resolveFindingPathForPr } from "./path_validation";
import { logInfo } from "../../../../ports/logging_ports";

export interface PullRequestReviewCommentPublisherOptions {
  repository: BugbotPullRequestWritePort;
  execution: Execution;
  openPrNumber: number;
  prContext: BugbotPrContext;
  watermark: string;
}

export class PullRequestReviewCommentPublisher {
  private readonly commentsToCreate: PullRequestReviewCommentDraft[] = [];
  private readonly findingsToCreate: BugbotFinding[] = [];
  private readonly unanchoredBodies: string[] = [];

  public constructor(
    private readonly options: PullRequestReviewCommentPublisherOptions,
  ) {}

  public async publish(
    finding: BugbotFinding,
    existing: ExistingFindingInfo | undefined,
  ): Promise<void> {
    const { prContext, openPrNumber, execution } = this.options;
    const findingBody = buildCommentBody(finding, false);
    const body = `${findingBody}\n\n${this.options.watermark}`;
    if (
      existing?.pullRequest != null &&
      existing.pullRequest.pullRequestNumber === openPrNumber
    ) {
      if (existing.pullRequest.resolved) {
        await this.options.repository.unresolvePullRequestReviewThread(
          execution.owner,
          execution.repo,
          openPrNumber,
          existing.pullRequest.commentIdentity,
          execution.tokens.token,
        );
      }
      await this.options.repository.updatePullRequestReviewComment(
        execution.owner,
        execution.repo,
        existing.pullRequest.commentIdentity,
        body,
        execution.tokens.token,
      );
      return;
    }

    const reportedPath = resolveFindingPathForPr(finding.file, prContext.prFiles);
    const anchor = resolveReviewAnchor(finding.line, finding.endLine, reportedPath, prContext);
    this.findingsToCreate.push(finding);
    if (!anchor) {
      this.unanchoredBodies.push(findingBody);
      logInfo(
        `Bugbot finding "${finding.id}" could not be attached to a changed line; including it in the review summary.`,
      );
      return;
    }

    const anchorNote = reportedPath === anchor.path
      ? ""
      : `> Review-level finding: the reported location is not part of this pull-request diff, so this comment is attached to the first changed file.\n\n`;
    this.commentsToCreate.push({
      path: anchor.path,
      ...(anchor.subjectType === 'line' ? {
        line: anchor.endLine ?? anchor.line,
        side: anchor.side,
        ...(anchor.endLine && anchor.endLine > anchor.line
          ? { startLine: anchor.line, startSide: anchor.side }
          : {}),
      } : {}),
      ...(anchor.subjectType === 'file' ? { subjectType: 'file' as const } : {}),
      body: `${anchorNote}${body}`,
    });
  }

  public async flush(
    overflowCount = 0,
    overflowTitles: readonly string[] = [],
  ): Promise<void> {
    if (this.findingsToCreate.length === 0 && overflowCount === 0) return;
    const { repository, execution, openPrNumber, prContext } = this.options;
    await repository.createReviewWithComments(
      execution.owner,
      execution.repo,
      openPrNumber,
      prContext.prHeadSha,
      buildReviewSummary(
        this.findingsToCreate,
        this.commentsToCreate.length,
        this.unanchoredBodies,
        overflowCount,
        overflowTitles,
        this.options.watermark,
      ),
      this.commentsToCreate,
      execution.tokens.token,
    );
  }
}

function resolveReviewAnchor(
  reportedLine: number | undefined,
  reportedEndLine: number | undefined,
  reportedPath: string | undefined,
  context: BugbotPrContext,
): { path: string; subjectType: 'line'; line: number; endLine?: number; side: 'LEFT' | 'RIGHT' } | { path: string; subjectType: 'file' } | undefined {
  if (context.pathToDiffLocations === undefined) {
    if (reportedPath && context.pathToFirstDiffLine[reportedPath] != null) {
      return { path: reportedPath, subjectType: 'line', line: context.pathToFirstDiffLine[reportedPath], side: 'RIGHT' };
    }
    const legacyFallback = Object.entries(context.pathToFirstDiffLine)[0];
    return legacyFallback
      ? { path: legacyFallback[0], subjectType: 'line', line: legacyFallback[1], side: 'RIGHT' }
      : undefined;
  }
  if (reportedPath) {
    const locations = context.pathToDiffLocations?.[reportedPath] ?? [];
    const exact = reportedLine == null ? undefined : locations.find((location) => location.line === reportedLine);
    if (exact) {
      const end = reportedEndLine == null
        ? undefined
        : locations.find((location) => location.line === reportedEndLine && location.side === exact.side);
      return {
        path: reportedPath,
        subjectType: 'line',
        ...exact,
        ...(end && end.line > exact.line ? { endLine: end.line } : {}),
      };
    }
    if (context.prFiles.some((file) => file.filename === reportedPath)) {
      return { path: reportedPath, subjectType: 'file' };
    }
  }
  const fallback = context.prFiles.find((file) => file.status !== 'removed') ?? context.prFiles[0];
  return fallback ? { path: fallback.filename, subjectType: 'file' } : undefined;
}

function buildReviewSummary(
  findings: readonly BugbotFinding[],
  inlineCount: number,
  unanchoredBodies: readonly string[],
  overflowCount: number,
  overflowTitles: readonly string[],
  watermark: string,
): string {
  const findingLines = findings.map((finding) => {
    const severity = finding.severity?.trim() || "unspecified";
    const location = finding.file
      ? ` — \`${finding.file}${finding.line ? `:${finding.line}` : ""}\``
      : "";
    return `- **${severity}**: ${finding.title}${location}`;
  });
  const overflowLines = overflowTitles.slice(0, 15).map((title) => `- ${title}`);
  if (overflowCount > overflowLines.length) {
    overflowLines.push(`- …and ${overflowCount - overflowLines.length} more.`);
  }
  const sections = [
    "## 🤖 Bugbot review",
    `Bugbot found **${findings.length + overflowCount}** active potential problem(s) in this revision. `
      + `${inlineCount} finding(s) are attached to changed code in this review.`,
  ];
  if (findingLines.length > 0) sections.push(`### Findings\n\n${findingLines.join("\n")}`);
  if (unanchoredBodies.length > 0) {
    sections.push(`### Review-level findings\n\n${unanchoredBodies.join("\n\n---\n\n")}`);
  }
  if (overflowCount > 0) {
    sections.push(
      `### Additional findings omitted by the comment limit\n\n`
        + `**${overflowCount}** additional finding(s) were detected.\n\n${overflowLines.join("\n")}`,
    );
  }
  sections.push(watermark);
  return sections.join("\n\n");
}
