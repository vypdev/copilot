<script lang="ts">
  import { SETUP_DOCUMENTATION } from '../../../src/application/contracts/setup_documentation';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
</script>

<p>{tr('botRenewal', $setupLocale)}</p>
<p>{tr('setupNextWorkflow', $setupLocale)} <a href={SETUP_DOCUMENTATION.firstWorkflow} target="_blank" rel="noopener noreferrer">{tr('firstWorkflowGuide', $setupLocale)} ↗</a></p>
