<script lang="ts">
  import type { SetupQuestionExplanation } from '../../../src/application/contracts/web_setup_view';
  import { tr } from '../i18n/catalog';
  import { setupLocale } from '../i18n/localeStore';
  export let explanation: SetupQuestionExplanation | undefined;
  export let helpUrl: string | undefined;
</script>

{#if helpUrl}<p class="question-help-link"><a href={helpUrl} target="_blank" rel="noopener noreferrer">{tr('learnMore', $setupLocale)} ↗</a></p>{/if}
{#if explanation}<details class="question-details"><summary>{tr('whyMatters', $setupLocale)}</summary><dl>
  <dt>{tr('whenApplies', $setupLocale)}</dt><dd>{explanation.when}</dd>
  <dt>{tr('whereConfigured', $setupLocale)}</dt><dd>{explanation.where}</dd>
  <dt>{tr('howToChoose', $setupLocale)}</dt><dd>{explanation.how}</dd>
  <dt>{tr('whyRecommendation', $setupLocale)}</dt><dd>{explanation.why}</dd>
  <dt>{tr('example', $setupLocale)}</dt><dd>{explanation.example}</dd>
  <dt>{tr('effect', $setupLocale)}</dt><dd>{explanation.effect}</dd>
  <dt>{tr('verify', $setupLocale)}</dt><dd>{explanation.verify}</dd>
</dl></details>{/if}
