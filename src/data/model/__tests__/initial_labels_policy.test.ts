import { ACTIONS } from '../action_types';
import { shouldSkipInitialLabelsFetch } from '../initial_labels_policy';

describe('initial labels policy', () => {
    it('skips only for the initial setup single action', () => {
        expect(shouldSkipInitialLabelsFetch(true, ACTIONS.INITIAL_SETUP)).toBe(true);
        expect(shouldSkipInitialLabelsFetch(false, ACTIONS.INITIAL_SETUP)).toBe(false);
        expect(shouldSkipInitialLabelsFetch(true, ACTIONS.THINK)).toBe(false);
    });
});
