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
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return undefined;
  const value = payload as Record<string, unknown>;
  if (
    typeof value.baseBranchName !== "string" ||
    typeof value.baseBranchUrl !== "string" ||
    typeof value.newBranchName !== "string" ||
    typeof value.newBranchUrl !== "string" ||
    value.baseBranchName.length === 0 ||
    value.baseBranchUrl.length === 0 ||
    value.newBranchName.length === 0 ||
    value.newBranchUrl.length === 0
  ) return undefined;

  return {
    baseBranchName: value.baseBranchName,
    baseBranchUrl: value.baseBranchUrl,
    newBranchName: value.newBranchName,
    newBranchUrl: value.newBranchUrl,
  };
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
