<script lang="ts">
    import type { InventoryFilters } from '../domain/inventory_filters.ts';
    import type { InventoryCopy } from '../domain/inventory_copy.ts';
    import InventorySelect from './InventorySelect.svelte';
    let { value, copy, profiles, change, clear }: { value: InventoryFilters; copy: InventoryCopy; profiles: Readonly<Record<string, string>>;
        change(key: keyof InventoryFilters, value: string | boolean): void; clear(): void } = $props();
    const groups = $derived([
        { key: 'family', label: copy.family, options: copy.families }, { key: 'surface', label: copy.surface, options: copy.surfaces },
        { key: 'mode', label: copy.mode, options: copy.modes }, { key: 'permission', label: copy.permission, options: copy.permissions },
        { key: 'phase', label: copy.phase, options: { current: copy.current, later: copy.later } },
        { key: 'source', label: copy.source, options: copy.sources },
        { key: 'profile', label: copy.profile, options: profiles },
        { key: 'setting', label: copy.setting, options: { enabled: copy.enabled, disabled: copy.disabled, paused: copy.paused } },
    ] as const);
</script>
<label for="inventory-search">{copy.search}</label>
<input id="inventory-search" type="search" maxlength="200" value={value.query} oninput={event => change('query', event.currentTarget.value)} />
<fieldset class="inventory-filters"><legend>{copy.filters}</legend>
    <div class="cards">
        {#each groups as group}
            <div><label for={`inventory-${group.key}`}>{group.label}</label>
                <InventorySelect id={`inventory-${group.key}`} selected={value[group.key]} emptyValue="" placeholder={copy.all} options={group.options} change={selected => change(group.key, selected)} />
            </div>
        {/each}
    </div>
    <label class="checkbox-label"><input type="checkbox" checked={value.favorites} onchange={event => change('favorites', event.currentTarget.checked)} />{copy.favorites}</label>
    <button type="button" onclick={clear}>{copy.clear}</button>
</fieldset>
