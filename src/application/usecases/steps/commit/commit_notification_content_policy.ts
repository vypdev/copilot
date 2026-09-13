import type { CommitNotificationContext } from '../../push_single_action_contexts';
import { getRandomElement } from "../../../../utils/list_utils";

const SEPARATOR = "------------------------------------------------------";

interface CommitNotificationTheme {
  title: string;
  image: string | undefined;
}

export interface CommitNotificationContent {
  body: string;
  shouldWarn: boolean;
}

export function buildCommitNotificationContent(
  param: CommitNotificationContext,
  commitPrefix: string,
): CommitNotificationContent {
  const theme = resolveTheme(param);
  let body = `
# ${theme.title}

**Changes on branch \`${param.branch}\`:**

`;
  let shouldWarn = false;

  for (const commit of param.commits) {
    const commitMessage = commit.message ?? "";
    body += `
${SEPARATOR}

- ${commit.id ?? "unknown"} by **${commit.author?.name ?? "unknown"}** (@${commit.author?.username ?? "unknown"})
\`\`\`
${commitMessage.split(`${commitPrefix}: `).join("")}
\`\`\`

`;
    if (hasUnexpectedPrefix(commitMessage, commitPrefix)) shouldWarn = true;
  }

  if (shouldWarn && commitPrefix.length > 0) {
    body += `
${SEPARATOR}
## ⚠️ Attention

One or more commits didn't start with the prefix **${commitPrefix}**.

\`\`\`
${commitPrefix}: created hello-world app
\`\`\`
`;
  }

  if (theme.image && param.imagesOnCommit) {
    body += `
${SEPARATOR}

![image](${theme.image})
`;
  }
  return { body, shouldWarn };
}

function resolveTheme(param: CommitNotificationContext): CommitNotificationTheme {
  const titles: Record<CommitNotificationContext['theme'], string> = {
    release: '🚀 Release News',
    hotfix: '🔥🐛 Hotfix News',
    bugfix: '🐛 Bugfix News',
    feature: '✨ Feature News',
    docs: '📝 Documentation News',
    chore: '🔧 Chore News',
    automatic: '🪄 Automatic News',
  };
  return { title: titles[param.theme], image: getRandomElement([...param.themeImages]) };
}

function hasUnexpectedPrefix(commitMessage: string, commitPrefix: string): boolean {
  return commitPrefix.length > 0
    && !commitMessage.startsWith(commitPrefix)
    && !commitMessage.startsWith("Merge branch ")
    && !commitMessage.startsWith("gh-action: ");
}
