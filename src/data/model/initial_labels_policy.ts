import { ACTIONS } from './action_types';

export function shouldSkipInitialLabelsFetch(
    isSingleAction: boolean,
    currentSingleAction: string | undefined,
): boolean {
    return isSingleAction && currentSingleAction === ACTIONS.INITIAL_SETUP;
}
