<script lang="ts">
  import type { WebSetupView } from '../../../src/application/contracts/web_setup_view';
  import StatusBanner from './StatusBanner.svelte';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let report: NonNullable<WebSetupView['permissions']>['report'] = undefined;
</script>
{#if report?.checks.some(check => check.incident === 'secret-collision')}
  <StatusBanner tone="warning" title={tr('permissionSecretCollision', $setupLocale)} message={tr('permissionSecretCollisionAction', $setupLocale)} />
{:else if report?.checks.some(check => check.cleanupPending)}
  <StatusBanner tone="warning" title={tr('permissionProbeCleanupPending', $setupLocale)} message={tr('permissionProbeCleanupAction', $setupLocale)} />
{/if}
