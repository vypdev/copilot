import { Ai } from '../data/model/ai';
import { Hotfix } from '../data/model/hotfix';
import { Release } from '../data/model/release';
import { SingleAction } from '../data/model/single_action';
import { Welcome } from '../data/model/welcome';
import { buildExecution } from './execution_builder';
import { buildEmoji, buildImages, buildIssue, buildIssueTypes, buildLabels, buildLocale, buildProjects, buildPullRequest, buildTokens, buildWorkflows } from './configuration_builders';
import { buildBranches } from './branches_builder';
import { buildSizeThresholds } from './size_threshold_builder';
import type { LocalActionConfiguration } from './local_action_configuration';

export function buildLocalActionExecution(
    configuration: LocalActionConfiguration,
    additionalParams: Record<string, unknown>,
) {
    const {
        debug, singleAction, singleActionIssue, singleActionVersion, singleActionTitle, singleActionChangelog,
        commitPrefixBuilder, branchManagementAlways, reopenIssueOnPush, issueDesiredAssigneesCount,
        pullRequestDesiredAssigneesCount, pullRequestDesiredReviewersCount, pullRequestMergeTimeout,
        titleEmoji, branchManagementEmoji, imageConfiguration, token, agentModel,
        aiPullRequestDescription, aiPullRequestDescriptionMode, aiMembersOnly, aiIgnoreFiles, aiIncludeReasoning, bugbotSeverity,
        bugbotCommentLimit, bugbotFixVerifyCommands, agentTasks, branchManagementLauncherLabel, bugLabel,
        bugfixLabel, hotfixLabel, enhancementLabel, featureLabel, releaseLabel, questionLabel, helpLabel,
        deployLabel, deployedLabel, docsLabel, documentationLabel, choreLabel, maintenanceLabel,
        priorityHighLabel, priorityMediumLabel, priorityLowLabel, priorityNoneLabel, sizeXxlLabel, sizeXlLabel,
        sizeLLabel, sizeMLabel, sizeSLabel, sizeXsLabel, lifecycle, issueTypeTask, issueTypeTaskDescription,
        issueTypeTaskColor, issueTypeBug, issueTypeBugDescription, issueTypeBugColor, issueTypeFeature,
        issueTypeFeatureDescription, issueTypeFeatureColor, issueTypeDocumentation, issueTypeDocumentationDescription,
        issueTypeDocumentationColor, issueTypeMaintenance, issueTypeMaintenanceDescription, issueTypeMaintenanceColor,
        issueTypeHotfix, issueTypeHotfixDescription, issueTypeHotfixColor, issueTypeRelease, issueTypeReleaseDescription,
        issueTypeReleaseColor, issueTypeQuestion, issueTypeQuestionDescription, issueTypeQuestionColor, issueTypeHelp,
        issueTypeHelpDescription, issueTypeHelpColor, issueLocale, pullRequestLocale, sizeXxlThresholdLines,
        sizeXxlThresholdFiles, sizeXxlThresholdCommits, sizeXlThresholdLines, sizeXlThresholdFiles,
        sizeXlThresholdCommits, sizeLThresholdLines, sizeLThresholdFiles, sizeLThresholdCommits, sizeMThresholdLines,
        sizeMThresholdFiles, sizeMThresholdCommits, sizeSThresholdLines, sizeSThresholdFiles, sizeSThresholdCommits,
        sizeXsThresholdLines, sizeXsThresholdFiles, sizeXsThresholdCommits, mainBranch, developmentBranch,
        featureTree, bugfixTree, hotfixTree, releaseTree, docsTree, choreTree, releaseWorkflow, hotfixWorkflow,
        projects, projectColumnIssueCreated, projectColumnPullRequestCreated, projectColumnIssueInProgress,
        projectColumnPullRequestInProgress, welcomeTitle, welcomeMessages,
    } = configuration;
    return buildExecution({
        debug,
        singleAction: new SingleAction(
            singleAction,
            singleActionIssue,
            singleActionVersion,
            singleActionTitle,
            singleActionChangelog,
        ),
        commitPrefixBuilder,
        issue: buildIssue(branchManagementAlways, reopenIssueOnPush, issueDesiredAssigneesCount, additionalParams),
        pullRequest: buildPullRequest(pullRequestDesiredAssigneesCount, pullRequestDesiredReviewersCount, pullRequestMergeTimeout, additionalParams),
        emoji: buildEmoji(titleEmoji, branchManagementEmoji),
        images: buildImages({
            onIssue: imageConfiguration.onIssue,
            onPullRequest: imageConfiguration.onPullRequest,
            onCommit: imageConfiguration.onCommit,
            issue: imageConfiguration.issue,
            pullRequest: imageConfiguration.pullRequest,
            commit: imageConfiguration.commit,
        }),
        tokens: buildTokens(token),
        ai: new Ai(
            '',
            agentModel,
            aiPullRequestDescription,
            aiMembersOnly,
            aiIgnoreFiles,
            aiIncludeReasoning,
            bugbotSeverity,
            bugbotCommentLimit,
            bugbotFixVerifyCommands,
            agentTasks,
            aiPullRequestDescriptionMode,
        ),
        labels: buildLabels({
            branching: { launcher: branchManagementLauncherLabel },
            workflow: { bug: bugLabel, bugfix: bugfixLabel, hotfix: hotfixLabel, enhancement: enhancementLabel, feature: featureLabel, release: releaseLabel, question: questionLabel, help: helpLabel, deploy: deployLabel, deployed: deployedLabel, docs: docsLabel, documentation: documentationLabel, chore: choreLabel, maintenance: maintenanceLabel },
            priorities: { high: priorityHighLabel, medium: priorityMediumLabel, low: priorityLowLabel, none: priorityNoneLabel },
            sizes: { xxl: sizeXxlLabel, xl: sizeXlLabel, l: sizeLLabel, m: sizeMLabel, s: sizeSLabel, xs: sizeXsLabel },
            lifecycle,
        }),
        issueTypes: buildIssueTypes({
            task: { name: issueTypeTask, description: issueTypeTaskDescription, color: issueTypeTaskColor },
            bug: { name: issueTypeBug, description: issueTypeBugDescription, color: issueTypeBugColor },
            feature: { name: issueTypeFeature, description: issueTypeFeatureDescription, color: issueTypeFeatureColor },
            documentation: { name: issueTypeDocumentation, description: issueTypeDocumentationDescription, color: issueTypeDocumentationColor },
            maintenance: { name: issueTypeMaintenance, description: issueTypeMaintenanceDescription, color: issueTypeMaintenanceColor },
            hotfix: { name: issueTypeHotfix, description: issueTypeHotfixDescription, color: issueTypeHotfixColor },
            release: { name: issueTypeRelease, description: issueTypeReleaseDescription, color: issueTypeReleaseColor },
            question: { name: issueTypeQuestion, description: issueTypeQuestionDescription, color: issueTypeQuestionColor },
            help: { name: issueTypeHelp, description: issueTypeHelpDescription, color: issueTypeHelpColor },
        }),
        locale: buildLocale(issueLocale, pullRequestLocale),
        sizeThresholds: buildSizeThresholds({
            xxl: { lines: sizeXxlThresholdLines, files: sizeXxlThresholdFiles, commits: sizeXxlThresholdCommits },
            xl: { lines: sizeXlThresholdLines, files: sizeXlThresholdFiles, commits: sizeXlThresholdCommits },
            l: { lines: sizeLThresholdLines, files: sizeLThresholdFiles, commits: sizeLThresholdCommits },
            m: { lines: sizeMThresholdLines, files: sizeMThresholdFiles, commits: sizeMThresholdCommits },
            s: { lines: sizeSThresholdLines, files: sizeSThresholdFiles, commits: sizeSThresholdCommits },
            xs: { lines: sizeXsThresholdLines, files: sizeXsThresholdFiles, commits: sizeXsThresholdCommits },
        }),
        branches: buildBranches({
            main: mainBranch,
            defaultBranch: mainBranch,
            development: developmentBranch,
            featureTree,
            bugfixTree,
            hotfixTree,
            releaseTree,
            docsTree,
            choreTree,
        }),
        release: new Release(),
        hotfix: new Hotfix(),
        workflows: buildWorkflows(releaseWorkflow, hotfixWorkflow),
        projects: buildProjects({
            projects,
            issueCreated: projectColumnIssueCreated,
            pullRequestCreated: projectColumnPullRequestCreated,
            issueInProgress: projectColumnIssueInProgress,
            pullRequestInProgress: projectColumnPullRequestInProgress,
        }),
        welcome: new Welcome(welcomeTitle ?? '', welcomeMessages ?? []),
        inputs: additionalParams,
    });
}
