<script lang="ts">
    import type { CollectionSettled } from '../domain/collection_review.ts';
    import type { HistoryCopy } from '../domain/history_copy_types.ts';
    let { value, copy }: { value: CollectionSettled['preference']; copy: HistoryCopy } = $props();
</script>
<dl><dt>{copy.text.stepResult}</dt><dd>{copy.steps[value.state]}</dd>
    {#if 'acknowledgement' in value}<dt>{copy.text.acknowledgement}</dt><dd>{copy.acknowledgements[value.acknowledgement]}</dd>{/if}
    {#if value.state === 'unknown'}<dt>{copy.text.observation}</dt><dd>{copy.observations[value.observation]}</dd>
        <dt>{copy.text.revision}</dt><dd>{value.observedRevision ?? copy.text.unknown}</dd>
    {:else if 'revision' in value}<dt>{copy.text.revision}</dt><dd>{value.revision}</dd>{/if}
</dl>
