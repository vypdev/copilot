import type { Execution } from "../../../../data/model/execution";
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
  param: Execution,
  commitPrefix: string,
): CommitNotificationContent {
  const theme = resolveTheme(param);
  let body = `
# ${theme.title}

**Changes on branch \`${param.commit.branch}\`:**

`;
  let shouldWarn = false;

  for (const commit of param.commit.commits) {
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

  if (theme.image && param.images.imagesOnCommit) {
    body += `
${SEPARATOR}

![image](${theme.image})
`;
  }
  return { body, shouldWarn };
}

function resolveTheme(param: Execution): CommitNotificationTheme {
  if (param.release.active) return { title: "🚀 Release News", image: getRandomElement(param.images.commitReleaseGifs) };
  if (param.hotfix.active) return { title: "🔥🐛 Hotfix News", image: getRandomElement(param.images.commitHotfixGifs) };
  if (param.isBugfix) return { title: "🐛 Bugfix News", image: getRandomElement(param.images.commitBugfixGifs) };
  if (param.isFeature) return { title: "✨ Feature News", image: getRandomElement(param.images.commitFeatureGifs) };
  if (param.isDocs) return { title: "📝 Documentation News", image: getRandomElement(param.images.commitDocsGifs) };
  if (param.isChore) return { title: "🔧 Chore News", image: getRandomElement(param.images.commitChoreGifs) };
  return { title: "🪄 Automatic News", image: getRandomElement(param.images.commitAutomaticActions) };
}

function hasUnexpectedPrefix(commitMessage: string, commitPrefix: string): boolean {
  return commitPrefix.length > 0
    && !commitMessage.startsWith(commitPrefix)
    && !commitMessage.startsWith("Merge branch ")
    && !commitMessage.startsWith("gh-action: ");
}
