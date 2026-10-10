import { MAX_INACTIVITY_THRESHOLD_HOURS } from '../../domain/issue_inactivity';
import { PULL_REQUEST_DESCRIPTION_MODES } from '../../domain/pull_request_description';

/** Small independent runtime settings. Structural changes use the complete wizard. */
export const SETUP_QUICK_SETTINGS = [
  { id: 'assignees', questionId: 'repository.desiredAssigneesCount', variable: 'DESIRED_ASSIGNEES_COUNT', input: 'desired-assignees-count', min: 0, max: 10 },
  { id: 'reviewers', questionId: 'repository.desiredReviewersCount', variable: 'DESIRED_REVIEWERS_COUNT', input: 'desired-reviewers-count', min: 0, max: 15 },
  { id: 'inactivity', questionId: 'repository.inactivityThresholdHours', variable: 'INACTIVITY_THRESHOLD_HOURS', input: 'inactivity-threshold-hours', min: 1, max: MAX_INACTIVITY_THRESHOLD_HOURS },
  { id: 'reopen', questionId: 'repository.reopenIssueOnPush', variable: 'REOPEN_ISSUE_ON_PUSH', input: 'reopen-issue-on-push', choices: ['true', 'false'] },
  { id: 'description', questionId: 'ai.pullRequestDescriptionMode', variable: 'AI_PULL_REQUEST_DESCRIPTION_MODE', input: 'ai-pull-request-description-mode', choices: PULL_REQUEST_DESCRIPTION_MODES },
  { id: 'members', questionId: 'ai.membersOnly', variable: 'AI_MEMBERS_ONLY', input: 'ai-members-only', choices: ['true', 'false'] },
  { id: 'reasoning', questionId: 'ai.includeReasoning', variable: 'AI_INCLUDE_REASONING', input: 'ai-include-reasoning', choices: ['true', 'false'] },
  { id: 'severity', questionId: 'ai.bugbotSeverity', variable: 'BUGBOT_SEVERITY', input: 'bugbot-severity', choices: ['info', 'low', 'medium', 'high'] },
  { id: 'commentLimit', questionId: 'ai.bugbotCommentLimit', variable: 'BUGBOT_COMMENT_LIMIT', input: 'bugbot-comment-limit', min: 1, max: 100 },
  { id: 'dryRun', questionId: 'ai.bugbotDryRun', variable: 'BUGBOT_DRY_RUN', input: 'bugbot-dry-run', choices: ['true', 'false'] },
  { id: 'effort', questionId: 'ai.bugbotEffort', variable: 'BUGBOT_EFFORT', input: 'bugbot-effort', choices: ['smart', 'low', 'default', 'high'] },
  { id: 'drafts', questionId: 'ai.bugbotReviewDrafts', variable: 'BUGBOT_REVIEW_DRAFTS', input: 'bugbot-review-drafts', choices: ['true', 'false'] },
  { id: 'suggestions', questionId: 'ai.bugbotSuggestedChanges', variable: 'BUGBOT_SUGGESTED_CHANGES', input: 'bugbot-suggested-changes', choices: ['true', 'false'] },
  { id: 'telemetry', questionId: 'ai.bugbotTelemetry', variable: 'BUGBOT_TELEMETRY', input: 'bugbot-telemetry', choices: ['true', 'false'] },
] as const;

export function quickSetting(id: string) {
  return SETUP_QUICK_SETTINGS.find(setting => setting.id === id);
}

export function validateQuickSetting(id: string, raw: string): string | undefined {
  const setting = quickSetting(id);
  if (!setting) return undefined;
  const value = raw.trim();
  if ('choices' in setting) return (setting.choices as readonly string[]).includes(value) ? value : undefined;
  if (!/^\d{1,5}$/u.test(value)) return undefined;
  const number = Number(value);
  return number >= setting.min && number <= setting.max ? String(number) : undefined;
}
