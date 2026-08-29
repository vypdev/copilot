export interface ManagedBranchCreationPayload {
  baseBranchName: string;
  baseBranchUrl: string;
  newBranchName: string;
  newBranchUrl: string;
}

export interface ManagedBranchPresentationInput {
  owner: string;
  repo: string;
  developmentBranch: string;
  baseBranchName: string;
  baseBranchUrl: string;
  branchName: string;
  newBranchUrl: string;
  isRename: boolean;
  commitPrefix?: string;
}

export interface ManagedBranchPresentation {
  step: string;
  reminders: string[];
}

export function readManagedBranchCreationPayload(
  payload: unknown,
): ManagedBranchCreationPayload | undefined {
  if (!isRecord(payload)) return undefined;
  const baseBranchName = readRequiredText(payload.baseBranchName);
  const baseBranchUrl = readRequiredText(payload.baseBranchUrl);
  const newBranchName = readRequiredText(payload.newBranchName);
  const newBranchUrl = readRequiredText(payload.newBranchUrl);
  if (!baseBranchName || !baseBranchUrl || !newBranchName || !newBranchUrl) return undefined;

  return {
    baseBranchName,
    baseBranchUrl,
    newBranchName,
    newBranchUrl,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readRequiredText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function buildManagedBranchPresentation(
  input: ManagedBranchPresentationInput,
): ManagedBranchPresentation {
  const developmentUrl = `https://github.com/${input.owner}/${input.repo}/tree/${input.developmentBranch}`;
  const inlineCode = "`";
  const fence = "```";
  const step = input.isRename
    ? `The branch **${input.baseBranchName}** was renamed to [**${input.branchName}**](${input.newBranchUrl}).`
    : `The branch [**${input.baseBranchName}**](${input.baseBranchUrl}) was used to create [**${input.branchName}**](${input.newBranchUrl}).`;
  const reminder = input.isRename
    ? `Open a Pull Request from [${inlineCode}${input.branchName}${inlineCode}](${input.newBranchUrl}) to [${inlineCode}${input.developmentBranch}${inlineCode}](${developmentUrl}). [New PR](https://github.com/${input.owner}/${input.repo}/compare/${input.developmentBranch}...${input.branchName}?expand=1)`
    : `Open a Pull Request from [${inlineCode}${input.branchName}${inlineCode}](${input.newBranchUrl}) to [${inlineCode}${input.baseBranchName}${inlineCode}](${input.baseBranchUrl}). [New PR](https://github.com/${input.owner}/${input.repo}/compare/${input.baseBranchName}...${input.branchName}?expand=1)`;

  return {
    step,
    reminders: [
      `Check out the branch:\n> ${fence}bash\n> git fetch -v && git checkout ${input.branchName}\n> ${fence}`,
      ...(input.commitPrefix
        ? [`Commit the needed changes with this prefix:\n> ${fence}\n>${input.commitPrefix}\n> ${fence}`]
        : []),
      reminder,
    ],
  };
}
