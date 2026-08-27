import { ACTIONS } from '../../utils/constants';

export function shouldSkipInitialLabelsFetch(
    isSingleAction: boolean,
    currentSingleAction: string | undefined,
): boolean {
    return isSingleAction && currentSingleAction === ACTIONS.INITIAL_SETUP;
}
