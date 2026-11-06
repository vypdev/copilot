import type { CollectionPolicyFact, CollectionSettled } from '../domain/collection_review.ts';
import { sameSettingsContent } from '../domain/settings_operation.ts';
import type { CollectionCoordinator } from './collection_coordinator.ts';
import type { CollectionEffectPlan, CollectionPreparation } from './collection_transition_ports.ts';
import type { CollectionPolicyStore } from './collection_policy_ports.ts';
import { collectionCurrent, pauseCollectionPolicy, readCollectionPolicy, type CollectionRestrictionResult } from './collection_restrictions.ts';
import type { SettingsRepository } from './settings_repository.ts';
import { collectionPolicyTrace, completeCollection, type CollectionOperationTrace } from './collection_observation_ports.ts';
import { attemptCollectionPolicy } from './collection_policy_attempt.ts';
import { reportPolicyObservation } from './collection_policy_observation_ports.ts';
import { commitCollectionPreference } from './collection_preference_commit.ts';

export type { CollectionEffectPlan } from './collection_transition_ports.ts';
const NO_POLICY: CollectionPolicyFact = Object.freeze({ acknowledgement: 'not-attempted', observation: 'unavailable', revision: null, attributed: false });
function initialFacts(plan: CollectionEffectPlan): CollectionSettled {
    return { state: 'settled', action: plan.action, kind: plan.kind, reason: 'unavailable', preference: { state: 'not-attempted', revision: plan.before.revision },
        observedPreference: null, preferenceVerifiedAtObservation: false, policy: NO_POLICY, admittedAtObservation: false, sourceCurrentAtObservation: false };
}
function restrictionFact(result: CollectionRestrictionResult): CollectionPolicyFact {
    return { acknowledgement: result.fact.acknowledgement, observation: result.fact.observation, revision: result.fact.policyRevision,
        attributed: result.attributed };
}
function continuation(plan: CollectionEffectPlan, prepared: CollectionPreparation | undefined): { stamp: object; revision: number } | null {
    if (!prepared || prepared.beforeStamp !== plan.capture.stamp || prepared.result.observed.state !== 'ready') return null;
    const policy = prepared.result.observed.policy; const before = plan.capture.policy;
    if (policy.mode !== 'paused' || !before) return null;
    const matches = before.mode === 'paused' ? policy.revision === before.revision && prepared.result.operationId === null
        : policy.revision === before.revision + 1 && prepared.result.operationId !== null && policy.receipt?.id === prepared.result.operationId
            && policy.receipt.beforeRevision === before.revision && policy.receipt.settingsRevision === plan.before.revision;
    return matches ? { stamp: prepared.afterStamp, revision: policy.revision } : null;
}
function release(held: { release(): void } | null): void { try { held?.release(); } catch { /* Preserve already observed facts. */ } }

/** Stop attempts its durable restriction even when preferences cannot advance or be read. */
async function executeStop(plan: CollectionEffectPlan, repository: SettingsRepository, coordinator: CollectionCoordinator,
    store: CollectionPolicyStore, source: () => boolean, stamp: object | null, trace?: CollectionOperationTrace | null): Promise<CollectionSettled> {
    let facts = initialFacts(plan); let staged = false; let held: ReturnType<SettingsRepository['reserveMutations']> = null;
    const finish = (reason: CollectionSettled['reason']): CollectionSettled => {
        const result = { ...facts, reason, sourceCurrentAtObservation: collectionCurrent(source) }; completeCollection(trace, result); return result;
    };
    try {
        held = repository.reserveMutations(); if (!held) return finish('busy');
        const current = () => held!.current() && collectionCurrent(source) && coordinator.owns(plan.kind, stamp!);
        if (!collectionCurrent(current)) return finish('stale');
        const result = await pauseCollectionPolicy(store, plan.kind, plan.before.revision, () => plan.policyId, current, collectionPolicyTrace(trace, 'pause'));
        facts = { ...facts, policy: restrictionFact(result) };
        coordinator.observeStop(plan.kind, stamp!, result);
        if (!collectionCurrent(current)) return finish('stale');
        if (plan.before.center[plan.kind]) {
            staged = coordinator.stageStop(plan.id, plan.kind, plan.before.revision, result);
            if (!staged) return finish('busy');
            const releasing = held; release(releasing);
            if (releasing.current()) return finish('unavailable');
            held = null;
            facts = { ...facts, preference: await commitCollectionPreference(plan, repository, source, trace) };
            coordinator.takePreparation(plan.id);
        } else facts = { ...facts, preference: { state: 'already', revision: plan.before.revision } };
        const inspected = await repository.inspect();
        if (inspected.loaded.state !== 'ready' || inspected.loaded.migrated) return finish('preference-unconfirmed');
        const observed = inspected.loaded.settings;
        const changed = plan.before.center[plan.kind];
        const expected = { ...plan.before, revision: plan.before.revision + (changed ? 1 : 0), center: { ...plan.before.center, [plan.kind]: false } };
        const verified = sameSettingsContent(observed, expected) && (!changed || inspected.operation?.id === plan.id);
        facts = { ...facts, observedPreference: { enabled: observed.center[plan.kind], revision: observed.revision }, preferenceVerifiedAtObservation: verified };
        return finish(!collectionCurrent(source) ? 'stale' : verified ? 'done' : 'preference-unconfirmed');
    } catch { return finish('unavailable'); }
    finally { if (staged) coordinator.clearStagedStop(plan.id); release(held); }
}

