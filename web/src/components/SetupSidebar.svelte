<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { managementCopy } from '../i18n/managementCopy';
  export let management = false;
  export let journey: WebSetupView['journey'] | undefined;
  const steps: SetupMessageKey[] = ['repository', 'choices', 'setupPat', 'plan', 'botPat', 'apply'];
</script>

<aside class="sidebar" aria-label={tr('progress', $setupLocale)}>
  <div class="brand"><span class="brand-mark" aria-hidden="true">✳</span><div><strong>copilot</strong><small>{tr('studio', $setupLocale)}</small></div></div>
  {#if management}
    <div class="rail-caption">{managementCopy($setupLocale).title}</div>
    <p class="description">{managementCopy($setupLocale).quickHelp}</p>
  {:else}
  <div class="rail-caption">{tr('journey', $setupLocale)}</div>
  <ol class="steps">
    {#each steps as step, index}
      <li class:current={journey?.position === index + 1} class:completed={(journey?.position ?? 0) > index + 1} aria-current={journey?.position === index + 1 ? 'step' : undefined}>
        <span class="step-index" aria-hidden="true">{(journey?.position ?? 0) > index + 1 ? '✓' : String(index + 1).padStart(2, '0')}</span>
        <span>{tr(step, $setupLocale)}</span>
      </li>
    {/each}
  </ol>
  {/if}
  <div class="sidebar-note"><span aria-hidden="true">◈</span><div><strong>{tr('localDesign', $setupLocale)}</strong><p>{tr('localDesignBody', $setupLocale)}</p></div></div>
</aside>
