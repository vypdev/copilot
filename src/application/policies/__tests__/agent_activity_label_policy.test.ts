import { replaceAgentActivityLabel } from '../agent_activity_label_policy';

describe('agent activity label policy', () => {
    it('adds the activity label without touching stable or waiting labels', () => {
        expect(replaceAgentActivityLabel(
            ['feature', 'state:in-progress', 'state:awaiting-maintainer'],
            'state:ai-processing',
            true,
        )).toEqual(['feature', 'state:in-progress', 'state:awaiting-maintainer', 'state:ai-processing']);
    });

    it('removes the activity label case-insensitively', () => {
        expect(replaceAgentActivityLabel(
            ['feature', 'STATE:AI-PROCESSING', 'state:ready'],
            'state:ai-processing',
            false,
        )).toEqual(['feature', 'state:ready']);
    });

    it('does not duplicate the activity label', () => {
        expect(replaceAgentActivityLabel(
            ['state:ai-processing', 'STATE:AI-PROCESSING'],
            'state:ai-processing',
            true,
        )).toEqual(['state:ai-processing']);
    });
});
