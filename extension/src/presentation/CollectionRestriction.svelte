<script lang="ts">
    import type { CollectionRestrictionFact } from '../domain/history_state.ts';
    import type { HistoryCopy } from '../domain/history_copy_types.ts';
    import type { CenterCopy } from '../domain/center_copy_types.ts';
    let { value, copy, center }: { value: CollectionRestrictionFact; copy: HistoryCopy; center: CenterCopy } = $props();
</script>
<details><summary><span>{copy.text.phasePolicy}</span> · <span>{copy.text.historical}</span></summary>
    <dl><dt>{copy.text.acknowledgement}</dt><dd>{copy.policyAcks[value.acknowledgement]}</dd>
        <dt>{copy.text.observation}</dt><dd>{value.observation === 'active' ? copy.text.active : value.observation === 'paused' ? copy.text.paused : copy.text.unknown}</dd>
        <dt>{copy.text.sourceCurrent}</dt><dd>{center.messages[value.sourceCurrentAtObservation ? 'yes' : 'no']}</dd>
        <dt>{copy.text.revision}</dt><dd>{value.policyRevision ?? copy.text.unknown}</dd></dl>
</details>
