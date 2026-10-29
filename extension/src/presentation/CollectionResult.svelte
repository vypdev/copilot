<script lang="ts">
    import type { CollectionSettled } from '../domain/collection_review.ts';
    import type { HistoryCopy } from '../domain/history_copy_types.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    import SettingsPhaseFact from './SettingsPhaseFact.svelte';
    let { value, copy, center }: { value: CollectionSettled; copy: HistoryCopy; center: CenterCopy } = $props();
</script>
<p role="status">{copy.reasons[value.reason]}</p><p>{copy.text.historical}</p>
<h3>{copy.text.phasePreference}</h3>
<SettingsPhaseFact value={value.preference} {copy}/>
<p>{value.preferenceVerifiedAtObservation ? copy.text.verified : copy.text.unverified}</p>
{#if value.observedPreference}<dl><dt>{copy.text.preference}</dt><dd>{copy.text[value.observedPreference.enabled ? 'on' : 'off']}</dd>
    <dt>{copy.text.revision}</dt><dd>{value.observedPreference.revision}</dd></dl>{/if}
<h3>{copy.text.phasePolicy}</h3><dl>
    <dt>{copy.text.acknowledgement}</dt><dd>{copy.policyAcks[value.policy.acknowledgement]}</dd>
    <dt>{copy.text.observation}</dt><dd>{value.policy.observation === 'active' ? copy.text.active : value.policy.observation === 'paused' ? copy.text.paused : copy.text.unknown}</dd>
    <dt>{copy.text.verified}</dt><dd>{center.messages[value.policy.attributed ? 'yes' : 'no']}</dd>
    <dt>{copy.text.revision}</dt><dd>{value.policy.revision ?? copy.text.unknown}</dd>
    <dt>{copy.text.admission}</dt><dd>{center.messages[value.admittedAtObservation ? 'yes' : 'no']}</dd>
    <dt>{copy.text.sourceCurrent}</dt><dd>{center.messages[value.sourceCurrentAtObservation ? 'yes' : 'no']}</dd>
</dl>
