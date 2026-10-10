<script lang="ts">
  import type { SetupDiscoveryStatus } from '../../../src/application/contracts/web_setup_view';
  import { tr, type SetupMessageKey } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let kind: 'checks' | 'projects';
  export let status: SetupDiscoveryStatus | undefined;
  export let truncated = false;
  const checkKeys: Partial<Record<SetupDiscoveryStatus, SetupMessageKey>> = {
    observed: 'checksObserved', 'no-recent-runs': 'checksNoRecent',
    'no-verifiable-checks': 'checksNoVerifiable', 'permission-denied': 'checksDenied', unavailable: 'checksUnavailable',
  };
  const projectKeys: Partial<Record<SetupDiscoveryStatus, SetupMessageKey>> = {
    observed: 'projectsObserved', empty: 'projectsEmpty', 'permission-denied': 'projectsDenied',
    unavailable: 'projectsUnavailable', unsupported: 'projectsUnsupported',
  };
  $: key = status ? (kind === 'checks' ? checkKeys[status] : projectKeys[status]) : undefined;
</script>

{#if key}<p class="discovery-notice" role="status">{tr(key, $setupLocale)}</p>{/if}
{#if status === 'observed' || status === 'empty' || status === 'no-recent-runs' || status === 'no-verifiable-checks'}
  <p class="field-help">{tr(kind === 'checks' ? 'checksDiscoveryScope' : 'projectsDiscoveryScope', $setupLocale)}</p>
{/if}
{#if truncated}<p class="field-help">{tr('discoveryTruncated', $setupLocale)}</p>{/if}
