<script lang="ts">
  import type { SetupWorkflowPatStorageNotice } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let storage: SetupWorkflowPatStorageNotice;
</script>

<div class="banner warning" role="note">
  <strong>{tr('patStorageTitle', $setupLocale)}</strong>
  <p>{tr(storage.replacesExisting ? (storage.scope === 'repository' ? 'patRepositoryReplace' : 'patOrganizationReplace') :
    (storage.scope === 'repository' ? 'patRepositoryCreate' : 'patOrganizationCreate'), $setupLocale, { destination: storage.destination })}</p>
  <p>{tr('patReplacementChecks', $setupLocale)}</p>
  {#if storage.scope === 'organization' && storage.replacesExisting}<p>{tr('patOrganizationImpact', $setupLocale)}</p>{/if}
</div>
