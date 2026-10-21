<script lang="ts">
  import { SETUP_DOCUMENTATION } from '../../../src/application/contracts/setup_documentation';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { verificationSetupText } from '../i18n/verificationSetupCopy';
</script>

<p>{tr('botRenewal', $setupLocale)}</p>
<p>{verificationSetupText('result', $setupLocale)} <a href={SETUP_DOCUMENTATION.verification} target="_blank" rel="noopener noreferrer">{verificationSetupText('guide', $setupLocale)} ↗</a></p>
<p>{tr('setupNextWorkflow', $setupLocale)} <a href={SETUP_DOCUMENTATION.firstWorkflow} target="_blank" rel="noopener noreferrer">{tr('firstWorkflowGuide', $setupLocale)} ↗</a></p>
