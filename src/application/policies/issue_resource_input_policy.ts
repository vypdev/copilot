import { INPUT_KEYS } from '../contracts/input_keys';
import { resolveActionInput as input, type ActionInputValues } from '../../domain/action_input_source';

function readIssueType(
    additionalParams: ActionInputValues,
    actionInputs: ActionInputValues,
    name: string,
    description: string,
    color: string,
) {
    return {
        name: input(additionalParams, actionInputs, name),
        description: input(additionalParams, actionInputs, description),
        color: input(additionalParams, actionInputs, color),
    };
}

export function readLocalLabelsAndIssueTypes(
    additionalParams: ActionInputValues,
    actionInputs: ActionInputValues,
) {
    const label = (key: string) => input(additionalParams, actionInputs, key);
    const issueTypeBug = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_BUG, INPUT_KEYS.ISSUE_TYPE_BUG_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_BUG_COLOR);
    const issueTypeHotfix = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_HOTFIX, INPUT_KEYS.ISSUE_TYPE_HOTFIX_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HOTFIX_COLOR);
    const issueTypeFeature = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_FEATURE, INPUT_KEYS.ISSUE_TYPE_FEATURE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_FEATURE_COLOR);
    const issueTypeDocumentation = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_COLOR);
    const issueTypeMaintenance = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_COLOR);
    const issueTypeRelease = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_RELEASE, INPUT_KEYS.ISSUE_TYPE_RELEASE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_RELEASE_COLOR);
    const issueTypeQuestion = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_QUESTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_COLOR);
    const issueTypeHelp = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_HELP, INPUT_KEYS.ISSUE_TYPE_HELP_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HELP_COLOR);
    const issueTypeTask = readIssueType(additionalParams, actionInputs, INPUT_KEYS.ISSUE_TYPE_TASK, INPUT_KEYS.ISSUE_TYPE_TASK_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_TASK_COLOR);
    return {
        labels: {
            bugfixLabel: label(INPUT_KEYS.BUGFIX_LABEL),
            bugLabel: label(INPUT_KEYS.BUG_LABEL),
            hotfixLabel: label(INPUT_KEYS.HOTFIX_LABEL),
            enhancementLabel: label(INPUT_KEYS.ENHANCEMENT_LABEL),
            featureLabel: label(INPUT_KEYS.FEATURE_LABEL),
            releaseLabel: label(INPUT_KEYS.RELEASE_LABEL),
            questionLabel: label(INPUT_KEYS.QUESTION_LABEL),
            helpLabel: label(INPUT_KEYS.HELP_LABEL),
            deployLabel: label(INPUT_KEYS.DEPLOY_LABEL),
            deployedLabel: label(INPUT_KEYS.DEPLOYED_LABEL),
            docsLabel: label(INPUT_KEYS.DOCS_LABEL),
            documentationLabel: label(INPUT_KEYS.DOCUMENTATION_LABEL),
            choreLabel: label(INPUT_KEYS.CHORE_LABEL),
            maintenanceLabel: label(INPUT_KEYS.MAINTENANCE_LABEL),
            priorityHighLabel: label(INPUT_KEYS.PRIORITY_HIGH_LABEL),
            priorityMediumLabel: label(INPUT_KEYS.PRIORITY_MEDIUM_LABEL),
            priorityLowLabel: label(INPUT_KEYS.PRIORITY_LOW_LABEL),
            priorityNoneLabel: label(INPUT_KEYS.PRIORITY_NONE_LABEL),
            sizeXxlLabel: label(INPUT_KEYS.SIZE_XXL_LABEL),
            sizeXlLabel: label(INPUT_KEYS.SIZE_XL_LABEL),
            sizeLLabel: label(INPUT_KEYS.SIZE_L_LABEL),
            sizeMLabel: label(INPUT_KEYS.SIZE_M_LABEL),
            sizeSLabel: label(INPUT_KEYS.SIZE_S_LABEL),
            sizeXsLabel: label(INPUT_KEYS.SIZE_XS_LABEL),
            lifecycle: {
                aiProcessing: label(INPUT_KEYS.STATE_AI_PROCESSING_LABEL),
                planned: label(INPUT_KEYS.STATE_PLANNED_LABEL),
                specifying: label(INPUT_KEYS.STATE_SPECIFYING_LABEL),
                working: label(INPUT_KEYS.STATE_WORKING_LABEL),
                reviewing: label(INPUT_KEYS.STATE_REVIEWING_LABEL),
                changesRequested: label(INPUT_KEYS.STATE_CHANGES_REQUESTED_LABEL),
                verified: label(INPUT_KEYS.STATE_VERIFIED_LABEL),
                ready: label(INPUT_KEYS.STATE_READY_LABEL),
                blocked: label(INPUT_KEYS.STATE_BLOCKED_LABEL),
                awaitingMaintainer: label(INPUT_KEYS.STATE_AWAITING_MAINTAINER_LABEL),
                awaitingIssueAuthor: label(INPUT_KEYS.STATE_AWAITING_ISSUE_AUTHOR_LABEL),
            },
        },
        issueTypes: {
            issueTypeBug: issueTypeBug.name,
            issueTypeBugDescription: issueTypeBug.description,
            issueTypeBugColor: issueTypeBug.color,
            issueTypeHotfix: issueTypeHotfix.name,
            issueTypeHotfixDescription: issueTypeHotfix.description,
            issueTypeHotfixColor: issueTypeHotfix.color,
            issueTypeFeature: issueTypeFeature.name,
            issueTypeFeatureDescription: issueTypeFeature.description,
            issueTypeFeatureColor: issueTypeFeature.color,
            issueTypeDocumentation: issueTypeDocumentation.name,
            issueTypeDocumentationDescription: issueTypeDocumentation.description,
            issueTypeDocumentationColor: issueTypeDocumentation.color,
            issueTypeMaintenance: issueTypeMaintenance.name,
            issueTypeMaintenanceDescription: issueTypeMaintenance.description,
            issueTypeMaintenanceColor: issueTypeMaintenance.color,
            issueTypeRelease: issueTypeRelease.name,
            issueTypeReleaseDescription: issueTypeRelease.description,
            issueTypeReleaseColor: issueTypeRelease.color,
            issueTypeQuestion: issueTypeQuestion.name,
            issueTypeQuestionDescription: issueTypeQuestion.description,
            issueTypeQuestionColor: issueTypeQuestion.color,
            issueTypeHelp: issueTypeHelp.name,
            issueTypeHelpDescription: issueTypeHelp.description,
            issueTypeHelpColor: issueTypeHelp.color,
            issueTypeTask: issueTypeTask.name,
            issueTypeTaskDescription: issueTypeTask.description,
            issueTypeTaskColor: issueTypeTask.color,
        },
    };
}
