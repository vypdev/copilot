<script lang="ts">
    let { id, selected, emptyValue, placeholder, options, change, disabled = false }: { id: string; selected: string; emptyValue: string;
        placeholder: string; options: Readonly<Record<string, string>>; disabled?: boolean; change(value: string): void } = $props();
</script>
<select {id} {disabled} value={selected === emptyValue ? undefined : selected}
    onchange={event => change(event.currentTarget.selectedIndex === 0 ? emptyValue : event.currentTarget.value)}>
    {#each [null, ...Object.entries(options)] as option}
        <option value={option?.[0]}>{option ? option[1] : placeholder}</option>
    {/each}
</select>
