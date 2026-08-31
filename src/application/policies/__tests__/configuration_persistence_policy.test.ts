import { ACTIONS } from '../../../data/model/action_types';
import { SingleAction } from '../../../data/model/single_action';
import { shouldPersistConfiguration } from '../configuration_persistence_policy';

describe('shouldPersistConfiguration', () => {
    it('persists configuration for regular event executions', () => {
        expect(shouldPersistConfiguration({
            isSingleAction: false,
            singleAction: new SingleAction('', '', '', '', ''),
        } as never)).toBe(true);
    });

    it('persists recommendation state for the recommendation single action', () => {
        expect(shouldPersistConfiguration({
            isSingleAction: true,
            singleAction: new SingleAction(ACTIONS.RECOMMEND_STEPS, '1', '', '', ''),
        } as never)).toBe(true);
    });

    it.each([
        ACTIONS.CREATE_TAG,
        ACTIONS.CREATE_RELEASE,
        ACTIONS.PUBLISH_GITHUB_ACTION,
        ACTIONS.DEPLOYED,
        ACTIONS.THINK,
        ACTIONS.CHECK_PROGRESS,
        ACTIONS.DETECT_POTENTIAL_PROBLEMS,
        ACTIONS.INITIAL_SETUP,
    ])('does not persist configuration for the %s single action', (actionName) => {
        expect(shouldPersistConfiguration({
            isSingleAction: true,
            singleAction: new SingleAction(actionName, actionName === ACTIONS.INITIAL_SETUP ? '0' : '1', '', '', ''),
        } as never)).toBe(false);
    });
});
