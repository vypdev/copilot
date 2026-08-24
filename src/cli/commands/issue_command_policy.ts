import { ACTIONS, INPUT_KEYS, OPENCODE_DEFAULT_MODEL } from '../../utils/constants';
import type { GitInfo } from '../../cli_context';
import { cleanCliArgument, parsePositiveCliInteger } from '../command_input_policy';

export interface IssueCommandOptions {
  issue?: string;
  branch?: string;
  debug?: boolean;
  token?: string;

  opencodeModel?: string;
}

function sharedOptions(options: IssueCommandOptions): Record<string, unknown> {
  return {
    [INPUT_KEYS.DEBUG]: options.debug?.toString() ?? 'false',
    [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN,

    [INPUT_KEYS.OPENCODE_MODEL]: options.opencodeModel || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
  };
}

export function parseIssueNumber(value: unknown): number | undefined {
  return parsePositiveCliInteger(cleanCliArgument(value));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI action params are dynamically shaped
export function buildCheckProgressParams(options: IssueCommandOptions, gitInfo: GitInfo): any | undefined {
  if ('error' in gitInfo) return undefined;
  const issueNumber = parseIssueNumber(options.issue);
  if (issueNumber === undefined) return undefined;
  const branch = cleanCliArgument(options.branch);
  return {
    ...sharedOptions(options),
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.CHECK_PROGRESS,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: issueNumber,
    [INPUT_KEYS.AI_IGNORE_FILES]: process.env.AI_IGNORE_FILES || 'build/*,dist/*,node_modules/*,*.d.ts',
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    issue: { number: issueNumber },
    ...(branch ? { commits: { ref: `refs/heads/${branch}` } } : {}),
    [INPUT_KEYS.WELCOME_TITLE]: '📊 Progress Check',
    [INPUT_KEYS.WELCOME_MESSAGES]: [`Checking progress for issue #${issueNumber} in ${gitInfo.owner}/${gitInfo.repo}...`],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI action params are dynamically shaped
export function buildRecommendStepsParams(options: IssueCommandOptions, gitInfo: GitInfo): any | undefined {
  if ('error' in gitInfo) return undefined;
  const issueNumber = parseIssueNumber(options.issue);
  if (issueNumber === undefined) return undefined;
  return {
    ...sharedOptions(options),
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.RECOMMEND_STEPS,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: issueNumber,
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    issue: { number: issueNumber },
    [INPUT_KEYS.WELCOME_TITLE]: '📋 Recommend steps',
    [INPUT_KEYS.WELCOME_MESSAGES]: [`Recommending steps for issue #${issueNumber} in ${gitInfo.owner}/${gitInfo.repo}...`],
  };
}
