<script lang="ts">
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import ResourceProgress from './ResourceProgress.svelte';
  export let effects: NonNullable<WebSetupView['resultDetail']>['effects'] = undefined;
</script>

<section class="card waiting-card"><div class="spinner" aria-hidden="true"></div><h2>{tr('working', $setupLocale)}</h2><p>{tr('workingBody', $setupLocale)}</p>{#if effects?.length}<ResourceProgress {effects} />{/if}</section>
