import { runLocalAction } from "../../actions/local_action";
import { ACTIONS } from '../../data/model/action_types';
import { INPUT_KEYS } from '../../application/contracts/input_keys';
import { logError } from "../../utils/logger";
import { getGitInfo } from "../../cli_context";
import { cleanCliArgument, joinCliArguments, parsePositiveCliInteger } from "../command_input_policy";

export interface ThinkCommandOptions {
  issue?: unknown;
  branch?: unknown;
  debug?: boolean;
  token?: unknown;
  question?: unknown;
  aiIgnoreFiles?: unknown;
  includeReasoning?: unknown;
}

/** Adapts Commander input into the local action contract used by the Think workflow. */
export async function runThinkCommand(options: ThinkCommandOptions): Promise<void> {
  const gitInfo = getGitInfo();
  if ("error" in gitInfo) {
    logError(gitInfo.error);
    process.exitCode = 1;
    return;
  }

  const question = joinCliArguments(options.question);
  if (!question) {
    console.log("❌ Please provide a question or prompt using -q or --question");
    process.exitCode = 1;
    return;
  }

  const branch = cleanCliArgument(options.branch) || "master";
  const rawIssueNumber = cleanCliArgument(options.issue);
  const issueNumber = parsePositiveCliInteger(options.issue);
  if (rawIssueNumber && issueNumber === undefined) {
    console.log("❌ --issue must be a positive integer");
    process.exitCode = 1;
    return;
  }
  const token = resolveOption(options.token, "PERSONAL_ACCESS_TOKEN");
  const params: Record<string, unknown> = {
    [INPUT_KEYS.DEBUG]: String(options.debug ?? false),
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.THINK,
    ...(issueNumber ? { [INPUT_KEYS.SINGLE_ACTION_ISSUE]: issueNumber } : {}),
    [INPUT_KEYS.TOKEN]: token,
    [INPUT_KEYS.AI_IGNORE_FILES]: resolveOption(options.aiIgnoreFiles, "AI_IGNORE_FILES"),
    [INPUT_KEYS.AI_INCLUDE_REASONING]: resolveOption(options.includeReasoning, "AI_INCLUDE_REASONING"),
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    commits: { ref: `refs/heads/${branch}` },
  };

  addIssueContext(params, issueNumber, question);
  await runLocalAction(params);
}

function resolveOption(value: unknown, environmentName: string): string | undefined {
  return cleanCliArgument(value) || process.env[environmentName];
}

function addIssueContext(
  params: Record<string, unknown>,
  issueNumber: number | undefined,
  question: string,
): void {
  params.eventName = "issue_comment";
  params.issue = { number: issueNumber ?? -1 };
  params.comment = { body: question };
}
