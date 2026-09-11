/**
 * Bugbot types: data structures used across detection, publishing, and autofix.
 * GitHub supplies the canonical PR diff and the configured agent can inspect
 * the read-only workspace for context before returning findings.
 */
import type { ExistingByFindingId } from '../../../../../domain/bugbot/finding';

/** PR metadata used only when publishing findings to GitHub. */
export interface BugbotPrContext {
  prHeadSha: string;
  prFiles: Array<{ filename: string; status: string }>;
  pathToFirstDiffLine: Record<string, number>;
  pathToDiffLocations?: Record<string, Array<{ line: number; side: 'LEFT' | 'RIGHT' }>>;
  changes?: Array<{
    filename: string;
    status: string;
    additions: number;
    deletions: number;
    patch: string;
  }>;
}

/** Unresolved finding with a prompt-bounded comment body. */
export interface UnresolvedFindingWithBody {
  id: string;
  fullBody: string;
}

/** Finding projection used by prompts that ask the agent to select findings. */
export interface UnresolvedFindingSummary {
  id: string;
  title: string;
  description?: string;
  file?: string;
  line?: number;
}

/** Full context for detection, mutation, publishing, and autofix intent. */
export interface BugbotContext {
  existingByFindingId: ExistingByFindingId;
  /** Full issue-comment bodies reserved for read-modify-write operations. */
  issueComments: Array<{ id: number; body: string | null }>;
  openPrNumbers: number[];
  /** Bounded text sent to the configured findings agent. */
  previousFindingsBlock: string;
  /** Canonical, bounded PR diff supplied by the GitHub API. */
  reviewDiffBlock?: string;
  /** Bounded human review discussion that may affect finding validity. */
  reviewConversationBlock?: string;
  prContext: BugbotPrContext | null;
  /** Bounded bodies used by intent prompts and autofix. */
  unresolvedFindingsWithBody: UnresolvedFindingWithBody[];
  /** Ordered, bounded rule content supplied to the reviewer. */
  reviewRulesBlock?: string;
  /** Auditable rule identities in effective precedence order. */
  reviewRuleSources?: string[];
  omittedReviewRules?: number;
}
