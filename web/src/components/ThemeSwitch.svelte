<script lang="ts">
  type Theme = 'system' | 'light' | 'dark';
  let theme: Theme = 'system';
  $: document.documentElement.dataset.theme = theme;
</script>

<div class="theme-switch" role="group" aria-label="Color theme">
  <button class:active={theme === 'system'} onclick={() => theme = 'system'} aria-pressed={theme === 'system'} title="Follow system theme">Auto</button>
  <button class:active={theme === 'light'} onclick={() => theme = 'light'} aria-pressed={theme === 'light'} title="Light theme">☀</button>
  <button class:active={theme === 'dark'} onclick={() => theme = 'dark'} aria-pressed={theme === 'dark'} title="Dark theme">☾</button>
</div>
