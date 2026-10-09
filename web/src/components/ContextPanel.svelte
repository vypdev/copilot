<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { permissionName, permissionStatus, permissionTerm } from '../i18n/permissionTerms';
  import { permissionCopy } from '../i18n/permissionCopy';
  import { permissionEvidence } from '../i18n/permissionEvidence';
  export let view: WebSetupView;
</script>

<aside class="context-column" aria-label={tr('setup', $setupLocale)}>
  <section class="context-card"><span class="context-icon" aria-hidden="true">⌘</span><h2>{tr('repoFocus', $setupLocale)}</h2><p>{tr('repoFocusBody', $setupLocale)}</p><code><bdi>{view.repository}</bdi></code></section>
  {#if view.permissions}
    <section class="context-card permissions"><span class="context-icon" aria-hidden="true">◇</span><h2>{view.permissions.role === 'setup' ? tr('setupPat', $setupLocale) : tr('botPat', $setupLocale)} {tr('access', $setupLocale)}</h2><p>{view.permissions.report ? tr('readOnlyCheck', $setupLocale) : tr('provisionalGrants', $setupLocale)}</p>
      <ul>{#each (view.permissions.report?.checks ?? view.permissions.requirements ?? []) as item}<li><span>{permissionName($setupLocale, item.permission)}{#if $setupLocale !== 'en' && permissionName($setupLocale, item.permission) !== item.permission} <small><bdi>GitHub · {item.permission}</bdi></small>{/if}<small>{permissionTerm($setupLocale, item.scope)} · {permissionTerm($setupLocale, item.applicability)}</small><small>{permissionCopy($setupLocale, item.reason)}</small>{#if item.condition}<small>{permissionCopy($setupLocale, item.condition)}</small>{/if}{#if 'status' in item}<small>{permissionEvidence(item, $setupLocale)}</small>{/if}</span><strong>{permissionTerm($setupLocale, item.level)}{#if 'status' in item && permissionStatus($setupLocale, item.status)}<small>{permissionStatus($setupLocale, item.status)}</small>{/if}</strong></li>{/each}</ul>
      <small>{tr('conditionalGrants', $setupLocale)}</small>
    </section>
  {:else}
    <section class="context-card"><span class="context-icon" aria-hidden="true">◇</span><h2>{tr('permissionsFollow', $setupLocale)}</h2><p>{tr('permissionsFollowBody', $setupLocale)}</p></section>
  {/if}
</aside>
