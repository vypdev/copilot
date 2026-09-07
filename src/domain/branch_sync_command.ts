export interface BranchSyncCommandOptions {
  readonly dryRun: boolean;
  readonly useAgent: boolean;
  readonly parentOverride?: string;
}

export type BranchSyncCommandParseResult =
  | { readonly valid: true; readonly options: BranchSyncCommandOptions }
  | { readonly valid: false; readonly reason: string };

const NATURAL_LANGUAGE_PATTERNS = [
  /\bupdate\s+(?:the\s+)?issue(?:'s|’s)?\s+branch\b/iu,
  /\bsync(?:hronize)?\s+(?:the\s+)?(?:issue(?:'s|’s)?\s+)?branch\b/iu,
  /\b(?:actualiza|sincroniza)\s+(?:la\s+)?rama(?:\s+de\s+(?:esta|la)\s+issue)?\b/iu,
];

export function parseBranchSyncCommandArguments(
  args: readonly string[],
): BranchSyncCommandParseResult {
  let dryRun = false;
  let useAgent = true;
  let parentOverride: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--no-agent") {
      useAgent = false;
      continue;
    }
    if (argument.startsWith("--from=")) {
      parentOverride = argument.slice("--from=".length).trim();
    } else if (argument === "--from") {
      parentOverride = args[index + 1]?.trim();
      index += 1;
    } else {
      return { valid: false, reason: `Unsupported sync-branch option: ${argument}.` };
    }
    if (!parentOverride) {
      return { valid: false, reason: "--from requires a parent branch name." };
    }
  }

  return { valid: true, options: { dryRun, useAgent, parentOverride } };
}

export function isNaturalLanguageBranchSyncRequest(
  raw: string,
  botUsername: string,
): boolean {
  const normalizedBot = botUsername.trim().replace(/^@/u, "");
  if (!normalizedBot) return false;
  const mention = new RegExp(`@${escapeRegExp(normalizedBot)}\\b`, "iu");
  return mention.test(raw) && NATURAL_LANGUAGE_PATTERNS.some((pattern) => pattern.test(raw));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
