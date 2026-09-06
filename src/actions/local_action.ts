








import { createLocalActionCompositionRoot } from '../infrastructure/composition/local_action_composition_root';

import { mainRun } from './common_action';
import { renderLocalActionResults } from './local_action_output';
import { buildLocalActionConfiguration } from './local_action_configuration';
import { buildLocalActionExecution } from './local_action_execution';
import { requireRepositoryCoordinates } from './repository_context';
import { createSynchronizeAgentActivityUseCase } from '../infrastructure/composition/agent_activity_composition_root';

export async function runLocalAction(
    additionalParams: Record<string, unknown>
): Promise<void> {
    const repository = requireRepositoryCoordinates(additionalParams?.repo);
    const normalizedParams = { ...(additionalParams ?? {}), repo: repository };
    const composition = createLocalActionCompositionRoot();

    const configuration = await buildLocalActionConfiguration(normalizedParams, composition.projectBoard.query);
    const execution = buildLocalActionExecution(configuration, normalizedParams);

    const results = await mainRun(
        execution,
        composition.projectBoard.command,
        composition.latestTagQuery,
        undefined,
        createSynchronizeAgentActivityUseCase(),
    );

    renderLocalActionResults(results);
}
