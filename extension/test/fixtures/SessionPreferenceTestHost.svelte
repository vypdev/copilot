<script lang="ts">
    import type { Writable } from 'svelte/store';
    import type { SessionPreferenceRouteProps } from '../../src/domain/session_preference_ui.ts';
    import SessionPreferencesPage from '../../src/presentation/SessionPreferencesPage.svelte';
    let { value }: { value: Writable<SessionPreferenceRouteProps> } = $props();
</script>
<SessionPreferencesPage context={$value.context} actions={$value.actions}/>
