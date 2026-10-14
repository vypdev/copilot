<script lang="ts">
  import ThemeSwitch from './ThemeSwitch.svelte';
  import LanguageSwitch from './LanguageSwitch.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let repository: string | undefined;
  export let closed = false;
</script>

<header class="topbar">
  <div class="breadcrumb"><span>{tr('setup', $setupLocale)}</span><span aria-hidden="true">/</span><strong><bdi>{repository ?? tr('connecting', $setupLocale)}</bdi></strong></div>
  <div class="top-actions"><span class="local-pill">{#if !closed}<span class="pulse-dot" aria-hidden="true"></span>{/if} {tr(closed ? 'sessionClosed' : 'localSession', $setupLocale)}</span><LanguageSwitch /><ThemeSwitch /></div>
</header>
