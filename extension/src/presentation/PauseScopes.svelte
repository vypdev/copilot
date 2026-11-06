<script lang="ts">
    import type { TemporaryPauses } from '../domain/temporary_pauses.ts';
    import type { PauseCopy } from '../domain/pause_copy.ts';
    let { value, precaution, copy }: { value: TemporaryPauses; precaution: boolean; copy: Readonly<PauseCopy> } = $props();
</script>
<dl data-pause-scopes>
    <dt>{copy.emergency}</dt><dd>{value.emergency ? copy.on : copy.off}</dd>
    <dt>{copy.extra}</dt><dd>{precaution ? copy.on : copy.off}</dd>
    <dt>{copy.tabs}</dt><dd><span>{value.tabs.length}</span>
        {#if value.tabs.length}<ul>{#each value.tabs as tabId (tabId)}<li>{`${copy.tab} ${tabId}`}</li>{/each}</ul>{/if}
    </dd>
</dl>
