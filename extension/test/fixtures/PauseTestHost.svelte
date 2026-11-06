<script lang="ts">
    import type { Writable } from 'svelte/store';
    import type { PauseRouteProps } from '../../src/domain/pause_ui.ts';
    import PausesPage from '../../src/presentation/PausesPage.svelte';
    let { value }: { value: Writable<PauseRouteProps> } = $props();
</script>
<PausesPage context={$value.context} actions={$value.actions}/>
