import { expect, it, vi } from 'vitest';
import { collectionReviewsFixture, collectionPreview, collectionConfirm } from '../fixtures/collection_reviews.ts';
import { collectionSettings } from '../fixtures/collection_coordinator.ts';
import { activeCollectionPolicy } from '../fixtures/collection_policy.ts';

it.each(['settings-revision', 'policy-revision'] as const)('a coincident pause with the same selector and wrong %s cannot be attributed to the retained stop', async mismatch => {
    const f = collectionReviewsFixture(collectionSettings(true)); f.values.set('diagnostics', activeCollectionPolicy());
    const preview = await collectionPreview(f, 'stop'); const execute = vi.mocked(f.policies.execute).getMockImplementation()!;
    vi.mocked(f.policies.execute).mockImplementation(async (...args) => {
        const value = await execute(...args);
        if (args[1].type === 'read' && value.state === 'ready' && value.policy.mode === 'paused' && value.policy.receipt) {
            return { ...value, policy: { ...value.policy, revision: mismatch === 'policy-revision' ? value.policy.revision + 1 : value.policy.revision,
                receipt: { ...value.policy.receipt, beforeRevision: mismatch === 'policy-revision' ? value.policy.receipt.beforeRevision + 1 : value.policy.receipt.beforeRevision,
                    settingsRevision: mismatch === 'settings-revision' ? value.policy.receipt.settingsRevision + 1 : value.policy.receipt.settingsRevision } } };
        }
        return value;
    });
    expect((await collectionConfirm(f, preview.operationId)).policy).toMatchObject({ observation: 'paused', attributed: false });
});
