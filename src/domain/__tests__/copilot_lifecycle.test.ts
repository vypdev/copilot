import {
    DEFAULT_COPILOT_LIFECYCLE_LABELS,
    lifecycleLabelDefinitions,
    lifecycleStateFromLabels,
    lifecycleStateLabel,
} from '../copilot_lifecycle';

describe('Copilot lifecycle policy', () => {
    it('provides a complete, unique default label catalog', () => {
        const definitions = lifecycleLabelDefinitions();
        expect(definitions).toHaveLength(8);
        expect(new Set(definitions.map(definition => definition.name)).size).toBe(definitions.length);
        expect(definitions.map(definition => definition.name)).toContain(DEFAULT_COPILOT_LIFECYCLE_LABELS.ready);
    });

    it('maps state to labels and labels back to state case-insensitively', () => {
        const label = lifecycleStateLabel('changes-requested');
        expect(lifecycleStateFromLabels(['bug', label.toUpperCase()])).toBe('changes-requested');
        expect(lifecycleStateFromLabels(['bug'])).toBeUndefined();
    });
});

