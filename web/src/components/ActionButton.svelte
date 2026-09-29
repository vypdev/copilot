<script lang="ts">
  export let label: string;
  export let variant: 'primary' | 'secondary' = 'primary';
  export let disabled = false;
  export let arrow = false;
  export let onClick: () => void | Promise<void>;
</script>

<button type="button" class={variant} {disabled} onclick={onClick}>
  {label}{#if arrow}<span aria-hidden="true">→</span>{/if}
</button>
