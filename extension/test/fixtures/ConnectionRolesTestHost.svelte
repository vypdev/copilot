<script lang="ts">
    import type { Writable } from 'svelte/store';
    import type { ConnectionPanelProps } from '../../src/domain/connection_ui.ts';
    import type { RelocationTarget } from '../../src/domain/repository_relocation.ts';
    import ConnectionsPanel from '../../src/presentation/ConnectionsPanel.svelte';
    import RoleSelectionReview from '../../src/presentation/RoleSelectionReview.svelte';
    let { value }: { value: Writable<ConnectionPanelProps & { target: RelocationTarget | null; close(): void }> } = $props();
</script>
{#if $value.target}<RoleSelectionReview {...$value} target={$value.target}/>{:else}<ConnectionsPanel {...$value}/>{/if}
