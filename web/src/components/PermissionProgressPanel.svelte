<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import { setupLocale } from '../i18n/localeStore';
  import { permissionName, permissionTerm } from '../i18n/permissionTerms';
  import { permissionProgressCopy, permissionProgressError } from '../i18n/permissionProgress';

  export let permissions: NonNullable<WebSetupView['permissions']>;
  $: latest = permissions.progress?.at(-1);
  function phase(id: string) { return permissions.progress?.filter(item => item.requirementId === id).at(-1); }
</script>

<section class="permission-progress card" aria-labelledby="permission-progress-title">
  <h2 id="permission-progress-title">{permissionProgressCopy($setupLocale, 'title')}</h2>
  <p>{permissionProgressCopy($setupLocale, 'lead')}</p>
  <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
    {#if latest}{permissionName($setupLocale, permissions.requirements?.find(item => item.id === latest.requirementId)?.permission ?? latest.requirementId)}: {permissionProgressCopy($setupLocale, latest.phase)}{/if}
  </div>
  <ol>
    {#each permissions.requirements ?? [] as requirement (requirement.id)}
      {@const current = phase(requirement.id)}
      <li class:permission-progress-done={current?.phase === 'verified'} class:permission-progress-failed={current?.phase === 'failed'}>
        <span class="permission-progress-symbol" aria-hidden="true">{current?.phase === 'verified' ? '✓' : current?.phase === 'failed' ? '!' : current ? '◌' : '·'}</span>
        <span><strong>{permissionName($setupLocale, requirement.permission)}</strong><small>{permissionTerm($setupLocale, requirement.scope)} · {permissionTerm($setupLocale, requirement.level)}</small>{#if current?.phase === 'failed' && current.detail}<small>{permissionProgressError($setupLocale, current.detail)}</small>{/if}</span>
        <span class="permission-progress-state">{permissionProgressCopy($setupLocale, current?.phase ?? 'pending')}</span>
      </li>
    {/each}
  </ol>
</section>
