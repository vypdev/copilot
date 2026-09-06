import {
    DEFAULT_COPILOT_LIFECYCLE_LABELS,
    activityLabel,
    lifecycleLabelDefinitions,
    lifecycleStateFromLabels,
    lifecycleStateLabel,
    managedLifecycleLabelDefinitions,
    waitingStateLabel,
} from '../copilot_lifecycle';

describe('Copilot lifecycle policy', () => {
    it('provides a complete, unique default label catalog', () => {
        const definitions = lifecycleLabelDefinitions();
        expect(definitions).toHaveLength(7);
        expect(new Set(definitions.map(definition => definition.name)).size).toBe(definitions.length);
        expect(definitions.map(definition => definition.name)).toContain(DEFAULT_COPILOT_LIFECYCLE_LABELS.ready);
    });

    it('keeps activity and waiting labels outside the stable lifecycle state', () => {
        const definitions = managedLifecycleLabelDefinitions();
        expect(definitions).toHaveLength(10);
        expect(activityLabel()).toBe('state:ai-processing');
        expect(waitingStateLabel('awaiting-maintainer')).toBe('state:awaiting-maintainer');
        expect(definitions.find(definition => definition.name === activityLabel())).toMatchObject({ category: 'activity' });
        expect(definitions.find(definition => definition.name === waitingStateLabel('awaiting-issue-author'))).toMatchObject({ category: 'waiting' });
    });

    it('maps stable state to labels and labels back to state case-insensitively', () => {
        const label = lifecycleStateLabel('changes-requested');
        expect(lifecycleStateFromLabels(['bug', label.toUpperCase()])).toBe('changes-requested');
        expect(lifecycleStateFromLabels(['bug'])).toBeUndefined();
        expect(lifecycleStateFromLabels(['state:ai-processing'])).toBeUndefined();
        expect(lifecycleStateFromLabels(['copilot:state:ready'])).toBeUndefined();
    });
});
