<script lang="ts">
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  type Theme = 'system' | 'light' | 'dark';
  let theme: Theme = 'system';
  $: document.documentElement.dataset.theme = theme;
</script>

<div class="theme-switch" role="group" aria-label={tr('theme', $setupLocale)}>
  <button class:active={theme === 'system'} onclick={() => theme = 'system'} aria-pressed={theme === 'system'} aria-label={tr('themeSystem', $setupLocale)} title={tr('themeSystem', $setupLocale)}>{tr('themeAuto', $setupLocale)}</button>
  <button class:active={theme === 'light'} onclick={() => theme = 'light'} aria-pressed={theme === 'light'} aria-label={tr('themeLight', $setupLocale)} title={tr('themeLight', $setupLocale)}>☀</button>
  <button class:active={theme === 'dark'} onclick={() => theme = 'dark'} aria-pressed={theme === 'dark'} aria-label={tr('themeDark', $setupLocale)} title={tr('themeDark', $setupLocale)}>☾</button>
</div>
