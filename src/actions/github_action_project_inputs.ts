import { INPUT_KEYS } from '../utils/constants';
import type { ProjectConfigurationValues } from './configuration_builders';
import type { ProjectDetail } from '../data/model/project_detail';

export function readGithubActionProjectInputs(
    getInput: (key: string) => string,
    projects: ProjectDetail[],
): ProjectConfigurationValues {
    return {
        projects,
        issueCreated: getInput(INPUT_KEYS.PROJECT_COLUMN_ISSUE_CREATED),
        pullRequestCreated: getInput(INPUT_KEYS.PROJECT_COLUMN_PULL_REQUEST_CREATED),
        issueInProgress: getInput(INPUT_KEYS.PROJECT_COLUMN_ISSUE_IN_PROGRESS),
        pullRequestInProgress: getInput(INPUT_KEYS.PROJECT_COLUMN_PULL_REQUEST_IN_PROGRESS),
    };
}
