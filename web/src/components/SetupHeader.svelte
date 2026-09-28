<script lang="ts">
  import ThemeSwitch from './ThemeSwitch.svelte';
  export let repository: string | undefined;
</script>

<header class="topbar">
  <div class="breadcrumb"><span>SETUP</span><span aria-hidden="true">/</span><strong>{repository ?? 'Connecting…'}</strong></div>
  <div class="top-actions"><span class="local-pill"><span class="pulse-dot"></span> LOCAL SESSION</span><ThemeSwitch /></div>
</header>
