import { ACTIONS, INPUT_KEYS, OPENCODE_DEFAULT_MODEL } from '../../utils/constants';
import type { GitInfo } from '../../cli_context';
import { cleanCliArgument, parsePositiveCliInteger } from '../command_input_policy';

export interface DetectProblemsOptions {
  issue?: string;
  branch?: string;
  debug?: boolean;
  token?: string;

  opencodeModel?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- CLI action params are dynamically shaped
export function buildDetectPotentialProblemsParams(options: DetectProblemsOptions, gitInfo: GitInfo, currentBranch: string): any | undefined {
  if ('error' in gitInfo) return undefined;
  const issueNumber = parsePositiveCliInteger(cleanCliArgument(options.issue));
  if (issueNumber === undefined) return undefined;
  const branch = (cleanCliArgument(options.branch) || currentBranch).trim() || 'main';
  return {
    [INPUT_KEYS.DEBUG]: options.debug?.toString() ?? 'false',
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.DETECT_POTENTIAL_PROBLEMS,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: issueNumber,
    [INPUT_KEYS.TOKEN]: options.token || process.env.PERSONAL_ACCESS_TOKEN,

    [INPUT_KEYS.OPENCODE_MODEL]: options.opencodeModel || process.env.OPENCODE_MODEL || OPENCODE_DEFAULT_MODEL,
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    issue: { number: issueNumber },
    commits: { ref: `refs/heads/${branch}` },
    [INPUT_KEYS.WELCOME_TITLE]: '🐛 Detect potential problems (bugbot)',
    [INPUT_KEYS.WELCOME_MESSAGES]: [`Detecting potential problems for issue #${issueNumber} on branch ${branch} in ${gitInfo.owner}/${gitInfo.repo}...`],
  };
}

export function resolveDetectIssueNumber(value: unknown): number | undefined {
  return parsePositiveCliInteger(cleanCliArgument(value));
}
