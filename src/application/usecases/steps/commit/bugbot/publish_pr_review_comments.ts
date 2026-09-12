import type { BoundBugbotPullRequestWritePort } from "../../../../ports/bugbot_pull_request_write_ports";
import type { PullRequestReviewCommentDraft } from "../../../../ports/pull_request_review_comment_ports";
import type {
  BugbotFinding,
  ExistingFindingInfo,
} from "../../../../../domain/bugbot/finding";
import type { BugbotPrContext } from "./types";
import { buildCommentBody } from '../../../../policies/bugbot_finding_marker_policy';
import { resolveFindingPathForPr } from "./path_validation";
import { logInfo } from "../../../../ports/logging_ports";
import { sanitizeAgentMarkdown } from '../../../../policies/github_comment_publication_policy';
import { buildNewBugbotReviewSnapshotHeader } from '../../../../policies/bugbot_review_presentation_policy';
import type { BugbotReviewOperationContext } from './bugbot_review_operation_context';

export interface PullRequestReviewCommentPublisherOptions {
  repository: BoundBugbotPullRequestWritePort;
  operation: BugbotReviewOperationContext;
  openPrNumber: number;
  prContext: BugbotPrContext;
  watermark: string;
  ruleSources?: readonly string[];
  omittedRuleCount?: number;
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
    const { prContext, openPrNumber, operation } = this.options;
    const allowSuggestedChanges = operation.analysis.reviewConfiguration.suggestedChanges;
    if (
      existing?.pullRequest != null &&
      existing.pullRequest.pullRequestNumber === openPrNumber
    ) {
      // A human dismissal is durable. Model output alone cannot reverse it;
      // reopening the native thread is the explicit human signal to recheck.
      if (existing.pullRequest.resolution === 'dismissed'
          && existing.pullRequest.threadResolved !== false) {
        return;
      }
      // Existing comments do not carry enough anchor metadata to prove that a
      // GitHub suggestion is still attached to a RIGHT-side changed line.
      const body = `${buildCommentBody(finding, false, undefined, { includeSuggestedChange: false })}\n\n${this.options.watermark}`;
      await this.options.repository.updatePullRequestReviewComment(
        existing.pullRequest.commentIdentity,
        body,
      );
      if (existing.pullRequest.resolved || existing.pullRequest.threadResolved === true) {
        // Persist the open marker before reopening the native thread. This
        // leaves a deterministic recovery direction after partial failures.
        await this.options.repository.unresolvePullRequestReviewThread(
          openPrNumber,
          existing.pullRequest.commentIdentity,
        );
      }
      return;
    }

    const reportedPath = resolveFindingPathForPr(finding.file, prContext.prFiles);
    const anchor = resolveReviewAnchor(finding.line, finding.endLine, reportedPath, prContext);
    const findingBody = buildCommentBody(finding, false, undefined, {
      includeSuggestedChange: allowSuggestedChanges && anchor?.subjectType === 'line' && anchor.side === 'RIGHT',
    });
    const body = `${findingBody}\n\n${this.options.watermark}`;
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
    const { repository, operation, openPrNumber, prContext } = this.options;
    await repository.createReviewWithComments(
      openPrNumber,
      prContext.prHeadSha,
      buildReviewSummary(
        this.findingsToCreate,
        this.commentsToCreate.length,
        this.unanchoredBodies,
        overflowCount,
        overflowTitles,
        this.options.watermark,
        operation.analysis.reviewConfiguration.traceRules
          ? this.options.ruleSources ?? []
          : [],
        operation.analysis.reviewConfiguration.traceRules
          ? this.options.omittedRuleCount ?? 0
          : 0,
        prContext.prHeadSha,
        operation.locale.pullRequest,
      ),
      this.commentsToCreate,
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
    const firstAvailableLocation = Object.entries(context.pathToFirstDiffLine)[0];
    return firstAvailableLocation
      ? { path: firstAvailableLocation[0], subjectType: 'line', line: firstAvailableLocation[1], side: 'RIGHT' }
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
  ruleSources: readonly string[] = [],
  omittedRuleCount = 0,
  analyzedHeadSha = 'unknown',
  locale = 'en-US',
): string {
  const findingLines = findings.map((finding) => {
    const severity = sanitizeSummaryText(finding.severity, 32) || "unspecified";
    const title = sanitizeSummaryText(finding.title, 500) || 'Potential problem';
    const file = sanitizeSummaryText(finding.file, 500).replace(/`/gu, '\\`');
    const location = finding.file
      ? ` — \`${file}${finding.line ? `:${finding.line}` : ""}\``
      : "";
    return `- **${severity}**: ${title}${location}`;
  });
  const overflowLines = overflowTitles.slice(0, 15).map((title) => `- ${sanitizeSummaryText(title, 500) || 'Potential problem'}`);
  if (overflowCount > overflowLines.length) {
    overflowLines.push(`- …and ${overflowCount - overflowLines.length} more.`);
  }
  const sections = [
    buildNewBugbotReviewSnapshotHeader(
      analyzedHeadSha,
      findings.length + overflowCount,
      inlineCount,
      locale,
    ),
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
  if (ruleSources.length > 0 || omittedRuleCount > 0) {
    const rows = ruleSources.map((rawSource) => {
      const truncated = rawSource.endsWith(' (truncated)');
      const source = sanitizeSummaryText(
        truncated ? rawSource.slice(0, -' (truncated)'.length) : rawSource,
        500,
      ).replace(/`/g, '\\`').replace(/\|/g, '\\|');
      return `| \`${source}\` | ${truncated ? 'truncated' : 'included'} |`;
    });
    if (omittedRuleCount > 0) rows.push(`| — | ${omittedRuleCount} omitted by duplicate, empty, or combined-budget policy |`);
    sections.push(`### Review configuration\n\nRules in effective precedence order:\n\n| Source | Status |\n| --- | --- |\n${rows.join('\n')}`);
  }
  sections.push(watermark);
  return sections.join("\n\n");
}

function sanitizeSummaryText(value: unknown, maximum: number): string {
  return sanitizeAgentMarkdown(typeof value === 'string' ? value : '', maximum).replace(/[\r\n]+/gu, ' ').trim();
}
