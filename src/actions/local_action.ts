








import { createLocalActionCompositionRoot } from '../infrastructure/composition/local_action_composition_root';

import { mainRun } from './common_action';
import { renderLocalActionResults } from './local_action_output';
import { buildLocalActionConfiguration } from './local_action_configuration';
import { buildLocalActionExecution } from './local_action_execution';
import { requireRepositoryCoordinates } from './repository_context';
import { createSynchronizeAgentActivityUseCase } from '../infrastructure/composition/agent_activity_composition_root';
import type { Result } from '../data/model/result';
import { runAtApplicationErrorBoundary } from '../application/errors/application_error_context';
import { INPUT_KEYS } from '../application/contracts/input_keys';
import { assertLocalSingleActionAllowed } from '../application/policies/local_single_action_policy';

export async function runLocalAction(
    additionalParams: Record<string, unknown>,
    options: { render?: boolean } = {},
): Promise<Result[]> {
    return runAtApplicationErrorBoundary(async () => {
        const requestedAction = additionalParams[INPUT_KEYS.SINGLE_ACTION];
        assertLocalSingleActionAllowed(requestedAction);
        const repository = requireRepositoryCoordinates(additionalParams?.repo);
        const normalizedParams = { ...(additionalParams ?? {}), repo: repository };
        const composition = createLocalActionCompositionRoot();

        const configuration = await buildLocalActionConfiguration(normalizedParams, composition.projectBoard.query);
        const execution = buildLocalActionExecution(configuration, normalizedParams);

        const results = await mainRun(
            execution,
            composition.projectBoard.command,
            composition.latestTagQuery,
            'local',
            undefined,
            createSynchronizeAgentActivityUseCase(),
        );

        if (options.render !== false) renderLocalActionResults(results);
        return results;
    });
}
