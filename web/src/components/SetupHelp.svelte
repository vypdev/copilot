<script lang="ts">
  import { SETUP_DOCUMENTATION } from '../../../src/application/contracts/setup_documentation';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  import { verificationSetupText } from '../i18n/verificationSetupCopy';
</script>

<nav class="setup-help" aria-label={tr('setupHelp', $setupLocale)}>
  <div class="help-links">
    <a href={SETUP_DOCUMENTATION.tutorial} target="_blank" rel="noopener noreferrer">{tr('setupTutorial', $setupLocale)} ↗</a>
    <a href={SETUP_DOCUMENTATION.firstWorkflow} target="_blank" rel="noopener noreferrer">{tr('firstWorkflowGuide', $setupLocale)} ↗</a>
    <a href={SETUP_DOCUMENTATION.recovery} target="_blank" rel="noopener noreferrer">{tr('setupRecovery', $setupLocale)} ↗</a>
    <a href={SETUP_DOCUMENTATION.verification} target="_blank" rel="noopener noreferrer">{verificationSetupText('guide', $setupLocale)} ↗</a>
  </div>
  <p>{tr('setupHelpHint', $setupLocale)}</p>
</nav>

<style>
  .setup-help { margin-bottom: 1.5rem; }
  .help-links { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; }
  a { font-size: .875rem; text-underline-offset: .2em; }
  p { font-size: .8rem; margin: .4rem 0 0; }
</style>
