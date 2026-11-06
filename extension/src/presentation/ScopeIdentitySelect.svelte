<script lang="ts">
    import type { ScopeChoice } from '../domain/profile_context.ts';
    import { scopeChoiceText } from '../domain/profile_context.ts';
    let { id, choices, selected, choose, unavailable, select }: {
        id: string; choices: readonly ScopeChoice[]; selected: string; choose: string; unavailable: string; select(value: string): void;
    } = $props();
</script>
<select {id} required bind:value={() => selected || undefined, value => select(value ?? '')}>
    {#each [null, ...choices] as choice (choice?.value ?? 'unselected')}
        <option value={choice?.value}>{choice ? scopeChoiceText(choice, unavailable) : choose}</option>
    {/each}
</select>