/** One retained plan, ordered independent effects. Never retries an unknown native submission. */
export async function executeCollectionPlan(plan: CollectionEffectPlan, repository: SettingsRepository, coordinator: CollectionCoordinator,
    store: CollectionPolicyStore, source: () => boolean, prePaused: object | null, trace?: CollectionOperationTrace | null): Promise<CollectionSettled> {
    if (plan.action === 'stop') return executeStop(plan, repository, coordinator, store, source, prePaused, trace);
    let facts = initialFacts(plan);
    const finish = (reason: CollectionSettled['reason']): CollectionSettled => {
        const result = { ...facts, reason, sourceCurrentAtObservation: collectionCurrent(source) }; completeCollection(trace, result); return result;
    };
    if (!plan.capture.policy) return finish('policy-unconfirmed');
    let stamp = plan.capture.stamp; let policyRevision = plan.capture.policy.revision;
    const changed = !plan.before.center[plan.kind];
    if (changed) {
        facts = { ...facts, preference: await commitCollectionPreference(plan, repository, source, trace) };
        const prepared = coordinator.takePreparation(plan.id)?.[plan.kind];
        if (prepared) facts = { ...facts, policy: restrictionFact(prepared.result) };
        const next = continuation(plan, prepared);
        if (!next) return finish(collectionCurrent(source) ? 'policy-unconfirmed' : 'stale');
        stamp = next.stamp; policyRevision = next.revision;
    } else facts = { ...facts, preference: { state: 'already', revision: plan.before.revision } };
    if (!collectionCurrent(source)) return finish('stale');
    let preferences: ReturnType<SettingsRepository['reserveMutations']> = null;
    try {
        preferences = repository.reserveMutations(); if (!preferences) return finish('busy');
        const inspected = await repository.inspect(); const revision = plan.before.revision + (changed ? 1 : 0);
        if (inspected.loaded.state !== 'ready' || inspected.loaded.migrated) return finish('preference-unconfirmed');
        const observed = inspected.loaded.settings;
        facts = { ...facts, observedPreference: { enabled: observed.center[plan.kind], revision: observed.revision } };
        const expected = { ...plan.before, revision, center: { ...plan.before.center, [plan.kind]: true } };
        if (!sameSettingsContent(observed, expected) || (changed && inspected.operation?.id !== plan.id)) return finish('changed');
        facts = { ...facts, preferenceVerifiedAtObservation: true };
        const current = () => preferences!.current() && collectionCurrent(source);
        if (!current()) return finish('stale');
        await coordinator.refresh(); if (!current()) return finish('stale');
        const activation = coordinator.reserveActivation(plan.kind, stamp, revision, policyRevision, plan.policyId);
        if (!activation) return finish('changed');
        try {
            const guard = () => current() && activation.current(); const policyTrace = collectionPolicyTrace(trace, 'activation');
            const result = await attemptCollectionPolicy(store, plan.kind, { type: 'set', expectedRevision: policyRevision, mode: 'active',
                operationId: plan.policyId, settingsRevision: revision }, guard, policyTrace);
            const acknowledgement = result.state === 'written' || result.state === 'replayed' ? 'accepted'
                : result.state === 'unavailable' && result.effect === 'unknown' ? 'unknown' : 'not-applied';
            facts = { ...facts, policy: { acknowledgement, observation: 'unavailable', revision: null, attributed: false } };
            const read = await readCollectionPolicy(store, plan.kind);
            if (read.state !== 'ready') { reportPolicyObservation(policyTrace, facts.policy); return finish('policy-unconfirmed'); }
            const attributed = read.policy.mode === 'active' && read.policy.revision === policyRevision + 1
                && read.policy.receipt?.id === plan.policyId && read.policy.receipt.beforeRevision === policyRevision
                && read.policy.receipt.settingsRevision === revision;
            facts = { ...facts, policy: { acknowledgement, observation: read.policy.mode, revision: read.policy.revision, attributed } };
            reportPolicyObservation(policyTrace, facts.policy);
            const admitted = (acknowledgement === 'accepted' || acknowledgement === 'unknown') && attributed && activation.accept(read.policy, guard);
            facts = { ...facts, admittedAtObservation: admitted };
            return finish(admitted ? 'done' : 'policy-unconfirmed');
        } finally { release(activation); }
    } catch { return finish('unavailable'); }
    finally { release(preferences); }
}
