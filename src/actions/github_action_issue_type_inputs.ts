import { INPUT_KEYS } from '../utils/constants';
import type { IssueTypeConfigurationValues } from './configuration_builders';

function readIssueType(getInput: (key: string) => string, name: string, description: string, color: string) {
    return { name: getInput(name), description: getInput(description), color: getInput(color) };
}

export function readGithubActionIssueTypeInputs(getInput: (key: string) => string): IssueTypeConfigurationValues {
    return {
        task: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_TASK, INPUT_KEYS.ISSUE_TYPE_TASK_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_TASK_COLOR),
        bug: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_BUG, INPUT_KEYS.ISSUE_TYPE_BUG_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_BUG_COLOR),
        feature: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_FEATURE, INPUT_KEYS.ISSUE_TYPE_FEATURE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_FEATURE_COLOR),
        documentation: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_DOCUMENTATION_COLOR),
        maintenance: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_MAINTENANCE_COLOR),
        hotfix: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_HOTFIX, INPUT_KEYS.ISSUE_TYPE_HOTFIX_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HOTFIX_COLOR),
        release: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_RELEASE, INPUT_KEYS.ISSUE_TYPE_RELEASE_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_RELEASE_COLOR),
        question: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_QUESTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_QUESTION_COLOR),
        help: readIssueType(getInput, INPUT_KEYS.ISSUE_TYPE_HELP, INPUT_KEYS.ISSUE_TYPE_HELP_DESCRIPTION, INPUT_KEYS.ISSUE_TYPE_HELP_COLOR),
    };
}
