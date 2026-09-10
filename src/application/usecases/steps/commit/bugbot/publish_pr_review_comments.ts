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
import { sanitizeAgentMarkdown } from '../../../../policies/github_comment_publication_policy';

export interface PullRequestReviewCommentPublisherOptions {
  repository: BugbotPullRequestWritePort;
  execution: Execution;
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
    const { prContext, openPrNumber, execution } = this.options;
  const allowSuggestedChanges = execution.ai.getBugbotReviewConfiguration().suggestedChanges;
    if (
      existing?.pullRequest != null &&
      existing.pullRequest.pullRequestNumber === openPrNumber
    ) {
      // Existing comments do not carry enough anchor metadata to prove that a
      // GitHub suggestion is still attached to a RIGHT-side changed line.
      const body = `${buildCommentBody(finding, false, undefined, { includeSuggestedChange: false })}\n\n${this.options.watermark}`;
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
        execution.ai.getBugbotReviewConfiguration().traceRules
          ? this.options.ruleSources ?? []
          : [],
        execution.ai.getBugbotReviewConfiguration().traceRules
          ? this.options.omittedRuleCount ?? 0
          : 0,
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
  sections.push('To request an automatic repair for all active findings, reply with `/copilot fix all`.');
  sections.push(watermark);
  return sections.join("\n\n");
}

function sanitizeSummaryText(value: unknown, maximum: number): string {
  return sanitizeAgentMarkdown(typeof value === 'string' ? value : '', maximum).replace(/[\r\n]+/gu, ' ').trim();
}
