import type { SettingsCommit } from '../domain/settings_result.ts';
import type { CollectionEffectPlan } from './collection_transition_ports.ts';
import type { SettingsRepository } from './settings_repository.ts';
import { collectionPolicyTrace, reportCollection, reportCollectionPreference, type CollectionOperationTrace } from './collection_observation_ports.ts';

/** Same canonical primary path with or without its per-call secondary observer. */
export async function commitCollectionPreference(plan: CollectionEffectPlan, repository: SettingsRepository,
    source: () => boolean, trace?: CollectionOperationTrace | null): Promise<SettingsCommit> {
    const after = { ...plan.before, center: { ...plan.before.center, [plan.kind]: plan.action === 'start' } };
    let result: SettingsCommit;
    try {
        result = trace ? await repository.commit(after, plan.before.revision, plan.id, source,
            () => reportCollection(trace, 'preferenceSubmitted'), kind => kind === plan.kind ? collectionPolicyTrace(trace, 'pause') : null)
            : await repository.commit(after, plan.before.revision, plan.id, source);
    } catch { result = { state: 'unknown', acknowledgement: 'unknown', observation: 'unavailable', observedRevision: null }; }
    reportCollectionPreference(trace, result); return result;
}
