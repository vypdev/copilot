import { runLocalAction } from "../../actions/local_action";
import { createIssueMetadataCompositionRoot } from "../../infrastructure/composition/issue_metadata_composition_root";
import { ACTIONS, INPUT_KEYS } from "../../utils/constants";
import { logError } from "../../utils/logger";
import { getGitInfo } from "../../cli_context";
import { cleanCliArgument, joinCliArguments } from "../command_input_policy";

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
    process.exit(1);
    return;
  }

  const question = joinCliArguments(options.question);
  if (!question) {
    console.log("❌ Please provide a question or prompt using -q or --question");
    process.exitCode = 1;
    return;
  }

  const branch = cleanCliArgument(options.branch) || "master";
  const issueNumber = cleanCliArgument(options.issue) || "1";
  const token = resolveOption(options.token, "PERSONAL_ACCESS_TOKEN");
  const params: Record<string, unknown> = {
    [INPUT_KEYS.DEBUG]: String(options.debug ?? false),
    [INPUT_KEYS.SINGLE_ACTION]: ACTIONS.THINK,
    [INPUT_KEYS.SINGLE_ACTION_ISSUE]: parseInt(issueNumber, 10) || 1,
    [INPUT_KEYS.TOKEN]: token,
    [INPUT_KEYS.AI_IGNORE_FILES]: resolveOption(options.aiIgnoreFiles, "AI_IGNORE_FILES"),
    [INPUT_KEYS.AI_INCLUDE_REASONING]: resolveOption(options.includeReasoning, "AI_INCLUDE_REASONING"),
    repo: { owner: gitInfo.owner, repo: gitInfo.repo },
    commits: { ref: `refs/heads/${branch}` },
  };

  await addIssueContext(params, gitInfo.owner, gitInfo.repo, issueNumber, token, question);
  params[INPUT_KEYS.WELCOME_TITLE] = "🤔 AI Reasoning Analysis";
  params[INPUT_KEYS.WELCOME_MESSAGES] = [
    `Starting deep code analysis for ${gitInfo.owner}/${gitInfo.repo}/${branch}...`,
    `Question: ${question.substring(0, 100)}${question.length > 100 ? "..." : ""}`,
  ];
  await runLocalAction(params);
}

function resolveOption(value: unknown, environmentName: string): string | undefined {
  return cleanCliArgument(value) || process.env[environmentName];
}

async function addIssueContext(
  params: Record<string, unknown>,
  owner: string,
  repo: string,
  issueNumber: string,
  token: string | undefined,
  question: string,
): Promise<void> {
  const parsedIssueNumber = parseInt(issueNumber, 10);
  if (!(parsedIssueNumber > 0)) {
    params.eventName = "issue";
    params.issue = { number: 1 };
    params.comment = { body: question };
    return;
  }

  const issueMetadataRepository = createIssueMetadataCompositionRoot();
  const isIssue = await issueMetadataRepository.isIssue(owner, repo, parsedIssueNumber, token ?? "");
  if (!isIssue) return;

  params.eventName = "issue";
  params.issue = { number: parsedIssueNumber };
  params.comment = { body: question };
}
