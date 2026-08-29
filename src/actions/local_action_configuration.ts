import type { ProjectDetailQueryPort } from '../application/ports/project_detail_ports';
import type { ActionInputValues } from './action_input_source';
import { getActionInputsWithDefaults } from '../utils/yml_utils';
import {
    readLocalAgentConfiguration,
    readLocalCoreConfiguration,
    readLocalLabelsAndIssueTypes,
    readLocalProjectConfiguration,
    readLocalWorkflowConfiguration,
} from './local_action_configuration_sections';

export async function buildLocalActionConfiguration(
    additionalParams: ActionInputValues,
    projectRepository: ProjectDetailQueryPort,
) {
    const actionInputs = getActionInputsWithDefaults();
    const core = readLocalCoreConfiguration(additionalParams, actionInputs);
    const agent = readLocalAgentConfiguration(additionalParams, actionInputs);
    const projects = await readLocalProjectConfiguration(
        additionalParams,
        actionInputs,
        projectRepository,
        core.token,
    );
    const labelsAndIssueTypes = readLocalLabelsAndIssueTypes(additionalParams, actionInputs);
    const workflow = readLocalWorkflowConfiguration(additionalParams, actionInputs);

    return {
        ...core,
        ...agent,
        ...projects,
        ...labelsAndIssueTypes.labels,
        ...labelsAndIssueTypes.issueTypes,
        ...workflow,
    };
}

export type LocalActionConfiguration = Awaited<ReturnType<typeof buildLocalActionConfiguration>>;
